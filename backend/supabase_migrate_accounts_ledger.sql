-- ============================================================================
-- Migration: Accounts, Report Type, Ledger Support
-- Run this in Supabase SQL Editor AFTER supabase_migrate_trades.sql
-- ============================================================================

-- 1. Add account_name and report_type to trades table
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS account_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS report_type TEXT DEFAULT 'Trades'
    CHECK (report_type IN ('Trades', 'PnL', 'Ledger'));

CREATE INDEX IF NOT EXISTS idx_trades_account_name ON trades(account_name);
CREATE INDEX IF NOT EXISTS idx_trades_report_type ON trades(report_type);

-- 2. Add file_hash to trade_upload_reports for duplicate detection
ALTER TABLE trade_upload_reports
  ADD COLUMN IF NOT EXISTS file_hashes JSONB DEFAULT '[]'::jsonb;

-- 3. Stock Accounts master table
CREATE TABLE IF NOT EXISTS stock_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name TEXT NOT NULL,
  broker TEXT DEFAULT '',
  account_holder TEXT DEFAULT '',
  account_id TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_accounts_name ON stock_accounts(account_name);

-- 4. Ledger Entries table
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date TIMESTAMPTZ NOT NULL,
  account_name TEXT DEFAULT '',
  broker TEXT DEFAULT '',
  account_id TEXT DEFAULT '',
  entry_type TEXT DEFAULT 'Other'
    CHECK (entry_type IN ('Deposit', 'Withdrawal', 'Dividend', 'Charges', 'Tax', 'Interest', 'Other')),
  description TEXT DEFAULT '',
  amount NUMERIC DEFAULT 0,
  balance NUMERIC DEFAULT 0,
  upload_id TEXT DEFAULT '',
  source_file TEXT DEFAULT '',
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account_name);
CREATE INDEX IF NOT EXISTS idx_ledger_broker ON ledger_entries(broker);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_ledger_upload ON ledger_entries(upload_id);
