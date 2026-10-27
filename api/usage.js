import { db } from "hatchable";

export const access = "admin";
export const methods = ["GET", "POST"];

// GET: Claude usage per chat per day (last 90 days) and Mario's meter readings.
// POST { pct, kind }: save a reading of the claude.ai usage meter (kind 'weekly' or 'session').
export default async function (req, res) {
  if (req.method === "POST") {
    const b = req.body || {};
    const pct = Math.round(Number(b.pct));
    const kind = b.kind === "session" ? "session" : "weekly";
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return res.status(400).json({ error: "Enter a number from 0 to 100." });
    const note = String(b.note || "").slice(0, 200);
    const r = await db.query("INSERT INTO limit_readings (kind, pct, note) VALUES ($1, $2, $3) RETURNING id, kind, pct, note, read_at", [kind, pct, note]);
    return res.json({ ok: true, reading: r.rows[0] });
  }
  const days = await db.query(
    "SELECT chat_url, chat_title, project, day, weighted, input_tokens, output_tokens, cache_read, cache_write, helpers, helper_weighted, breakdown, source, updated_at " +
    "FROM usage_days WHERE day > (now() AT TIME ZONE 'Europe/London')::date - 90 ORDER BY day DESC, weighted DESC LIMIT 2000"
  );
  const readings = await db.query("SELECT id, kind, pct, note, read_at FROM limit_readings WHERE read_at > now() - interval '60 days' ORDER BY read_at ASC LIMIT 500");
  const est = await db.query("SELECT key, value, updated_at FROM meta WHERE key IN ('tokens_per_pct_estimate', 'tokens_per_pct')");
  const note = est.rows.find(function (r) { return r.key === "tokens_per_pct_estimate"; }) || null;
  const per = est.rows.find(function (r) { return r.key === "tokens_per_pct"; });
  const perPct = per ? Number(per.value) : 0;
  res.json({ days: days.rows, readings: readings.rows, estimate: note, per_pct: Number.isFinite(perPct) && perPct > 0 ? perPct : null, now: new Date().toISOString() });
}