import { storage } from "hatchable";
import { Buffer } from "node:buffer";

// Files kept in the app for Send by reference (27 Oct 2026).
// Only these types, checked by their first bytes (never by what the phone claims).
export const MAX_FILE_BYTES = 10 * 1024 * 1024;   // one stored file
export const MAX_SEND_BYTES = 7 * 1024 * 1024;    // all files in one email together
export const MAX_SEND_FILES = 10;
export const MAX_PART_CHARS = 2900000;            // one upload part, base64 (about 2 MB)
export const MAX_PARTS = 40;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const EXT = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
EXT[DOCX] = "docx"; EXT[XLSX] = "xlsx";

// What the bytes are. Word and Excel files are zip files, so their name decides which.
export function sniff(bytes, fileName) {
  const b = bytes;
  if (b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    const n = String(fileName || "").toLowerCase();
    if (n.endsWith(".docx")) return DOCX;
    if (n.endsWith(".xlsx")) return XLSX;
  }
  return "";
}

export function fromB64(s) { return new Uint8Array(Buffer.from(String(s || ""), "base64")); }
export function toB64(bytes) { return Buffer.from(bytes).toString("base64"); }

export async function sha256(bytes) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
}

export async function readFile(key) {
  const got = await storage.get(key);
  if (!got) return null;
  return new Uint8Array(got.buffer);
}

// File name for the email attachment: the stored name if it has the right ending, else the title.
export function attachName(doc) {
  const ext = EXT[doc.file_type] || "pdf";
  const n = String(doc.file_name || "").replace(/[\r\n"\\/:*?<>|]+/g, " ").trim();
  if (n && n.toLowerCase().endsWith("." + ext)) return n.slice(0, 150);
  const t = String(doc.title || "document").replace(/[\r\n"\\/:*?<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
  return t + "." + ext;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;