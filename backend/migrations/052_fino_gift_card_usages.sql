-- ============================================================
-- Fino Phase 3c · Migration 052
-- Table: fino_gift_card_usages
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_gift_card_usages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id        uuid NOT NULL REFERENCES fino_gift_cards(id) ON DELETE CASCADE,
  usage_date          date NOT NULL,
  amount_used         numeric(14,2) NOT NULL CHECK (amount_used > 0),
  description         text,
  ledger_txn_group_id uuid,
  is_deleted          boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gcu_card ON fino_gift_card_usages (gift_card_id);
CREATE INDEX IF NOT EXISTS idx_gcu_date ON fino_gift_card_usages (usage_date);
