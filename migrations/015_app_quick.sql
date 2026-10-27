-- Quick links at the top of the Apps page: which apps are pinned (quick) and in what order (qsort).
ALTER TABLE apps ADD COLUMN IF NOT EXISTS quick BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE apps ADD COLUMN IF NOT EXISTS qsort INTEGER NOT NULL DEFAULT 0;
INSERT INTO apps (name, about, url, status, note, changed, sort, grp)
SELECT 'Hatchable', 'Your app hosting console.', 'https://hatchable.com/console', 'live', '', '', 40, 'main'
WHERE NOT EXISTS (SELECT 1 FROM apps WHERE name = 'Hatchable');
-- First-time starter set only; after that the phone's Edit button is the boss.
UPDATE apps SET quick = true, qsort = CASE name WHEN 'Heru Accounts' THEN 0 WHEN 'ShiftLog' THEN 1 WHEN 'Cable Log' THEN 2 WHEN 'Talk Tree Chinese' THEN 3 ELSE 4 END
WHERE name IN ('Heru Accounts', 'ShiftLog', 'Cable Log', 'Talk Tree Chinese', 'Hatchable')
AND NOT EXISTS (SELECT 1 FROM apps WHERE quick);