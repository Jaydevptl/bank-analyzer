-- ============================================================
-- Fino Phase 3a · Migration 021
-- Table: fino_cash_adjustments
-- Audit trail for explicit cash counting / reconciliation events.
-- Matching ledger entries are written separately on COA 1100.
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_cash_adjustments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_date     date NOT NULL,
  type                text NOT NULL CHECK (type IN ('add','reduce')),
  amount              numeric(14,2) NOT NULL CHECK (amount > 0),
  reason              text NOT NULL,
  notes               text,
  ledger_txn_group_id uuid,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_adj_date ON fino_cash_adjustments (adjustment_date);
