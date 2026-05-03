-- ============================================================
-- Fino Phase 3a · Migration 023
-- Table: fino_fixed_asset_adjustments (depreciation/appreciation log)
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_fixed_asset_adjustments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixed_asset_id      uuid NOT NULL REFERENCES fino_fixed_assets(id) ON DELETE CASCADE,
  adjustment_date     date NOT NULL,
  type                text NOT NULL CHECK (type IN ('depreciation','appreciation','revaluation')),
  amount              numeric(14,2) NOT NULL CHECK (amount > 0),
  reason              text,
  ledger_txn_group_id uuid,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fxa_asset ON fino_fixed_asset_adjustments (fixed_asset_id);
CREATE INDEX IF NOT EXISTS idx_fxa_date  ON fino_fixed_asset_adjustments (adjustment_date);
