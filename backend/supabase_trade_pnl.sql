-- Create trade_pnl table for transaction-wise P&L data
CREATE TABLE IF NOT EXISTS trade_pnl (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_name TEXT NOT NULL DEFAULT '',
  symbol TEXT NOT NULL DEFAULT '',
  buy_date TIMESTAMPTZ,
  sell_date TIMESTAMPTZ,
  quantity NUMERIC DEFAULT 0,
  buy_rate NUMERIC DEFAULT 0,
  sell_rate NUMERIC DEFAULT 0,
  buy_value NUMERIC DEFAULT 0,
  sell_value NUMERIC DEFAULT 0,
  pnl NUMERIC DEFAULT 0,
  source_file TEXT DEFAULT '',
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE trade_pnl ENABLE ROW LEVEL SECURITY;

-- Allow all operations (local app, no auth)
CREATE POLICY "Allow all on trade_pnl" ON trade_pnl FOR ALL USING (true) WITH CHECK (true);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_trade_pnl_account ON trade_pnl(account_name);
CREATE INDEX IF NOT EXISTS idx_trade_pnl_symbol ON trade_pnl(symbol);
CREATE INDEX IF NOT EXISTS idx_trade_pnl_sell_date ON trade_pnl(sell_date);
