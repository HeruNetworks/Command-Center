-- Short names for the small quick-link tiles (the full name still shows in the apps list).
ALTER TABLE apps ADD COLUMN IF NOT EXISTS short TEXT NOT NULL DEFAULT '';
UPDATE apps SET short = CASE name
  WHEN 'Heru Accounts' THEN 'Accounts'
  WHEN 'Talk Tree Chinese' THEN 'TT Chinese'
  WHEN 'Heru Sign' THEN 'Sign'
  WHEN 'Heru Networks website' THEN 'Website'
END
WHERE name IN ('Heru Accounts', 'Talk Tree Chinese', 'Heru Sign', 'Heru Networks website') AND short = '';