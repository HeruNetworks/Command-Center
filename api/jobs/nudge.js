import { db, email } from "hatchable";
import { BOARD_URL, ukToday, escHtml } from "lib/rules.js";

export const methods = ["POST"];
export const access = "scheduler";

// Item 6: weekday 07:00 UK email, ONLY when something is overdue or due today.
// Cron fires at 06:00 and 07:00 UTC (covers summer and winter time); this
// handler only acts when it is the 07:00 hour in London, and only once a day.
// Body {dry:true} builds the email without sending (for testing).
// Body {force:true} skips the hour/once-a-day checks (for a test send).
export default async function (req, res) {
  const b = req.body || {};
  const dry = b.dry === true, force = b.force === true;
  const now = new Date();
  const hour = parseInt(now.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }), 10);
  const wd = now.toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "short" });
  const today = ukToday();

  if (!force && !dry) {
    if (hour !== 7) return res.json({ skipped: "not 07:00 in London", hour });
    if (wd === "Sat" || wd === "Sun") return res.json({ skipped: "weekend" });
    const last = await db.query("SELECT value FROM meta WHERE key = 'nudge_last'");
    if (last.rows.length && last.rows[0].value === today) return res.json({ skipped: "already ran today" });
  }

  const rows = await db.query(
    "SELECT i.id, i.project, i.kind, i.text, i.due_on::text AS due, i.waiting_on FROM items i " +
    "WHERE i.done = false AND i.due_on IS NOT NULL AND i.due_on <= (now() AT TIME ZONE 'Europe/London')::date " +
    "ORDER BY i.due_on, i.id LIMIT 30"
  );
  const chase = await db.query(
    "SELECT count(*)::int AS n FROM items WHERE done = false AND kind = 'waiting' " +
    "AND COALESCE(waiting_since, created_at::date) <= (now() AT TIME ZONE 'Europe/London')::date - 7"
  );
  const over = rows.rows.filter(function (r) { return r.due < today; });
  const dueToday = rows.rows.filter(function (r) { return r.due === today; });
  const chaseN = chase.rows[0] ? chase.rows[0].n : 0;

  if (!over.length && !dueToday.length) {
    if (!dry) await setMeta("nudge_last", today);
    if (!dry) await setMeta("nudge_status", "Nothing overdue on " + today + ", no email sent");
    return res.json({ sent: false, reason: "nothing overdue or due today" });
  }

  const fmt = function (d) { return new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
  const line = function (r) { return (r.kind === "waiting" && r.waiting_on ? "[Waiting on " + r.waiting_on + "] " : "") + r.text + " (" + r.project + (r.due < today ? ", was due " + fmt(r.due) : "") + ")"; };
  const parts = [];
  if (over.length) parts.push(over.length + " overdue");
  if (dueToday.length) parts.push(dueToday.length + " due today");
  const subject = "Board: " + parts.join(", ");

  let text = "Greetings Mario," + "\n\n";
  if (over.length) text += "OVERDUE" + "\n" + over.map(function (r) { return "- " + line(r); }).join("\n") + "\n\n";
  if (dueToday.length) text += "DUE TODAY" + "\n" + dueToday.map(function (r) { return "- " + line(r); }).join("\n") + "\n\n";
  if (chaseN) text += chaseN + " waiting-on item" + (chaseN === 1 ? "" : "s") + " over 7 days old: worth a chase." + "\n\n";
  text += "Open the board: " + BOARD_URL + "\n\n" + "Sent by your Command Centre. It only emails on weekdays when something is overdue or due today.";

  const li = function (r) { return "<li>" + escHtml(line(r)) + "</li>"; };
  let html = "<p>Greetings Mario,</p>";
  if (over.length) html += "<p><b style=\"color:#c0392b\">Overdue</b></p><ul>" + over.map(li).join("") + "</ul>";
  if (dueToday.length) html += "<p><b>Due today</b></p><ul>" + dueToday.map(li).join("") + "</ul>";
  if (chaseN) html += "<p>" + chaseN + " waiting-on item" + (chaseN === 1 ? "" : "s") + " over 7 days old: worth a chase.</p>";
  html += "<p><a href=\"" + BOARD_URL + "\">Open the board</a></p><p style=\"color:#888;font-size:12px\">Sent by your Command Centre. It only emails on weekdays when something is overdue or due today.</p>";

  if (dry) return res.json({ dry: true, subject: subject, text: text });

  // 31 Oct 2026: send to Telegram (Heru Books Bot, owners only) first; email only if Telegram fails.
  const tg = await sendTelegram("📋 " + subject + "\n\n" + text.replace(/^Greetings Mario,\n\n/, "").replace(/\n\nSent by your Command Centre[\s\S]*$/, ""));
  if (tg.ok) {
    await setMeta("nudge_last", today);
    await setMeta("nudge_status", "Sent to Telegram " + today + ": " + parts.join(", "));
    return res.json({ sent: true, via: "telegram", subject: subject });
  }

  const to = await db.query("SELECT value FROM meta WHERE key = 'nudge_email'");
  const addr = to.rows.length && to.rows[0].value ? to.rows[0].value : "mario@herunetworks.co.uk";
  try {
    await email.send({ to: addr, subject: subject, text: text, html: html });
    await setMeta("nudge_last", today);
    await setMeta("nudge_status", "Sent by email (Telegram failed: " + tg.why + ") " + today + ": " + parts.join(", "));
    return res.json({ sent: true, subject: subject });
  } catch (e) {
    await setMeta("nudge_status", "FAILED " + today + ": " + String(e && e.message || e).slice(0, 200));
    return res.status(500).json({ sent: false, error: String(e && e.message || e) });
  }
}

// Key and address live in the meta table (bot_notify_url, bot_notify_key); never in code.
async function sendTelegram(msg) {
  try {
    const r = await db.query("SELECT key, value FROM meta WHERE key IN ('bot_notify_url', 'bot_notify_key')");
    const m = {};
    r.rows.forEach(function (x) { m[x.key] = x.value; });
    if (!m.bot_notify_url || !m.bot_notify_key) return { ok: false, why: "bot link not set up" };
    const resp = await fetch(m.bot_notify_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bot-key": m.bot_notify_key },
      body: JSON.stringify({ text: msg }),
    });
    return resp.ok ? { ok: true } : { ok: false, why: "HTTP " + resp.status };
  } catch (e) {
    return { ok: false, why: String(e && e.message || e).slice(0, 100) };
  }
}

async function setMeta(k, v) {
  await db.query(
    "INSERT INTO meta (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [k, v]
  );
}