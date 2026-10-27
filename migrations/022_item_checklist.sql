-- Site checklists (27 Oct 2026): an item of kind "checklist" keeps its rows here:
-- [{person, date, look_for, result: "" | "ok" | "issue" | "na", note}].
ALTER TABLE items ADD COLUMN IF NOT EXISTS checklist_rows JSONB NOT NULL DEFAULT '[]'::jsonb
