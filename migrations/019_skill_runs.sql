CREATE TABLE IF NOT EXISTS skill_runs (
  day DATE NOT NULL,
  chat_url TEXT NOT NULL,
  skill TEXT NOT NULL,
  runs INT NOT NULL DEFAULT 0,
  weighted BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, chat_url, skill)
)