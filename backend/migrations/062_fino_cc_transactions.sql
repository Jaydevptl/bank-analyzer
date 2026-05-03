-- ============================================================
-- Fino Phase 3d · Migration 062
-- Table: fino_cc_transactions
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_cc_transactions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_card_id        uuid NOT NULL REFERENCES fino_credit_cards(id),
  txn_date              date NOT NULL,
  posted_date           date,
  description           text NOT NULL,
  amount                numeric(14,2) NOT NULL,

  txn_type              text NOT NULL DEFAULT 'spend'
                        CHECK (txn_type IN ('spend','refund','cashback','reward_points','interest','fee','fx_markup','reversal')),

  linked_module         text,
  linked_id             uuid,
  expense_category_code text,

  business_id           uuid REFERENCES fino_companies(id),

  ledger_txn_group_id   uuid,
  is_deleted            boolean DEFAULT false,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cct_card_date ON fino_cc_transactions (credit_card_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_cct_type      ON fino_cc_transactions (txn_type);
CREATE INDEX IF NOT EXISTS idx_cct_active    ON fino_cc_transactions (is_deleted);
