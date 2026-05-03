-- ============================================================
-- Fino Phase 3c · Migration 053
-- Table: fino_gift_card_transfers
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_gift_card_transfers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_date       date NOT NULL,
  from_card_id        uuid NOT NULL REFERENCES fino_gift_cards(id),
  to_card_id          uuid NOT NULL REFERENCES fino_gift_cards(id),
  amount              numeric(14,2) NOT NULL CHECK (amount > 0),
  reason              text,
  ledger_txn_group_id uuid,
  is_deleted          boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),

  CONSTRAINT chk_gct_diff_cards CHECK (from_card_id <> to_card_id)
);

CREATE INDEX IF NOT EXISTS idx_gct_from ON fino_gift_card_transfers (from_card_id);
CREATE INDEX IF NOT EXISTS idx_gct_to   ON fino_gift_card_transfers (to_card_id);
