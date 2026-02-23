-- ═══════════════════════════════════════════════════════════════
-- StockPulse Database Schema
-- Run this in your Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════

-- Users table (for NextAuth)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Watchlist
CREATE TABLE IF NOT EXISTS watchlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  sector TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- Price history (time-series)
CREATE TABLE IF NOT EXISTS price_history (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  price DECIMAL(12, 4) NOT NULL,
  open_price DECIMAL(12, 4),
  high DECIMAL(12, 4),
  low DECIMAL(12, 4),
  volume BIGINT,
  timestamp TIMESTAMPTZ NOT NULL,
  source TEXT DEFAULT 'alpaca',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast symbol + time queries
CREATE INDEX idx_price_history_symbol_time ON price_history(symbol, timestamp DESC);

-- News articles
CREATE TABLE IF NOT EXISTS news_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  source TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  symbols TEXT[] DEFAULT '{}',
  UNIQUE(url)
);

-- Sentiment scores (linked to news)
CREATE TABLE IF NOT EXISTS sentiment_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID REFERENCES news_articles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  score DECIMAL(5, 4) NOT NULL,        -- -1.0 to 1.0
  confidence DECIMAL(5, 4),             -- 0.0 to 1.0
  model TEXT DEFAULT 'natural',         -- which model scored it
  scored_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sentiment_symbol_time ON sentiment_scores(symbol, scored_at DESC);

-- Technical indicators (precomputed)
CREATE TABLE IF NOT EXISTS technical_indicators (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  rsi_14 DECIMAL(6, 2),
  macd DECIMAL(10, 4),
  macd_signal DECIMAL(10, 4),
  macd_histogram DECIMAL(10, 4),
  sma_20 DECIMAL(12, 4),
  sma_50 DECIMAL(12, 4),
  sma_200 DECIMAL(12, 4),
  bollinger_upper DECIMAL(12, 4),
  bollinger_lower DECIMAL(12, 4),
  volume_avg_20 BIGINT,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_indicators_symbol_time ON technical_indicators(symbol, computed_at DESC);

-- Signals / Recommendations
CREATE TABLE IF NOT EXISTS signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  signal_type TEXT NOT NULL,            -- STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL
  confidence DECIMAL(5, 2) NOT NULL,    -- 0-100
  rsi_component DECIMAL(5, 2),
  macd_component DECIMAL(5, 2),
  sentiment_component DECIMAL(5, 2),
  price_at_signal DECIMAL(12, 4),
  reasoning TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_symbol_time ON signals(symbol, generated_at DESC);

-- Aggregation log (track cron runs)
CREATE TABLE IF NOT EXISTS aggregation_log (
  id BIGSERIAL PRIMARY KEY,
  run_type TEXT NOT NULL,               -- prices, news, sentiment, indicators, signals
  status TEXT NOT NULL,                 -- success, error
  records_processed INT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════
-- Row Level Security (RLS)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own watchlist"
  ON watchlist FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════
-- Helper Functions
-- ═══════════════════════════════════════════════════════════════

-- Get latest price for a symbol
CREATE OR REPLACE FUNCTION get_latest_price(p_symbol TEXT)
RETURNS TABLE(p_price DECIMAL, p_timestamp TIMESTAMPTZ) AS $$
  SELECT price, "timestamp"
  FROM price_history
  WHERE symbol = p_symbol
  ORDER BY "timestamp" DESC
  LIMIT 1;
$$ LANGUAGE SQL;

-- Get latest signal for a symbol
CREATE OR REPLACE FUNCTION get_latest_signal(p_symbol TEXT)
RETURNS TABLE(signal_type TEXT, confidence DECIMAL, generated_at TIMESTAMPTZ) AS $$
  SELECT signal_type, confidence, generated_at
  FROM signals
  WHERE symbol = p_symbol
  ORDER BY generated_at DESC
  LIMIT 1;
$$ LANGUAGE SQL;

-- Get average sentiment over last N hours
CREATE OR REPLACE FUNCTION get_avg_sentiment(p_symbol TEXT, p_hours INT DEFAULT 24)
RETURNS DECIMAL AS $$
  SELECT COALESCE(AVG(score), 0)
  FROM sentiment_scores
  WHERE symbol = p_symbol
    AND scored_at >= NOW() - (p_hours || ' hours')::INTERVAL;
$$ LANGUAGE SQL;
