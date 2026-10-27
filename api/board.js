import { db } from "hatchable";
import { DOC_SELECT, DOC_WAITING } from "lib/docs.js";

export const access = "admin";
export const methods = ["GET"];

// Everything the board shows: chats and items that are open, plus anything
// finished in the last 14 days, and the list of Mario's apps.
export default async function (req, res) {
  const chats = await db.query(
    "SELECT id, url, title, project, started_on, last_active, status, note, next_step, wrapped_at, working, working_since, updated_at, " +
    "(SELECT COALESCE(SUM(u.weighted), 0)::bigint FROM usage_days u WHERE u.chat_url = chats.url) AS used " +
    "FROM chats WHERE status <> 'done' OR updated_at > now() - interval '14 days' " +
    "ORDER BY COALESCE(last_active, created_at) DESC LIMIT 500"
  );
  const items = await db.query(
    "SELECT id, chat_id, project, kind, text, due_on, done, done_at, created_at, triaged_at, outcome, waiting_on, waiting_since, answer, answer_synced_at " +
    "FROM items WHERE done = false OR done_at > now() - interval '14 days' " +
    "ORDER BY created_at ASC LIMIT 1000"
  );
  const apps = await db.query("SELECT id, name, about, url, status, note, changed, grp, quick, qsort, short FROM apps ORDER BY sort, name");
  const meta = await db.query("SELECT key, value, updated_at FROM meta");
  const m = {};
  meta.rows.forEach(function (r) { m[r.key] = { value: r.value, at: r.updated_at }; });
  // Documents strip on Home and chips on items (27 Oct 2026). A failure here never stops the board loading.
  let docs = { recent: [], waiting: 0, by_item: [] };
  try {
    const recent = await db.query("SELECT x.id, x.title, x.project, x.status, x.doc_date, x.created_at FROM (" + DOC_SELECT + ") x WHERE x.status <> 'superseded' ORDER BY COALESCE(x.doc_date::date, (x.created_at AT TIME ZONE 'Europe/London')::date) DESC, x.id DESC LIMIT 5");
    const waiting = await db.query("SELECT count(*)::int AS n FROM (" + DOC_SELECT + ") x WHERE " + DOC_WAITING);
    const byItem = await db.query("SELECT x.id, x.item_id, x.title, x.status FROM (" + DOC_SELECT + ") x WHERE x.item_id IS NOT NULL ORDER BY x.id");
    docs = { recent: recent.rows, waiting: waiting.rows[0].n, by_item: byItem.rows };
  } catch (e) { docs.error = true; }
  res.json({ chats: chats.rows, items: items.rows, apps: apps.rows, meta: m, docs: docs, now: new Date().toISOString() });
}