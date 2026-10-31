// Offline mode (28 Oct 2026). Loaded first on every page.
// - Registers /sw.js, which keeps a copy of every page and of the last data each page loaded.
// - Changes made with no signal (/api/update and checklist photos) are queued on the phone (IndexedDB)
//   and sent in the same order when the signal is back. The pages are told "saved" straight away.
// - Pending changes are laid over the saved data, so the board shows them while offline.
// - Items added offline get a temporary negative id; when the add is sent, later changes are pointed
//   at the real id. Photos taken offline get a temporary key "pending/<uuid>.jpg" until uploaded.
(function () {
  "use strict";
  if (window.HCC_OFFLINE) return;
  var DB_NAME = "hcc-offline", Q = "queue", META = "meta";
  var QUEUED = { "/api/update": 1, "/api/photos": 1 };
  var origFetch = window.fetch.bind(window);
  var dbp = null, syncing = false, retryT = null, offlineAt = null;

  // ---------- IndexedDB ----------
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, bad) {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(Q)) d.createObjectStore(Q, { keyPath: "seq", autoIncrement: true });
        if (!d.objectStoreNames.contains(META)) d.createObjectStore(META);
      };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { bad(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, bad) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out;
        Promise.resolve(fn(s)).then(function (v) { out = v; });
        t.oncomplete = function () { ok(out); };
        t.onerror = t.onabort = function () { bad(t.error); };
      });
    });
  }
  function req(r) { return new Promise(function (ok, bad) { r.onsuccess = function () { ok(r.result); }; r.onerror = function () { bad(r.error); }; }); }
  function allQueued() { return tx(Q, "readonly", function (s) { return req(s.getAll()); }).catch(function () { return []; }); }
  function getMeta(k) { return tx(META, "readonly", function (s) { return req(s.get(k)); }).catch(function () { return undefined; }); }
  function setMeta(k, v) { return tx(META, "readwrite", function (s) { s.put(v, k); }); }

  // ---------- helpers ----------
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  function tempId() { return -(Date.now() % 1000000000) - Math.floor(Math.random() * 1000); }
  function jsonRes(obj, status, extra) {
    var h = { "Content-Type": "application/json" }; for (var k in extra || {}) h[k] = extra[k];
    return new Response(JSON.stringify(obj), { status: status || 200, headers: h });
  }
  function isNetErr(e) { return e && (e.name === "TypeError" || e.name === "AbortError"); }
  function hhmm(ts) { return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }); }
  function dayTime(ts) {
    var d = new Date(ts), today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    var day = d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    return (day === today ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }) + " ") + hhmm(ts);
  }
  // Swap temporary ids/keys for real ones in a queued body.
  function remap(body, ids, keys) {
    if (body.id != null && ids[body.id] != null) body.id = ids[body.id];
    if (body.item_id != null && ids[body.item_id] != null) body.item_id = ids[body.item_id];
    if (body.retry_key && keys[body.retry_key]) body.retry_key = keys[body.retry_key].key;
    if (Array.isArray(body.rows)) body.rows.forEach(function (r) {
      (r && Array.isArray(r.photos) ? r.photos : []).forEach(function (ph) {
        var k = ph && keys[ph.key];
        if (k) { ph.key = k.key; if (k.drive_id) ph.drive_id = k.drive_id; }
      });
    });
    return body;
  }
  function describe(e) {
    var b = e.body || {};
    if (e.path === "/api/photos") return "a checklist photo";
    var what = { item_done: b.done ? "ticking off an item" : "un-ticking an item", item_add: "adding \"" + String(b.text || "").slice(0, 40) + "\"",
      item_edit: "editing an item", item_delete: "deleting an item", checklist_save: "a checklist change", pay_paid: "marking a payment",
      pay_add: "adding a payment", pay_set: "editing a payment", chat_status: "moving a chat", chat_rename: "renaming a chat",
      item_triage: "sorting an item", item_untriage: "undoing a sort", chats_done_bulk: "closing chats", app_quick_order: "app quick links" }[b.action];
    return what || "a change";
  }

  // ---------- queue a change ----------
  async function enqueue(path, body) {
    var e = { path: path, body: body, at: new Date().toISOString() };
    var reply = { ok: true, queued: true };
    if (path === "/api/update" && (body.action === "item_add" || body.action === "pay_add")) { e.temp_id = tempId(); reply.id = e.temp_id; }
    if (path === "/api/update" && body.action === "checklist_save") reply.rows = body.rows;
    if (path === "/api/photos" && !body.retry_key) {
      e.temp_key = "pending/" + uuid() + ".jpg";
      reply = { key: e.temp_key, at: e.at, queued: true, drive_error: "Saved on the phone. It uploads when you have signal." };
    }
    if (path === "/api/photos" && body.retry_key) throw new Error("No signal. Copy to Drive when you have signal.");
    await tx(Q, "readwrite", function (s) {
      // A newer whole-list checklist save replaces an older unsent one for the same checklist.
      if (body.action === "checklist_save") {
        return req(s.getAll()).then(function (all) {
          all.forEach(function (x) { if (!x.sending && x.body && x.body.action === "checklist_save" && x.body.id === body.id) s.delete(x.seq); });
          s.add(e);
        });
      }
      s.add(e);
    });
    paint();
    return reply;
  }

  // ---------- send queued changes ----------
  async function sync() {
    if (syncing || !navigator.onLine) return;
    var run = async function () {
      syncing = true;
      var sent = 0, stopped = "";
      try {
        var ids = (await getMeta("ids")) || {}, keys = (await getMeta("keys")) || {};
        for (;;) {
          var all = await allQueued();
          if (!all.length) break;
          var e = all[0];
          remap(e.body, ids, keys);
          var r;
          try {
            r = await origFetch(e.path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e.body), credentials: "same-origin" });
          } catch (err) { stopped = "net"; break; }
          if (r.status === 401 || r.status === 403) { stopped = "auth"; break; }
          if (r.status >= 500 || r.status === 408 || r.status === 429) { stopped = "server"; break; }
          var j = {}; try { j = await r.json(); } catch (x) {}
          if (!r.ok) {
            var fails = (await getMeta("failed")) || [];
            fails.push({ what: describe(e), error: j.error || ("Error " + r.status), at: e.at });
            await setMeta("failed", fails.slice(-20));
          } else {
            if (e.temp_id && j.id) { ids[e.temp_id] = j.id; await setMeta("ids", ids); }
            if (e.temp_key && j.key) { keys[e.temp_key] = { key: j.key, drive_id: j.drive_id || "" }; await setMeta("keys", keys); }
            sent++;
          }
          await tx(Q, "readwrite", function (s) { s.delete(e.seq); });
        }
      } finally { syncing = false; }
      await setMeta("auth", stopped === "auth");
      if (stopped && stopped !== "auth") { clearTimeout(retryT); retryT = setTimeout(sync, 30000); }
      paint();
      if (sent) {
        toastBar(sent + " change" + (sent === 1 ? "" : "s") + " sent");
        window.dispatchEvent(new CustomEvent("hcc-synced", { detail: { sent: sent } }));
      }
    };
    // One tab at a time sends the queue.
    if (navigator.locks && navigator.locks.request) return navigator.locks.request("hcc-sync", { ifAvailable: true }, function (lock) { return lock ? run() : null; });
    return run();
  }

  // ---------- lay pending changes over saved data ----------
  function overlayItems(items, queue, opts) {
    opts = opts || {};
    var byId = {}; items.forEach(function (i) { byId[i.id] = i; });
    queue.forEach(function (e) {
      var b = e.body || {};
      if (e.path === "/api/photos") return;
      var i = byId[b.id];
      switch (b.action) {
        case "item_done": if (i) { i.done = b.done === true; i.done_at = i.done ? e.at : null; if (i.done && b.answer) i.answer = b.answer; } break;
        case "item_add":
          if (opts.pay) break;
          var n = { id: e.temp_id, chat_id: b.chat_id || null, project: b.project || "General", kind: b.kind || "action", text: b.text, due_on: b.due_on || null,
            done: false, done_at: null, created_at: e.at, triaged_at: null, outcome: "", waiting_on: b.kind === "waiting" ? (b.waiting_on || "") : "",
            waiting_since: b.kind === "waiting" ? (b.waiting_since || e.at.slice(0, 10)) : null, answer: "", checklist_rows: [], offline: true };
          items.push(n); byId[n.id] = n; break;
        case "pay_add":
          var p = { id: e.temp_id, project: "ZS Cabling", kind: "action", text: b.text || ("Pay " + b.payee + (b.invoice_ref ? " " + b.invoice_ref : "") + " £" + b.amount_gbp),
            due_on: b.pay_on || null, done: false, created_at: e.at, amount_gbp: String(b.amount_gbp), payee: b.payee, invoice_ref: b.invoice_ref || "",
            pay_on: b.pay_on || null, paid_on: null, waiting_on: "", checklist_rows: [], offline: true };
          items.push(p); byId[p.id] = p; break;
        case "item_edit": if (i) { i.text = b.text; i.due_on = b.due_on || null; if (b.kind) i.kind = b.kind; if (b.project) i.project = b.project; i.waiting_on = i.kind === "waiting" ? (b.waiting_on || "") : ""; if (i.kind === "waiting") i.waiting_since = b.waiting_since || i.waiting_since; } break;
        case "item_delete": if (i) { items.splice(items.indexOf(i), 1); delete byId[b.id]; } break;
        case "item_triage": if (i) { i.triaged_at = e.at; i.outcome = b.outcome; i.done = b.outcome !== "keep"; i.done_at = i.done ? e.at : null; if (i.done && b.answer) i.answer = b.answer; } break;
        case "item_untriage": if (i) { i.triaged_at = null; i.outcome = ""; i.done = false; i.done_at = null; } break;
        case "checklist_save": if (i) { i.checklist_rows = b.rows; i.kind = "checklist"; } break;
        case "pay_set": if (i) { i.amount_gbp = String(b.amount_gbp); i.payee = b.payee; i.invoice_ref = b.invoice_ref; i.pay_on = b.pay_on || null; } break;
        case "pay_paid": if (i) { if (b.paid === false) { i.paid_on = null; i.done = false; i.done_at = null; } else { i.paid_on = b.paid_on; i.done = true; i.done_at = e.at; } } break;
      }
    });
  }
  function overlayChats(chats, queue) {
    var byId = {}; chats.forEach(function (c) { byId[c.id] = c; });
    queue.forEach(function (e) {
      var b = e.body || {}, c = byId[b.id];
      if (b.action === "chat_status" && c) { c.status = b.status; c.updated_at = e.at; }
      if (b.action === "chat_rename" && c) c.title = b.title;
      if (b.action === "chats_done_bulk") (b.ids || []).forEach(function (id) { if (byId[id]) byId[id].status = "done"; });
    });
  }
  function payTotals(data) {
    var t = { unpaid: 0, due_friday: 0, unpaid_n: 0, due_friday_n: 0, paid_60: 0 };
    data.items.forEach(function (i) {
      var a = Number(i.amount_gbp) || 0;
      if (!i.paid_on) { t.unpaid += a; t.unpaid_n++; if (i.pay_on && i.pay_on <= data.friday) { t.due_friday += a; t.due_friday_n++; } }
      else t.paid_60 += a;
    });
    ["unpaid", "due_friday", "paid_60"].forEach(function (k) { t[k] = t[k].toFixed(2); });
    data.totals = t;
  }
  function applyOverlay(url, data, queue) {
    var u = new URL(url, location.href);
    if (u.pathname === "/api/board" && data && Array.isArray(data.items)) {
      overlayItems(data.items, queue);
      if (Array.isArray(data.chats)) overlayChats(data.chats, queue);
    } else if (u.pathname === "/api/lists" && u.searchParams.get("pay") === "1" && data && Array.isArray(data.items)) {
      overlayItems(data.items, queue, { pay: true }); payTotals(data);
    } else if (u.pathname === "/api/lists" && u.searchParams.get("checklist") && data && data.item) {
      overlayItems([data.item], queue);
    }
    return data;
  }
  // A checklist added offline has no saved copy yet: build it from the queue.
  function checklistFromQueue(id, queue) {
    var add = queue.filter(function (e) { return e.temp_id === id; })[0];
    if (!add) return null;
    var b = add.body, item = { id: id, project: b.project || "General", kind: b.kind || "action", text: b.text, due_on: b.due_on || null, done: false, checklist_rows: [], chat_url: null };
    overlayItems([item], queue);
    return { item: item, people: [] };
  }

  // ---------- the fetch wrapper ----------
  window.fetch = async function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || String(input);
    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var u; try { u = new URL(url, location.href); } catch (e) { return origFetch(input, init); }
    if (u.origin !== location.origin || u.pathname.indexOf("/api/") !== 0) return origFetch(input, init);

    if (method === "GET") {
      var queue = await allQueued(), idm = (await getMeta("ids")) || {}, keym = (await getMeta("keys")) || {};
      queue.forEach(function (e) { remap(e.body || {}, idm, keym); });
      if (u.pathname === "/api/lists" && Number(u.searchParams.get("checklist")) < 0) {
        var real = idm[u.searchParams.get("checklist")];
        if (real) { u.searchParams.set("checklist", real); history.replaceState(null, "", location.pathname + "?id=" + real); }
        else { var made = checklistFromQueue(Number(u.searchParams.get("checklist")), queue); return made ? jsonRes(made) : jsonRes({ error: "Not found" }, 404); }
      }
      var r = await origFetch(u.href, init);
      var off = r.headers.get("X-HCC-Offline");
      if (off) { offlineAt = r.headers.get("X-HCC-Saved-At") || offlineAt; isOff = true; paint(); } else if (r.ok) setOffline(false);
      if (!r.ok || !queue.length || (r.headers.get("Content-Type") || "").indexOf("json") < 0) return r;
      var data = await r.json();
      return jsonRes(applyOverlay(u.href, data, queue), r.status, off ? { "X-HCC-Offline": off } : {});
    }

    if (QUEUED[u.pathname] && method === "POST") {
      var body = {}; try { body = JSON.parse((init && init.body) || "{}"); } catch (e) { return origFetch(input, init); }
      var map = (await getMeta("ids")) || {}, kmap = (await getMeta("keys")) || {};
      remap(body, map, kmap);
      var pending = (await allQueued()).length;
      // Keep the order: while anything is waiting, new changes join the queue behind it.
      if (!navigator.onLine || pending || Number(body.id) < 0 || Number(body.item_id) < 0) {
        try { var rep = await enqueue(u.pathname, body); sync(); return jsonRes(rep); }
        catch (e) { return jsonRes({ error: e.message }, 503); }
      }
      try {
        var res = await origFetch(u.href, Object.assign({}, init, { body: JSON.stringify(body) }));
        if (res.ok) setOffline(false);
        return res;
      } catch (e) {
        if (!isNetErr(e)) throw e;
        setOffline(true);
        try { var rep2 = await enqueue(u.pathname, body); return jsonRes(rep2); }
        catch (x) { return jsonRes({ error: x.message }, 503); }
      }
    }

    // Anything else (documents, usage) needs a connection.
    try { return await origFetch(input, init); }
    catch (e) { if (!isNetErr(e)) throw e; setOffline(true); return jsonRes({ error: "No signal. This needs a connection; try again when you have signal." }, 503); }
  };

  // ---------- the banner ----------
  var bar = null, barMsg = null, barBtn = null, toastUntil = 0, isOff = !navigator.onLine;
  function setOffline(v) { if (v !== isOff) { isOff = v; paint(); if (!v) sync(); } }
  function ensureBar() {
    if (bar || !document.body) return bar;
    var css = document.createElement("style");
    css.textContent =
      "#hccBar{position:fixed;left:0;right:0;top:0;z-index:50;display:none;align-items:center;gap:8px;padding:calc(4px + env(safe-area-inset-top)) 12px 4px;font:600 12px/1.3 system-ui,sans-serif;background:#5a3a00;color:#ffe9b8;border-bottom:1px solid #8a5a00}" +
      "#hccBar.ok{background:#123d26;color:#c9f5da;border-color:#1f6b40}#hccBar.bad{background:#4a1515;color:#ffd0d0;border-color:#7a2525}" +
      "#hccBar span{flex:1;min-width:0}#hccBar button{font:inherit;background:transparent;color:inherit;border:1px solid currentColor;border-radius:8px;padding:2px 8px;min-height:26px;cursor:pointer}" +
      "html.hcc-bar body{padding-top:var(--hcc-bh,26px)}html.hcc-bar header{top:var(--hcc-bh,26px)!important}";
    document.head.appendChild(css);
    bar = document.createElement("div"); bar.id = "hccBar"; bar.setAttribute("role", "status"); bar.setAttribute("aria-live", "polite");
    barMsg = document.createElement("span"); barBtn = document.createElement("button"); barBtn.type = "button";
    bar.appendChild(barMsg); bar.appendChild(barBtn); document.body.appendChild(bar);
    return bar;
  }
  function show(text, cls, btnText, onBtn) {
    if (!ensureBar()) return;
    bar.className = cls || ""; barMsg.textContent = text; bar.style.display = text ? "flex" : "none";
    barBtn.style.display = btnText ? "" : "none"; barBtn.textContent = btnText || ""; barBtn.onclick = onBtn || null;
    document.documentElement.classList.toggle("hcc-bar", !!text);
    if (text) document.documentElement.style.setProperty("--hcc-bh", bar.offsetHeight + "px");
  }
  function toastBar(text) {
    toastUntil = Date.now() + 3000; show(text, "ok"); setTimeout(paint, 3100);
  }
  async function paint() {
    if (Date.now() < toastUntil) return;
    var n = (await allQueued()).length, fails = (await getMeta("failed")) || [], auth = await getMeta("auth");
    var waiting = n ? n + " change" + (n === 1 ? "" : "s") + " waiting to send" : "";
    if (fails.length) {
      var f = fails[0];
      return show(fails.length + " change" + (fails.length === 1 ? "" : "s") + " NOT saved. First: " + f.what + " (" + dayTime(f.at) + "): " + f.error + (waiting ? ". " + waiting : ""), "bad", "OK",
        async function () { await setMeta("failed", []); paint(); });
    }
    if (auth && n) return show("Signed out: " + waiting + ". Sign in again to send them.", "bad", "Sign in", function () { location.reload(); });
    if (isOff || !navigator.onLine) return show("Offline" + (offlineAt ? " · showing copy from " + dayTime(offlineAt) : "") + (waiting ? " · " + waiting : " · changes save on the phone"), "");
    if (n) return show("Sending " + waiting.replace(" waiting to send", "") + "…", "", "Retry", function () { sync(); });
    show("");
  }

  window.addEventListener("online", function () { isOff = false; paint(); sync(); });
  window.addEventListener("offline", function () { isOff = true; paint(); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) sync(); });
  document.addEventListener("DOMContentLoaded", function () { paint(); sync(); });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  }
  window.HCC_OFFLINE = { sync: sync, queue: allQueued };
})();