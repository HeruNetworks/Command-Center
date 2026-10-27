import { db, storage } from "hatchable";
import { okInt } from "lib/rules.js";

export const access = "admin";
export const methods = ["GET", "POST"];

// Checklist photos (27 Oct 2026). Kept in the app's private storage, never public.
// POST { item_id, data: "data:image/jpeg;base64,..." } stores one photo and returns its key;
// the checklist page then saves the key on the row. GET ?key= opens a photo for the owner only.
const MAX_BYTES = 5 * 1024 * 1024;
const KEY_RE = /^checklists\/(\d+)\/[0-9a-f-]{36}\.jpg$/;

export default async function (req, res) {
  if (req.method === "GET") {
    const key = String((req.query || {}).key || "");
    const m = key.match(KEY_RE);
    if (!m) return res.status(400).json({ error: "Bad request" });
    // Only photos saved on that checklist can be opened.
    const r = await db.query("SELECT 1 FROM items WHERE id = $1 AND position($2 in checklist_rows::text) > 0", [Number(m[1]), key]);
    if (!r.rows.length) return res.status(404).json({ error: "Photo not found" });
    const url = await storage.url(key, { ttl: 60 });
    res.setHeader("Cache-Control", "private, max-age=50");
    return res.redirect(302, url);
  }

  const b = req.body || {};
  const id = okInt(b.item_id);
  const data = String(b.data || "");
  if (!id || data.indexOf("data:image/jpeg;base64,") !== 0) return res.status(400).json({ error: "Send a JPEG photo" });
  const it = await db.query("SELECT 1 FROM items WHERE id = $1", [id]);
  if (!it.rows.length) return res.status(404).json({ error: "Item not found" });
  const bin = atob(data.slice(23));
  if (bin.length > MAX_BYTES) return res.status(413).json({ error: "Photo too large (max 5 MB)" });
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // Check it really is a JPEG (starts FF D8 FF), whatever the browser claimed.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return res.status(415).json({ error: "Not a JPEG photo" });
  const key = "checklists/" + id + "/" + crypto.randomUUID() + ".jpg";
  await storage.put(key, bytes, "image/jpeg");
  return res.json({ key: key, at: new Date().toISOString() });
}
