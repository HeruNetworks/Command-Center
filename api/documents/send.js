import { db, config } from "hatchable";
import { okInt, cleanText, escHtml } from "lib/rules.js";
import { DOC_SELECT } from "lib/docs.js";
import { MAX_SEND_BYTES, MAX_SEND_FILES, readFile, toB64, attachName } from "lib/docfiles.js";

export const access = "admin";
export const methods = ["POST"];

// Send by reference (27 Oct 2026): one email with the stored files of the chosen documents attached,
// sent through ShiftLog's verified shiftlog.uk domain (ShiftLog route api/relay/doc-mail).
// Mario's rule: nothing goes out until he has seen the final text and typed "send" for that exact email.
// So the request must carry approved_by_mario: true AND confirm: "send"; a chat sets them only after
// Mario typed "send" in the chat, and the page only after he typed it in the Send box.
// POST { doc_ids, to, cc, subject, text, from_name, approved_by_mario, confirm, allow_old, allow_draft, resend }
const RELAY = "https://www.shiftlog.uk/api/relay/doc-mail";
const NAMES = ["Heru Networks Ltd", "ZS Cabling Ltd"];
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

function addrs(v, max) {
  const list = (Array.isArray(v) ? v : String(v || "").split(/[,;]/)).map(function (s) { return String(s).trim().toLowerCase(); }).filter(Boolean);
  if (list.length > max || list.some(function (a) { return a.length > 200 || !EMAIL_RE.test(a); })) return null;
  return Array.from(new Set(list));
}

export default async function (req, res) {
  const b = req.body || {};
  if (b.approved_by_mario !== true || String(b.confirm || "").trim().toLowerCase() !== "send") {
    return res.status(403).json({ error: "Not sent. Mario must see the final email and type send first." });
  }

  const ids = Array.from(new Set((Array.isArray(b.doc_ids) ? b.doc_ids : [b.doc_ids]).map(okInt).filter(Boolean)));
  if (!ids.length) return res.status(400).json({ error: "Pick at least one document" });
  if (ids.length > MAX_SEND_FILES) return res.status(400).json({ error: "At most " + MAX_SEND_FILES + " documents in one email" });
  const to = addrs(b.to, 5), cc = addrs(b.cc, 5);
  if (!to || !to.length) return res.status(400).json({ error: "Check the To address (up to 5, separated by commas)" });
  if (!cc) return res.status(400).json({ error: "Check the CC address (up to 5)" });
  const subject = cleanText(b.subject, 200).replace(/[\r\n]+/g, " ");
  const text = String(b.text == null ? "" : b.text).replace(/\r\n/g, "\n").trim().slice(0, 20000);
  if (!subject) return res.status(400).json({ error: "Give it a subject" });
  if (!text) return res.status(400).json({ error: "Write the message" });
  const fromName = NAMES.indexOf(b.from_name) >= 0 ? b.from_name : NAMES[0];

  // The documents, in the order chosen. Version guard on the server too.
  const r = await db.query("SELECT x.*, d.file_key FROM (" + DOC_SELECT + ") x JOIN documents d ON d.id = x.id WHERE x.id = ANY($1::int[])", [ids]);
  const byId = {}; r.rows.forEach(function (d) { byId[d.id] = d; });
  const docs = [];
  let total = 0;
  for (const id of ids) {
    const d = byId[id];
    if (!d) return res.status(404).json({ error: "No document #" + id });
    if (!d.file_key) return res.status(409).json({ error: "#" + id + " has no file stored in the app yet. Tap Attach file on it first." });
    if (d.status === "superseded" && b.allow_old !== true) return res.status(409).json({ error: "#" + id + " has been replaced by #" + d.replaced_by + ". Send the newer one, or confirm the old one.", replaced_by: d.replaced_by });
    if (d.status === "draft" && b.allow_draft !== true) return res.status(409).json({ error: "#" + id + " is still a DRAFT. Confirm before sending it." });
    total += d.file_bytes || 0;
    docs.push(d);
  }
  if (total > MAX_SEND_BYTES) return res.status(413).json({ error: "Files are " + (total / 1048576).toFixed(1) + " MB together; the limit is 7 MB. Send them in two emails." });

  // Double-tap guard: the same documents to the same people with the same subject in the last 10 minutes.
  if (b.resend !== true) {
    const since = Date.now() - 10 * 60 * 1000, toKey = to.slice().sort().join(",");
    const dup = docs.some(function (d) {
      return (d.sends || []).some(function (s) { return s.ok && s.subject === subject && String((s.to || []).slice().sort().join(",")) === toKey && Date.parse(s.at) > since; });
    });
    if (dup) return res.status(409).json({ error: "This looks like a repeat: the same email went out in the last 10 minutes. Not sent again." });
  }

  let key = null;
  try { const v = await config.get("DOC_RELAY_KEY"); key = typeof v === "string" && v.trim().length >= 32 ? v.trim() : null; } catch (e) { key = null; }
  if (!key) return res.status(412).json({ error: "Sending is not switched on yet: paste DOC_RELAY_KEY on the Command Centre's Setup page (same value as in ShiftLog)." });

  const attachments = [];
  for (const d of docs) {
    const bytes = await readFile(d.file_key);
    if (!bytes) return res.status(409).json({ error: "The stored file for #" + d.id + " is missing. Attach it again." });
    attachments.push({ filename: attachName(d), contentType: d.file_type || "application/pdf", content: toB64(bytes) });
  }
  const html = "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5\">" + escHtml(text).replace(/\n/g, "<br>") + "</div>";

  let out = null, err = "";
  try {
    const ctl = new AbortController();
    const t = setTimeout(function () { ctl.abort(); }, 50000);
    const rr = await fetch(RELAY, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "X-Relay-Key": key },
      body: JSON.stringify({ to: to, cc: cc, subject: subject, text: text, html: html, from_name: fromName, attachments: attachments }) });
    clearTimeout(t);
    try { out = await rr.json(); } catch (e) { out = null; }
    if (!rr.ok || !out || !out.ok) err = (out && out.error) || ("ShiftLog answered " + rr.status + (rr.status === 404 ? " (the two relay keys do not match, or ShiftLog's key is not set)" : ""));
  } catch (e) {
    err = String((e && e.message) || e).slice(0, 200);
  }

  const entry = { at: new Date().toISOString(), ok: !err, to: to, cc: cc, subject: subject, from: (out && out.from) || fromName, message_id: (out && out.message_id) || null, docs: ids, error: err || undefined };
  for (const d of docs) {
    if (err) {
      await db.query("UPDATE documents SET sends = sends || $1::jsonb, updated_at = now() WHERE id = $2", [JSON.stringify([entry]), d.id]);
    } else {
      await db.query(
        "UPDATE documents SET sends = sends || $1::jsonb, sent_to = $2, sent_at = now(), replied_at = NULL, " +
        "status = CASE WHEN status IN ('draft', 'final') THEN 'sent' ELSE status END, updated_at = now() WHERE id = $3",
        [JSON.stringify([entry]), to.join(", ").slice(0, 200), d.id]
      );
    }
  }
  if (err) return res.status(502).json({ error: "Not sent: " + err });
  return res.json({ ok: true, from: entry.from, message_id: entry.message_id, to: to, cc: cc, docs: ids });
}