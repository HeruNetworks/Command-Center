import { db } from "hatchable";

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
  res.json({ chats: chats.rows, items: items.rows, apps: apps.rows, meta: m, now: new Date().toISOString() });
}