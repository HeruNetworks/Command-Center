-- Where an app shows on the Apps page: main (visible), console (tucked under Console), folded (folded away).
ALTER TABLE apps ADD COLUMN IF NOT EXISTS grp TEXT NOT NULL DEFAULT 'main';
UPDATE apps SET grp = 'folded' WHERE name IN ('Cable Log Next', 'Four Tones Chinese', 'Seven Spinner Bookings', 'Soundcheck', 'Cable English', 'Heru Status Board', 'Command Centre (old page)');
UPDATE apps SET grp = 'console' WHERE name IN ('Ras 3.0 Oracle', 'TimeGlyph Oracle', 'ZS Cabling website', 'Operative Register (ZS)');
UPDATE apps SET sort = 2 WHERE name = 'Talk Tree Chinese';