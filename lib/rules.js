// Shared rules for the board. Owner-only app (Hatchable project is private,
// every route is access = "admin").
export const PROJECTS = ["Legal", "ZS Cabling", "Site Work", "Business Admin", "Learning", "Personal", "App Builder", "General"];
export const STATUSES = ["now", "watch", "open", "done"];
export const KINDS = ["question", "action", "deadline", "waiting", "checklist"];
export const CHECK_RESULTS = ["", "ok", "issue", "na"];
export const BOARD_URL = "https://heru-command-centre.hatchable.site";

export function cleanText(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max || 500);
}

export function okProject(p) {
  return PROJECTS.indexOf(p) >= 0 ? p : "General";
}

export function okDate(v) {
  const s = String(v || "");
  if (s.length !== 10) return null;
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === s ? s : null;
}

export function okInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Today's date in the UK (YYYY-MM-DD).
export function ukToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

export function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
// Money typed on a phone: "£1,234.5" -> "1234.50". Returns null if not a sensible amount.
export function okMoney(v) {
  const s = String(v == null ? "" : v).replace(/[£,\s]/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  return (Math.round(parseFloat(s) * 100) / 100).toFixed(2);
}

// The Friday pay runs work to: today if it is Friday, else the next Friday (UK date).
export function payFriday() {
  const t = new Date(ukToday() + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + ((5 - t.getUTCDay() + 7) % 7));
  return t.toISOString().slice(0, 10);
}