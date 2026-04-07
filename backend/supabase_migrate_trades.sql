-- ============================================================================
-- Share Market Analyzer Tables Migration
-- Run this in Supabase SQL Editor
-- ============================================================================

CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_date TIMESTAMPTZ NOT NULL,
  settle_date TIMESTAMPTZ,
  broker TEXT DEFAULT '',
  account_id TEXT DEFAULT '',
  account_holder TEXT DEFAULT '',
  segment TEXT DEFAULT 'Equity' CHECK (segment IN ('Equity', 'F&O', 'Commodity', 'Currency', 'MF', 'Unknown')),
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  symbol TEXT DEFAULT '',
  isin TEXT DEFAULT '',
  quantity NUMERIC DEFAULT 0,
  price NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  brokerage NUMERIC DEFAULT 0,
  stt NUMERIC DEFAULT 0,
  gst NUMERIC DEFAULT 0,
  sebi_charges NUMERIC DEFAULT 0,
  stamp_duty NUMERIC DEFAULT 0,
  exchange_charges NUMERIC DEFAULT 0,
  other_charges NUMERIC DEFAULT 0,
  total_charges NUMERIC DEFAULT 0,
  net_amount NUMERIC DEFAULT 0,
  exchange TEXT DEFAULT '',
  upload_id TEXT DEFAULT '',
  source_file TEXT DEFAULT '',
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(trade_date);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_broker ON trades(broker);
CREATE INDEX IF NOT EXISTS idx_trades_type ON trades(type);
CREATE INDEX IF NOT EXISTS idx_trades_upload_id ON trades(upload_id);

CREATE TABLE IF NOT EXISTS trade_upload_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id TEXT UNIQUE NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  files JSONB DEFAULT '[]'::jsonb,
  summary JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_reports_upload_id ON trade_upload_reports(upload_id);
