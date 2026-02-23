-- ═══════════════════════════════════════════════════════════════
-- Portfolio Table — Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS portfolio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  shares DECIMAL(12,4) NOT NULL DEFAULT 0,
  avg_cost DECIMAL(12,4) NOT NULL DEFAULT 0,
  name TEXT,
  sector TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio(user_id);
