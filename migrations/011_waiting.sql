-- Item 5: "Waiting on someone" items: who, and since when.
ALTER TABLE items ADD COLUMN IF NOT EXISTS waiting_on TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN IF NOT EXISTS waiting_since DATE;
-- Item 6: who gets the 07:00 overdue email (a setting, not hard-coded).
INSERT INTO meta (key, value, updated_at) VALUES ('nudge_email', 'mario@herunetworks.co.uk', now()) ON CONFLICT (key) DO NOTHING;