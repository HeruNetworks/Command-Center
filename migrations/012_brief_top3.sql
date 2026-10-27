-- Item 7: the morning brief reads its "Top 3 from the board" from this view.
-- Order: overdue, due today, chases waiting 7+ days, due this week, oldest questions.
CREATE OR REPLACE VIEW brief_top3 AS
SELECT t.id, t.project, t.kind, t.text, t.due_on, t.waiting_on, t.waiting_since, t.reason, t.chat_url
FROM (
  SELECT i.id, i.project, i.kind, i.text, i.due_on, i.waiting_on, i.waiting_since, i.created_at, c.url AS chat_url,
    CASE
      WHEN i.due_on IS NOT NULL AND i.due_on < (now() AT TIME ZONE 'Europe/London')::date THEN 1
      WHEN i.due_on = (now() AT TIME ZONE 'Europe/London')::date THEN 2
      WHEN i.kind = 'waiting' AND COALESCE(i.waiting_since, i.created_at::date) <= (now() AT TIME ZONE 'Europe/London')::date - 7 THEN 3
      WHEN i.due_on IS NOT NULL AND i.due_on <= (now() AT TIME ZONE 'Europe/London')::date + 7 THEN 4
      WHEN i.kind = 'question' THEN 5
      ELSE 9
    END AS rnk,
    CASE
      WHEN i.due_on IS NOT NULL AND i.due_on < (now() AT TIME ZONE 'Europe/London')::date THEN 'Overdue'
      WHEN i.due_on = (now() AT TIME ZONE 'Europe/London')::date THEN 'Due today'
      WHEN i.kind = 'waiting' AND COALESCE(i.waiting_since, i.created_at::date) <= (now() AT TIME ZONE 'Europe/London')::date - 7 THEN 'Chase'
      WHEN i.due_on IS NOT NULL AND i.due_on <= (now() AT TIME ZONE 'Europe/London')::date + 7 THEN 'Due this week'
      ELSE 'Question to answer'
    END AS reason
  FROM items i LEFT JOIN chats c ON c.id = i.chat_id
  WHERE i.done = false
) t
WHERE t.rnk < 9
ORDER BY t.rnk, t.due_on NULLS LAST, t.created_at, t.id
LIMIT 3;