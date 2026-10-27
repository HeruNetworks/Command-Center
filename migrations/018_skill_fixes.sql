CREATE TABLE IF NOT EXISTS skill_fixes (
  id SERIAL PRIMARY KEY,
  skill TEXT NOT NULL,
  fix TEXT NOT NULL,
  source_chat TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ
)