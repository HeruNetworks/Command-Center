import { db } from "hatchable";

export const access = "admin";
export const methods = ["GET"];

// Everything the Map page draws: skills, scheduled jobs, docs and connections
// (map_nodes), the apps list, pending skill fixes, and open work per project.
export default async function (req, res) {
  const nodes = await db.query(
    "SELECT id, kind, name, project, about, url, detail, sort FROM map_nodes WHERE active = true ORDER BY kind, sort, name"
  );
  const apps = await db.query(
    "SELECT id, name, short, about, url, status, grp FROM apps WHERE grp <> 'folded' ORDER BY sort, name"
  );
  const fixes = await db.query(
    "SELECT id, skill, fix, created_at FROM skill_fixes WHERE status = 'pending' ORDER BY created_at DESC LIMIT 200"
  );
  const open = await db.query(
    "SELECT project, count(*)::int AS n FROM items WHERE done = false GROUP BY project"
  );
  const chats = await db.query(
    "SELECT project, count(*)::int AS n FROM chats WHERE last_active > now() - interval '14 days' GROUP BY project"
  );
  // Skill runs and their weighted tokens over the last 7 days (logged at wrap-up from Claude Code chats only).
  const runs = await db.query(
    "SELECT skill, sum(runs)::int AS runs, sum(weighted)::bigint AS weighted, count(DISTINCT chat_url)::int AS chats FROM skill_runs WHERE day > (now() AT TIME ZONE 'Europe/London')::date - 7 GROUP BY skill ORDER BY sum(weighted) DESC"
  );
  // Timeline: what happened each day over the last 42 days (UK dates).
  const tChats = await db.query(
    "SELECT started_on::text AS day, project, count(*)::int AS n FROM chats WHERE started_on > (now() AT TIME ZONE 'Europe/London')::date - 42 GROUP BY 1, 2"
  );
  const tItems = await db.query(
    "SELECT ((created_at AT TIME ZONE 'Europe/London')::date)::text AS day, project, count(*)::int AS n FROM items WHERE created_at > now() - interval '42 days' GROUP BY 1, 2"
  );
  const tDone = await db.query(
    "SELECT ((done_at AT TIME ZONE 'Europe/London')::date)::text AS day, count(*)::int AS n FROM items WHERE done = true AND done_at > now() - interval '42 days' GROUP BY 1"
  );
  const tRuns = await db.query(
    "SELECT day::text AS day, sum(runs)::int AS n FROM skill_runs WHERE day > (now() AT TIME ZONE 'Europe/London')::date - 42 GROUP BY 1"
  );
  res.json({
    nodes: nodes.rows, apps: apps.rows, fixes: fixes.rows, open: open.rows, chats: chats.rows, runs: runs.rows,
    timeline: { chats: tChats.rows, items: tItems.rows, done: tDone.rows, runs: tRuns.rows }
  });
}