import { db } from "hatchable";
import { STATUSES, KINDS, cleanText, okProject, okDate, okInt, ukToday } from "lib/rules.js";

export const access = "admin";
export const methods = ["POST"];

// One route for every change Mario makes from his phone.
export default async function (req, res) {
  const b = req.body || {};
  const action = String(b.action || "");
  const id = okInt(b.id);

  if (action === "chat_status") {
    if (!id || STATUSES.indexOf(b.status) < 0) return res.status(400).json({ error: "Bad request" });
    const r = await db.query("UPDATE chats SET status = $1, updated_at = now() WHERE id = $2", [b.status, id]);
    return res.json({ ok: r.rowCount === 1 });
  }

  if (action === "item_done") {
    if (!id) return res.status(400).json({ error: "Bad request" });
    const done = b.done === true;
    const ans = readAnswer(b);
    if (ans === false) return res.status(400).json({ error: "Answer too long (max 2000 characters)" });
    // A new non-empty answer is saved only when ticking off; unticking leaves any answer as it is.
    const r = await db.query(
      "UPDATE items SET done = $1, done_at = CASE WHEN $1 THEN now() ELSE NULL END, " +
      "answer = CASE WHEN $1 AND $3 <> '' THEN $3 ELSE answer END, " +
      "answer_synced_at = CASE WHEN $1 AND $3 <> '' THEN NULL ELSE answer_synced_at END WHERE id = $2",
      [done, id, ans]
    );
    return res.json({ ok: r.rowCount === 1 });
  }

  if (action === "item_add") {
    const text = cleanText(b.text, 500);
    if (!text) return res.status(400).json({ error: "Type something first" });
    const kind = KINDS.indexOf(b.kind) >= 0 ? b.kind : "action";
    let chatId = okInt(b.chat_id);
    let project = okProject(b.project);
    if (chatId) {
      const c = await db.query("SELECT project FROM chats WHERE id = $1", [chatId]);
      if (!c.rows.length) chatId = null; else project = c.rows[0].project;
    }
    const who = kind === "waiting" ? cleanText(b.waiting_on, 80) : "";
    if (kind === "waiting" && !who) return res.status(400).json({ error: "Say who you are waiting on" });
    const r = await db.query(
      "INSERT INTO items (chat_id, project, kind, text, due_on, source, waiting_on, waiting_since) VALUES ($1, $2, $3, $4, $5, 'phone', $6, $7) RETURNING id",
      [chatId, project, kind, text, okDate(b.due_on), who, kind === "waiting" ? (okDate(b.waiting_since) || ukToday()) : null]
    );
    return res.json({ ok: true, id: r.rows[0].id });
  }

  // Edit an item from the phone: wording, type, who it waits on, due date, project.
  if (action === "item_edit") {
    const text = cleanText(b.text, 500);
    if (!id || !text) return res.status(400).json({ error: "Bad request" });
    const cur = await db.query("SELECT kind, project, waiting_since FROM items WHERE id = $1", [id]);
    if (!cur.rows.length) return res.status(404).json({ error: "Item not found" });
    const kind = KINDS.indexOf(b.kind) >= 0 ? b.kind : cur.rows[0].kind;
    const who = kind === "waiting" ? cleanText(b.waiting_on, 80) : "";
    if (kind === "waiting" && !who) return res.status(400).json({ error: "Say who you are waiting on" });
    let since = null;
    if (kind === "waiting") since = okDate(b.waiting_since) || (cur.rows[0].waiting_since ? String(cur.rows[0].waiting_since instanceof Date ? cur.rows[0].waiting_since.toISOString() : cur.rows[0].waiting_since).slice(0, 10) : ukToday());
    const r = await db.query(
      "UPDATE items SET text = $1, due_on = $2, kind = $3, project = $4, waiting_on = $5, waiting_since = $6 WHERE id = $7",
      [text, okDate(b.due_on), kind, b.project ? okProject(b.project) : cur.rows[0].project, who, since, id]
    );
    return res.json({ ok: r.rowCount === 1 });
  }

  if (action === "item_delete") {
    if (!id) return res.status(400).json({ error: "Bad request" });
    const r = await db.query("DELETE FROM items WHERE id = $1", [id]);
    return res.json({ ok: r.rowCount === 1 });
  }

  // Mark several quiet, finished chats as done in one go (max 200).
  if (action === "chats_done_bulk") {
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(okInt).filter(Boolean).slice(0, 200);
    if (!ids.length) return res.status(400).json({ error: "Bad request" });
    const r = await db.query("UPDATE chats SET status = 'done', updated_at = now() WHERE id = ANY($1::int[]) AND status <> 'done'", [ids]);
    return res.json({ ok: true, changed: r.rowCount });
  }

  // Quick links on the Apps page: the ids sent are the pinned apps, in order. Everything else is unpinned.
  if (action === "app_quick_order") {
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(okInt).filter(Boolean).slice(0, 30);
    await db.query("UPDATE apps SET quick = (id = ANY($1::int[])), qsort = COALESCE(array_position($1::int[], id) - 1, 0), updated_at = now()", [ids]);
    return res.json({ ok: true });
  }

  if (action === "chat_rename") {
    const title = cleanText(b.title, 80);
    if (!id || !title) return res.status(400).json({ error: "Bad request" });
    const r = await db.query("UPDATE chats SET title = $1, updated_at = now() WHERE id = $2", [title, id]);
    return res.json({ ok: r.rowCount === 1 });
  }

  // Triage: one-tap sort of old items. done = already sorted, keep = still to do, drop = not needed.
  if (action === "item_triage") {
    const outcome = String(b.outcome || "");
    if (!id || ["done", "keep", "drop"].indexOf(outcome) < 0) return res.status(400).json({ error: "Bad request" });
    const finished = outcome !== "keep";
    const ans = readAnswer(b);
    if (ans === false) return res.status(400).json({ error: "Answer too long (max 2000 characters)" });
    const r = await db.query(
      "UPDATE items SET triaged_at = now(), outcome = $1, done = $2, done_at = CASE WHEN $2 THEN now() ELSE NULL END, " +
      "answer = CASE WHEN $2 AND $4 <> '' THEN $4 ELSE answer END, " +
      "answer_synced_at = CASE WHEN $2 AND $4 <> '' THEN NULL ELSE answer_synced_at END WHERE id = $3",
      [outcome, finished, id, ans]
    );
    return res.json({ ok: r.rowCount === 1 });
  }

  if (action === "item_untriage") {
    if (!id) return res.status(400).json({ error: "Bad request" });
    const r = await db.query("UPDATE items SET triaged_at = NULL, outcome = '', done = false, done_at = NULL WHERE id = $1", [id]);
    return res.json({ ok: r.rowCount === 1 });
  }

  return res.status(400).json({ error: "Unknown action" });
}

// Optional answer on item_done / item_triage: trimmed text, max 2000 chars.
// Returns "" when none sent, false when too long or not text.
function readAnswer(b) {
  if (b.answer == null) return "";
  if (typeof b.answer !== "string") return false;
  const s = b.answer.trim();
  return s.length > 2000 ? false : s;
}