-- ═══════════════════════════════════════════════════════════════
-- Alerts + User Settings — Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Add phone and webhook to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_webhook TEXT;

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT,
  message TEXT NOT NULL,
  urgency TEXT DEFAULT 'normal',
  sent_via TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);
