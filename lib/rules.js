// Shared rules for the board. Owner-only app (Hatchable project is private,
// every route is access = "admin").
export const PROJECTS = ["Legal", "ZS Cabling", "Site Work", "Business Admin", "Learning", "Personal", "App Builder", "General"];
export const STATUSES = ["now", "watch", "open", "done"];
export const KINDS = ["question", "action", "deadline", "waiting"];
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