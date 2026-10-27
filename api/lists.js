import { db } from "hatchable";
import { okInt, ukToday, payFriday } from "lib/rules.js";

export const access = "admin";
export const methods = ["GET"];

// Read-only data for the checklist page (?checklist=<item id>) and the ZS pay list (?pay=1).
// Totals are worked out here, never trusted from the phone.
export default async function (req, res) {
  const q = req.query || {};
  if (q.checklist) {
    const id = okInt(q.checklist);
    if (!id) return res.status(400).json({ error: "Bad request" });
    const r = await db.query(
      "SELECT i.id, i.project, i.kind, i.text, i.due_on::text AS due_on, i.done, i.checklist_rows, c.url AS chat_url FROM items i LEFT JOIN chats c ON c.id = i.chat_id WHERE i.id = $1", [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Item not found" });
    return res.json({ item: r.rows[0] });
  }
  if (q.pay === "1") {
    const today = ukToday(), friday = payFriday();
    const r = await db.query(
      "SELECT id, project, text, done, amount_gbp, payee, invoice_ref, pay_on::text AS pay_on, paid_on::text AS paid_on FROM items " +
      "WHERE amount_gbp IS NOT NULL AND (paid_on IS NULL OR paid_on > (now() AT TIME ZONE 'Europe/London')::date - 60) " +
      "ORDER BY paid_on IS NOT NULL, COALESCE(pay_on, '9999-12-31'), id"
    );
    const t = await db.query(
      "SELECT COALESCE(SUM(amount_gbp) FILTER (WHERE paid_on IS NULL), 0)::text AS unpaid, " +
      "COALESCE(SUM(amount_gbp) FILTER (WHERE paid_on IS NULL AND pay_on <= $1::date), 0)::text AS due_friday, " +
      "count(*) FILTER (WHERE paid_on IS NULL)::int AS unpaid_n, " +
      "count(*) FILTER (WHERE paid_on IS NULL AND pay_on <= $1::date)::int AS due_friday_n, " +
      "COALESCE(SUM(amount_gbp) FILTER (WHERE paid_on > (now() AT TIME ZONE 'Europe/London')::date - 60), 0)::text AS paid_60 " +
      "FROM items WHERE amount_gbp IS NOT NULL", [friday]
    );
    return res.json({ items: r.rows, totals: t.rows[0], today: today, friday: friday });
  }
  return res.status(400).json({ error: "Bad request" });
}
