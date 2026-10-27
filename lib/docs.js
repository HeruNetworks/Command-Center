// Shared rules for the Documents index (27 Oct 2026).
export const DOC_KINDS = ["statement", "invoice", "self-bill", "evidence pack", "report", "letter", "contract", "sheet", "other"];
export const DOC_STATUSES = ["draft", "final", "sent", "signed", "paid", "superseded"];

// Every document with its effective status: a row that a newer row replaces
// (supersedes_id) counts as superseded even if a chat inserted it by SQL.
export const DOC_SELECT =
  "SELECT d.id, d.title, d.description, d.project, d.kind, d.party, d.tags, " +
  "CASE WHEN nx.id IS NOT NULL THEN 'superseded' ELSE d.status END AS status, " +
  "d.doc_date::text AS doc_date, d.drive_file_id, d.drive_url, d.file_name, d.mime, d.size_bytes, d.supersedes_id, " +
  "nx.id AS replaced_by, d.sent_to, d.sent_at, d.replied_at, d.due_on::text AS due_on, d.item_id, d.chat_url, d.made_by, d.created_at, d.updated_at " +
  "FROM documents d LEFT JOIN LATERAL (SELECT n.id FROM documents n WHERE n.supersedes_id = d.id ORDER BY n.id DESC LIMIT 1) nx ON true";

// Waiting: has a due date and is not finished, or was sent and no reply logged yet.
export const DOC_WAITING =
  "((x.due_on IS NOT NULL AND x.status NOT IN ('paid', 'signed', 'superseded')) OR (x.status = 'sent' AND x.replied_at IS NULL))";

// Pull a Drive file id out of a pasted link (or accept a bare id).
export function driveId(v) {
  const s = String(v || "").trim();
  let m = s.match(/\/d\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : "";
}