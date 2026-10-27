import { db } from "hatchable";
import { cleanText, okProject, okDate, okInt } from "lib/rules.js";
import { DOC_KINDS, DOC_STATUSES, DOC_SELECT, DOC_WAITING, driveId } from "lib/docs.js";

export const access = "admin";
export const methods = ["GET", "POST", "PATCH"];

// Documents index: links to files in Google Drive plus their details.
// GET lists (optional filters), POST adds one, PATCH changes one.
export default async function (req, res) {
  if (req.method === "GET") return list(req, res);
  const b = req.body || {};
  if (req.method === "POST") return add(b, res);
  return change(b, res);
}

async function list(req, res) {
  const q = req.query || {};
  const where = [], p = [];
  if (q.project) { p.push(String(q.project)); where.push("x.project = $" + p.length); }
  if (q.kind) { p.push(String(q.kind)); where.push("x.kind = $" + p.length); }
  if (q.status) { p.push(String(q.status)); where.push("x.status = $" + p.length); }
  if (q.tag) { p.push(String(q.tag)); where.push("$" + p.length + " = ANY(x.tags)"); }
  if (q.q) { p.push("%" + String(q.q).slice(0, 100) + "%"); where.push("(x.title ILIKE $" + p.length + " OR x.description ILIKE $" + p.length + " OR x.party ILIKE $" + p.length + " OR x.file_name ILIKE $" + p.length + ")"); }
  if (q.waiting === "1") where.push(DOC_WAITING);
  const r = await db.query(
    "SELECT x.* FROM (" + DOC_SELECT + ") x" + (where.length ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY COALESCE(x.doc_date::date, (x.created_at AT TIME ZONE 'Europe/London')::date) DESC, x.id DESC LIMIT 2000", p
  );
  res.json({ documents: r.rows, kinds: DOC_KINDS, statuses: DOC_STATUSES });
}

// Read and check the fields a phone can set. Returns { error } or { cols }.
function fields(b, isNew) {
  const c = {};
  if (isNew || b.title !== undefined) { c.title = cleanText(b.title, 200); if (!c.title) return { error: "Give it a title" }; }
  if (b.description !== undefined) c.description = cleanText(b.description, 500);
  if (isNew || b.project !== undefined) c.project = okProject(b.project);
  if (isNew || b.kind !== undefined) c.kind = DOC_KINDS.indexOf(b.kind) >= 0 ? b.kind : "other";
  if (b.party !== undefined) c.party = cleanText(b.party, 120);
  if (b.tags !== undefined) {
    const list = Array.isArray(b.tags) ? b.tags : String(b.tags || "").split(",");
    c.tags = list.map(function (t) { return cleanText(t, 40); }).filter(Boolean).slice(0, 20);
  }
  if (isNew || b.status !== undefined) {
    if (b.status !== undefined && DOC_STATUSES.indexOf(b.status) < 0) return { error: "Unknown status" };
    c.status = b.status || "final";
  }
  if (b.doc_date !== undefined) c.doc_date = okDate(b.doc_date);
  if (b.due_on !== undefined) c.due_on = okDate(b.due_on);
  if (isNew || b.drive_url !== undefined || b.drive_file_id !== undefined) {
    const id = driveId(b.drive_file_id || b.drive_url);
    if (!id) return { error: "Paste a Google Drive link to the file" };
    c.drive_file_id = id;
    const u = String(b.drive_url || "");
    c.drive_url = u.indexOf("https://drive.google.com/") === 0 || u.indexOf("https://docs.google.com/") === 0 ? u.slice(0, 500) : "https://drive.google.com/file/d/" + id + "/view";
  }
  if (b.file_name !== undefined) c.file_name = cleanText(b.file_name, 250);
  if (b.mime !== undefined) c.mime = cleanText(b.mime, 100);
  if (b.size_bytes !== undefined) { const n = parseInt(b.size_bytes, 10); c.size_bytes = Number.isFinite(n) && n >= 0 ? n : null; }
  if (b.supersedes_id !== undefined) c.supersedes_id = okInt(String(b.supersedes_id).replace("#", ""));
  if (b.item_id !== undefined) c.item_id = okInt(String(b.item_id).replace("#", ""));
  if (b.chat_url !== undefined) { const u = String(b.chat_url || ""); c.chat_url = u.indexOf("https://claude.ai/") === 0 ? u.slice(0, 300) : ""; }
  if (b.made_by !== undefined) c.made_by = cleanText(b.made_by, 80);
  if (b.sent_to !== undefined) c.sent_to = cleanText(b.sent_to, 200);
  return { cols: c };
}

async function oneDoc(id) {
  const r = await db.query("SELECT x.* FROM (" + DOC_SELECT + ") x WHERE x.id = $1", [id]);
  return r.rows[0] || null;
}

// The old version is marked superseded when a newer one names it.
async function retire(oldId, newId) {
  if (!oldId || oldId === newId) return;
  await db.query("UPDATE documents SET status = 'superseded', updated_at = now() WHERE id = $1 AND id <> $2", [oldId, newId]);
}

async function add(b, res) {
  const f = fields(b, true);
  if (f.error) return res.status(400).json({ error: f.error });
  const c = f.cols;
  if (c.supersedes_id && !(await oneDoc(c.supersedes_id))) return res.status(400).json({ error: "No document #" + c.supersedes_id });
  const names = Object.keys(c), vals = names.map(function (k) { return c[k]; });
  const r = await db.query(
    "INSERT INTO documents (" + names.join(", ") + ") VALUES (" + names.map(function (_, i) { return "$" + (i + 1); }).join(", ") + ") RETURNING id", vals
  );
  const id = r.rows[0].id;
  await retire(c.supersedes_id, id);
  return res.status(201).json({ document: await oneDoc(id) });
}

async function change(b, res) {
  const id = okInt(b.id);
  if (!id) return res.status(400).json({ error: "Bad request" });
  const cur = await oneDoc(id);
  if (!cur) return res.status(404).json({ error: "Not found" });
  let c;
  if (b.action === "sent") {
    const to = cleanText(b.sent_to, 200);
    if (!to) return res.status(400).json({ error: "Say who it went to" });
    c = { sent_to: to, sent_at: new Date().toISOString(), replied_at: null };
    if (cur.status === "draft" || cur.status === "final") c.status = "sent";
  } else if (b.action === "replied") {
    c = { replied_at: new Date().toISOString() };
  } else {
    const f = fields(b, false);
    if (f.error) return res.status(400).json({ error: f.error });
    c = f.cols;
    if (c.supersedes_id === id) return res.status(400).json({ error: "A document cannot replace itself" });
    if (c.supersedes_id && !(await oneDoc(c.supersedes_id))) return res.status(400).json({ error: "No document #" + c.supersedes_id });
  }
  const names = Object.keys(c);
  if (!names.length) return res.json({ document: cur });
  const vals = names.map(function (k) { return c[k]; });
  vals.push(id);
  await db.query(
    "UPDATE documents SET " + names.map(function (k, i) { return k + " = $" + (i + 1); }).join(", ") + ", updated_at = now() WHERE id = $" + vals.length, vals
  );
  if (c.supersedes_id) await retire(c.supersedes_id, id);
  return res.json({ document: await oneDoc(id) });
}
