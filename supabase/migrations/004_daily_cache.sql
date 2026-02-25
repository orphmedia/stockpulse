-- Daily cache for pre-generated content (discoveries, briefings, etc.)
CREATE TABLE IF NOT EXISTS daily_cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_daily_cache_updated ON daily_cache (updated_at DESC);
