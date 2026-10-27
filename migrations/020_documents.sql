-- Documents index (27 Oct 2026): one row per file made for Mario. The file itself
-- stays in Google Drive; this table only holds the link and details.
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT 'General',
  kind TEXT NOT NULL DEFAULT 'other',
  party TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'final',
  doc_date DATE,
  drive_file_id TEXT NOT NULL DEFAULT '',
  drive_url TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  size_bytes BIGINT,
  supersedes_id INTEGER REFERENCES documents(id),
  sent_to TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  due_on DATE,
  item_id INTEGER,
  chat_url TEXT NOT NULL DEFAULT '',
  made_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
