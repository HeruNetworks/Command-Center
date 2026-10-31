import { api, db } from "hatchable";

// Google Drive for checklist photos (27 Oct 2026). Only adds folders and files:
// never deletes, moves or shares anything. Same method as Cable Log's lib/drive.js.
const FOLDER = "application/vnd.google-apps.folder";
// Each project's Drive folder. Projects not listed here use 00 Inbox until Mario names a folder.
const PROJECT_FOLDERS = { "ZS Cabling": "1XgNMr9HxPqgszJbDjReIlVEyH612syv6" };
const INBOX = "10L2E8cwDhbH5OQae9SMeDnAYsOi-dRcK";

async function call(method, path, opts) {
  const r = await api.call("google_drive", Object.assign({ method: method, path: path }, opts || {}));
  if (r.status >= 400) throw new Error("Google Drive said: " + ((r.body && r.body.error && r.body.error.message) || "error " + r.status));
  return r.body;
}
export function clean(s, max) { return String(s || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, max || 80); }

// Find a folder by name inside a parent, or make it. Ids are remembered in the meta table.
async function folder(parent, name) {
  const mk = "drive_folder:" + parent + ":" + name;
  const m = await db.query("SELECT value FROM meta WHERE key = $1", [mk]);
  if (m.rows.length && m.rows[0].value) return m.rows[0].value;
  const q = "'" + parent + "' in parents and name = '" + name.replace(/\\/g, "").replace(/'/g, "\\'") + "' and mimeType = '" + FOLDER + "' and trashed = false";
  const b = await call("GET", "/drive/v3/files", { query: { q: q, fields: "files(id)", pageSize: "5", supportsAllDrives: "true", includeItemsFromAllDrives: "true" } });
  const id = b.files && b.files[0] ? b.files[0].id
    : (await call("POST", "/drive/v3/files", { query: { fields: "id", supportsAllDrives: "true" }, body: { name: name, mimeType: FOLDER, parents: [parent] } })).id;
  await db.query("INSERT INTO meta (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [mk, id]);
  return id;
}

// <project folder> / Checklist photos / #<item> <title> /
export async function checklistFolder(item) {
  const base = await folder(PROJECT_FOLDERS[item.project] || INBOX, "Checklist photos");
  return folder(base, clean("#" + item.id + " " + item.text, 60));
}

export async function uploadJpeg(parent, name, bytes) {
  const bd = "heruccphoto" + Math.random().toString(36).slice(2);
  const enc = new TextEncoder();
  const head = enc.encode("--" + bd + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify({ name: name, parents: [parent] }) + "\r\n--" + bd + "\r\nContent-Type: image/jpeg\r\n\r\n");
  const tail = enc.encode("\r\n--" + bd + "--");
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
  return call("POST", "/upload/drive/v3/files", { query: { uploadType: "multipart", fields: "id,name", supportsAllDrives: "true" }, headers: { "Content-Type": "multipart/related; boundary=" + bd }, body: body });
}