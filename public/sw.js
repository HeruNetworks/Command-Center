// Offline mode (28 Oct 2026). Keeps a copy of every page and of the last data each page loaded,
// so the Command Centre opens with no signal. Changes are queued by /offline.js, not here.
// Pages and data: try the network first (gives up after a few seconds on a weak signal), else the saved copy.
// Bump VERSION when this file changes.
var VERSION = "hcc-v1";
var SHELL = VERSION + "-shell", DATA = VERSION + "-data", PICS = "hcc-photos";
var PAGES = ["/", "/index.html", "/checklist.html", "/pay.html", "/documents.html", "/map.html", "/usage.html",
  "/theme.css", "/board-skin.css", "/lists.css", "/universe.css", "/universe.js?v=2", "/favicon.svg", "/offline.js"];
var NET_WAIT_PAGE = 4000, NET_WAIT_DATA = 8000;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    // One missing file must not stop the rest being saved.
    return Promise.all(PAGES.map(function (p) {
      return fetch(p, { credentials: "same-origin" }).then(function (r) { if (good(r)) return c.put(p, r); }).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== SHELL && k !== DATA && k !== PICS; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function good(r) { return r && r.ok && r.type === "basic" && !r.redirected; }
function timeout(p, ms) {
  return new Promise(function (ok, bad) {
    var t = setTimeout(function () { bad(new Error("slow")); }, ms);
    p.then(function (v) { clearTimeout(t); ok(v); }, function (e) { clearTimeout(t); bad(e); });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname === "/sw.js" || u.pathname.indexOf("/__hatchable/") === 0) return; // sign-in: always live
  if (u.pathname === "/api/photos") return e.respondWith(photo(req, u));
  if (u.pathname.indexOf("/api/documents/") === 0) return; // file downloads: always live
  if (u.pathname.indexOf("/api/") === 0) return e.respondWith(data(req, u));
  if (req.mode === "navigate" || /\.(html|css|js|svg)$/.test(u.pathname) || u.pathname === "/") return e.respondWith(page(req, u));
});

// Pages: network first; the saved copy if the network fails or is too slow.
function page(req, u) {
  var net = fetch(req).then(function (r) {
    if (good(r)) { var c = r.clone(); caches.open(SHELL).then(function (s) { s.put(u.pathname + (u.pathname === "/universe.js" ? u.search : ""), c); }); }
    return r;
  });
  return timeout(net, NET_WAIT_PAGE).catch(function () {
    return caches.open(SHELL).then(function (s) {
      var key = u.pathname === "/" ? "/index.html" : u.pathname + (u.pathname === "/universe.js" ? u.search : "");
      return s.match(key).then(function (hit) { return hit || s.match("/index.html"); });
    }).then(function (hit) { return hit || net; });
  });
}

// Data: network first; the saved copy (marked with when it was saved) if offline.
function data(req, u) {
  var key = u.pathname + u.search;
  var net = fetch(req).then(function (r) {
    if (r.ok && !r.redirected) {
      var c = r.clone();
      c.blob().then(function (b) {
        var h = new Headers(c.headers); h.set("X-HCC-Saved-At", new Date().toISOString());
        return caches.open(DATA).then(function (s) { return s.put(key, new Response(b, { status: 200, headers: h })); });
      }).catch(function () {});
    }
    return r;
  });
  return timeout(net, NET_WAIT_DATA).catch(function () {
    return caches.open(DATA).then(function (s) { return s.match(key); }).then(function (hit) {
      if (!hit) return net.catch(function () {
        return new Response(JSON.stringify({ error: "No signal, and this page has not been opened with signal yet" }), { status: 503, headers: { "Content-Type": "application/json", "X-HCC-Offline": "1" } });
      });
      var h = new Headers(hit.headers); h.set("X-HCC-Offline", "1");
      return hit.blob().then(function (b) { return new Response(b, { status: 200, headers: h }); });
    });
  });
}

// Photos: a photo taken offline is served from the phone's queue; others from the network, else a saved copy.
function photo(req, u) {
  var key = u.searchParams.get("key") || "";
  if (key.indexOf("pending/") === 0) {
    return queuedPhoto(key).then(function (r) {
      if (r) return r;
      return metaGet("keys").then(function (m) {
        var real = m && m[key];
        return real ? photo(req, new URL("/api/photos?key=" + encodeURIComponent(real.key), u)) : new Response("", { status: 404 });
      });
    });
  }
  var ck = "/api/photos?key=" + key;
  return fetch(req.url, { credentials: "same-origin" }).then(function (r) {
    if (r.ok) { var c = r.clone(); caches.open(PICS).then(function (s) { s.put(ck, c); }); }
    return r;
  }).catch(function () {
    return caches.open(PICS).then(function (s) { return s.match(ck); }).then(function (hit) { return hit || new Response("", { status: 504 }); });
  });
}

// Read the same IndexedDB that /offline.js writes.
function idb() {
  return new Promise(function (ok, bad) {
    var r = indexedDB.open("hcc-offline", 1);
    r.onupgradeneeded = function () { var d = r.result; d.createObjectStore("queue", { keyPath: "seq", autoIncrement: true }); d.createObjectStore("meta"); };
    r.onsuccess = function () { ok(r.result); }; r.onerror = function () { bad(r.error); };
  });
}
function metaGet(k) {
  return idb().then(function (d) { return new Promise(function (ok) { var q = d.transaction("meta").objectStore("meta").get(k); q.onsuccess = function () { ok(q.result); }; q.onerror = function () { ok(null); }; }); }).catch(function () { return null; });
}
function queuedPhoto(key) {
  return idb().then(function (d) {
    return new Promise(function (ok) {
      var q = d.transaction("queue").objectStore("queue").getAll();
      q.onsuccess = function () {
        var e = (q.result || []).filter(function (x) { return x.temp_key === key; })[0];
        if (!e || !e.body || !e.body.data) return ok(null);
        var bin = atob(String(e.body.data).split(",")[1] || ""), a = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        ok(new Response(new Blob([a], { type: "image/jpeg" }), { headers: { "Content-Type": "image/jpeg" } }));
      };
      q.onerror = function () { ok(null); };
    });
  }).catch(function () { return null; });
}
