import { db, storage } from "hatchable";
import { okInt, okDate, cleanText, ukToday } from "lib/rules.js";
import { checklistFolder, uploadJpeg, clean } from "lib/drive.js";

export const access = "admin";
export const methods = ["GET", "POST"];

// Checklist photos (27 Oct 2026). A copy is kept in the app's private storage (quick thumbnails)
// and each photo is copied into Google Drive: <project folder> / Checklist photos / #<item> <title> /
// named "<full name> - <date> - <what> - <time>.jpg" so a search by name finds it.
// POST { item_id, data: "data:image/jpeg;base64,...", person, date, look_for } stores a new photo.
// POST { item_id, retry_key, person, date, look_for } copies an already-saved photo to Drive.
// GET ?key= opens a photo for the owner only.
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
  if (!id) return res.status(400).json({ error: "Bad request" });
  const it = await db.query("SELECT id, project, text, checklist_rows::text AS rows FROM items WHERE id = $1", [id]);
  if (!it.rows.length) return res.status(404).json({ error: "Item not found" });
  const item = it.rows[0];

  let key, bytes, at = new Date().toISOString();
  if (b.retry_key) {
    key = String(b.retry_key);
    const m = key.match(KEY_RE);
    if (!m || Number(m[1]) !== id || item.rows.indexOf(key) < 0) return res.status(404).json({ error: "Photo not found" });
    const got = await storage.get(key);
    if (!got) return res.status(404).json({ error: "Photo file missing" });
    bytes = new Uint8Array(got.buffer);
    at = "";
  } else {
    const data = String(b.data || "");
    if (data.indexOf("data:image/jpeg;base64,") !== 0) return res.status(400).json({ error: "Send a JPEG photo" });
    const bin = atob(data.slice(23));
    if (bin.length > MAX_BYTES) return res.status(413).json({ error: "Photo too large (max 5 MB)" });
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // Check it really is a JPEG (starts FF D8 FF), whatever the browser claimed.
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return res.status(415).json({ error: "Not a JPEG photo" });
    key = "checklists/" + id + "/" + crypto.randomUUID() + ".jpg";
    await storage.put(key, bytes, "image/jpeg");
  }

  // Copy to Drive. If Drive is not connected or fails, the photo is still safe in the app.
  const out = { key: key, at: at };
  try {
    const time = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(/:/g, "");
    const name = clean(cleanText(b.person, 80) || "No name") + " - " + (okDate(b.date) || ukToday()) + " - " + clean(cleanText(b.look_for, 300), 50) + " - " + time + ".jpg";
    const f = await uploadJpeg(await checklistFolder(item), name, bytes);
    out.drive_id = f.id;
  } catch (e) {
    out.drive_error = e && e.code === "SetupRequired" ? "Google Drive is not connected yet (Setup page)" : String((e && e.message) || e).slice(0, 200);
  }
  return res.json(out);
}
