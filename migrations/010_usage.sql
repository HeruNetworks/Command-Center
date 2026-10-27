-- Claude usage: one row per chat per UK day (weighted tokens), plus Mario's own readings of the claude.ai usage meter.
CREATE TABLE IF NOT EXISTS usage_days (
  id SERIAL PRIMARY KEY,
  chat_url TEXT NOT NULL,
  chat_title TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT 'General',
  day DATE NOT NULL,
  weighted BIGINT NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_read BIGINT NOT NULL DEFAULT 0,
  cache_write BIGINT NOT NULL DEFAULT 0,
  helpers INTEGER NOT NULL DEFAULT 0,
  helper_weighted BIGINT NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chat_url, day)
);
CREATE TABLE IF NOT EXISTS limit_readings (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'weekly',
  pct INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  read_at TIMESTAMPTZ NOT NULL DEFAULT now()
);