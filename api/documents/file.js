import { db, storage } from "hatchable";
import { okInt, cleanText } from "lib/rules.js";
import { MAX_FILE_BYTES, MAX_PART_CHARS, MAX_PARTS, EXT, UUID_RE, sniff, fromB64, sha256, readFile } from "lib/docfiles.js";

export const access = "admin";
export const methods = ["GET", "POST"];

// A copy of a document's file kept in the app's private storage (27 Oct 2026), so the server can
// attach it to an email. Google Drive stays the main copy; this is only for sending.
// Upload in parts (phones send about 1.5 MB at a time):
//   POST { id, upload_id, part, parts, data: base64 }      one part (0 .. parts-1)
//   POST { id, upload_id, parts, finish: true, file_name }  joins the parts, checks the file, saves it
// GET ?id=  opens the stored copy (owner only, link lasts 60 seconds).
export default async function (req, res) {
  if (req.method === "GET") {
    const id = okInt((req.query || {}).id);
    const r = id ? await db.query("SELECT file_key FROM documents WHERE id = $1", [id]) : { rows: [] };
    if (!r.rows.length || !r.rows[0].file_key) return res.status(404).json({ error: "No stored file" });
    res.setHeader("Cache-Control", "private, no-store");
    return res.redirect(302, await storage.url(r.rows[0].file_key, { ttl: 60 }));
  }

  const b = req.body || {};
  const id = okInt(b.id);
  const up = String(b.upload_id || "");
  const parts = parseInt(b.parts, 10);
  if (!id || !UUID_RE.test(up) || !(parts >= 1 && parts <= MAX_PARTS)) return res.status(400).json({ error: "Bad request" });
  const doc = await db.query("SELECT id, file_key, file_name FROM documents WHERE id = $1", [id]);
  if (!doc.rows.length) return res.status(404).json({ error: "No document #" + id });
  const base = "docs/" + id + "/up/" + up + "/";

  if (!b.finish) {
    const part = parseInt(b.part, 10);
    const data = String(b.data || "");
    if (!(part >= 0 && part < parts)) return res.status(400).json({ error: "Bad part number" });
    if (!data || data.length > MAX_PART_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return res.status(400).json({ error: "Bad part" });
    await storage.put(base + part, fromB64(data), "application/octet-stream");
    return res.json({ ok: true, part: part });
  }

  // Join the parts in order.
  const chunks = [];
  let size = 0;
  for (let i = 0; i < parts; i++) {
    const c = await readFile(base + i);
    if (!c) return res.status(400).json({ error: "Part " + (i + 1) + " of " + parts + " is missing. Try again." });
    size += c.length;
    if (size > MAX_FILE_BYTES) { await tidy(base, parts); return res.status(413).json({ error: "File too large (max 10 MB)" }); }
    chunks.push(c);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  chunks.forEach(function (c) { bytes.set(c, at); at += c.length; });
  const name = cleanText(b.file_name, 250);
  const type = sniff(bytes, name || doc.rows[0].file_name);
  if (!type) { await tidy(base, parts); return res.status(415).json({ error: "Only PDF, JPEG, PNG, Word (.docx) or Excel (.xlsx) files" }); }

  const key = "docs/" + id + "/" + crypto.randomUUID() + "." + EXT[type];
  await storage.put(key, bytes, type);
  const hash = await sha256(bytes);
  await db.query(
    "UPDATE documents SET file_key = $1, file_sha256 = $2, file_bytes = $3, file_type = $4, file_at = now(), " +
    "file_name = CASE WHEN COALESCE(file_name, '') = '' THEN $5 ELSE file_name END, size_bytes = COALESCE(size_bytes, $3), updated_at = now() WHERE id = $6",
    [key, hash, size, type, name, id]
  );
  await tidy(base, parts);
  const old = doc.rows[0].file_key;
  if (old && old !== key) { try { await storage.del(old); } catch (e) { /* old copy left behind; harmless */ } }
  return res.json({ ok: true, id: id, file_bytes: size, file_type: type, file_sha256: hash });
}

async function tidy(base, parts) {
  for (let i = 0; i < parts; i++) { try { await storage.del(base + i); } catch (e) { /* already gone */ } }
}