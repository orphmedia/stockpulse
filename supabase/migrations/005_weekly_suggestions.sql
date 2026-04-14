-- Weekly suggestions from AI podcast analysis
CREATE TABLE IF NOT EXISTS weekly_suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT,
  suggestion_text TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('BUY', 'SELL', 'TRIM', 'ADD', 'HOLD', 'WATCH', 'RESEARCH')),
  reasoning TEXT,
  confidence TEXT CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  target_price NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'passed')),
  week_of DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_sugg_week ON weekly_suggestions (week_of DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_sugg_user ON weekly_suggestions (user_id, week_of DESC);
