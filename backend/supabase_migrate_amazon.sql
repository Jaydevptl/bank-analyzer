-- ==============================================================
-- Amazon Multi-Card Tracking & Reconciliation System
-- Phase 1: Foundation tables
-- Run this in Supabase SQL editor
-- ==============================================================

-- ───────────────────────────────────────────────────────────────
-- 1. CARDS MASTER TABLE
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS amz_cards (
  id BIGSERIAL PRIMARY KEY,
  card_name TEXT NOT NULL,
  last_4 TEXT NOT NULL,
  opening_balance NUMERIC(12, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(last_4)
);

CREATE INDEX IF NOT EXISTS idx_amz_cards_last4 ON amz_cards(last_4);

-- ───────────────────────────────────────────────────────────────
-- 2. ORDERS MASTER TABLE (lifecycle tracking)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS amz_orders (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  order_date DATE,
  latest_status TEXT,              -- Pending | Pending Fulfillment | Payment Confirmed | Closed | Cancelled
  is_closed BOOLEAN DEFAULT FALSE, -- locks further updates
  order_net_total NUMERIC(12, 2) DEFAULT 0,
  order_quantity INTEGER DEFAULT 0,
  account_group TEXT,
  account_user TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  raw_meta JSONB
);

CREATE INDEX IF NOT EXISTS idx_amz_orders_status ON amz_orders(latest_status);
CREATE INDEX IF NOT EXISTS idx_amz_orders_date   ON amz_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_amz_orders_closed ON amz_orders(is_closed);

-- ───────────────────────────────────────────────────────────────
-- 3. TRANSACTIONS TABLE (financial ledger)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS amz_transactions (
  id BIGSERIAL PRIMARY KEY,
  unique_key TEXT NOT NULL UNIQUE,         -- OrderID + PaymentAmount + PaymentDate
  txn_type TEXT NOT NULL DEFAULT 'Purchase', -- Purchase | Add | Transfer | Refund
  txn_date DATE NOT NULL,                  -- Payment Date for purchases
  amount NUMERIC(12, 2) NOT NULL,
  card_id BIGINT REFERENCES amz_cards(id) ON DELETE SET NULL,
  card_last4 TEXT,                         -- snapshot (for unmapped)
  from_card_id BIGINT REFERENCES amz_cards(id) ON DELETE SET NULL,
  to_card_id BIGINT REFERENCES amz_cards(id) ON DELETE SET NULL,
  order_id TEXT,
  payment_reference_id TEXT,
  payment_instrument_type TEXT,
  asin TEXT,
  title TEXT,
  notes TEXT,
  raw_row JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amz_txn_card     ON amz_transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_amz_txn_order    ON amz_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_amz_txn_type     ON amz_transactions(txn_type);
CREATE INDEX IF NOT EXISTS idx_amz_txn_date     ON amz_transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_amz_txn_last4    ON amz_transactions(card_last4);

-- ───────────────────────────────────────────────────────────────
-- 4. UPLOAD REPORTS (audit trail)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS amz_upload_reports (
  id BIGSERIAL PRIMARY KEY,
  upload_id TEXT NOT NULL UNIQUE,
  file_name TEXT,
  total_rows INTEGER DEFAULT 0,
  orders_created INTEGER DEFAULT 0,
  orders_updated INTEGER DEFAULT 0,
  orders_locked INTEGER DEFAULT 0,          -- skipped because already closed
  transactions_created INTEGER DEFAULT 0,
  transactions_duplicate INTEGER DEFAULT 0,
  unmapped_last4 JSONB,                     -- [{last4, count, sampleTitle}]
  errors JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────────
-- 5. BALANCE VIEW (computed per card)
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW amz_card_balances AS
SELECT
  c.id,
  c.card_name,
  c.last_4,
  c.opening_balance,
  COALESCE(SUM(CASE WHEN t.txn_type = 'Add'      AND t.card_id    = c.id THEN t.amount END), 0) AS total_added,
  COALESCE(SUM(CASE WHEN t.txn_type = 'Transfer' AND t.to_card_id = c.id THEN t.amount END), 0) AS transfer_in,
  COALESCE(SUM(CASE WHEN t.txn_type = 'Purchase' AND t.card_id    = c.id THEN t.amount END), 0) AS total_purchases,
  COALESCE(SUM(CASE WHEN t.txn_type = 'Transfer' AND t.from_card_id = c.id THEN t.amount END), 0) AS transfer_out,
  COALESCE(SUM(CASE WHEN t.txn_type = 'Refund'   AND t.card_id    = c.id THEN t.amount END), 0) AS total_refunded,
  (
    c.opening_balance
    + COALESCE(SUM(CASE WHEN t.txn_type = 'Add'      AND t.card_id    = c.id THEN t.amount END), 0)
    + COALESCE(SUM(CASE WHEN t.txn_type = 'Transfer' AND t.to_card_id = c.id THEN t.amount END), 0)
    + COALESCE(SUM(CASE WHEN t.txn_type = 'Refund'   AND t.card_id    = c.id THEN t.amount END), 0)
    - COALESCE(SUM(CASE WHEN t.txn_type = 'Purchase' AND t.card_id    = c.id THEN t.amount END), 0)
    - COALESCE(SUM(CASE WHEN t.txn_type = 'Transfer' AND t.from_card_id = c.id THEN t.amount END), 0)
  ) AS current_balance
FROM amz_cards c
LEFT JOIN amz_transactions t ON (t.card_id = c.id OR t.from_card_id = c.id OR t.to_card_id = c.id)
GROUP BY c.id;
