-- Answers recorded when Mario ticks off a question. answer_synced_at is set by
-- the Heru Facts sync once the answer has been copied there (NULL = not yet).
ALTER TABLE items ADD COLUMN IF NOT EXISTS answer TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN IF NOT EXISTS answer_synced_at TIMESTAMPTZ NULL;