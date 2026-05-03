-- ============================================================
-- Fino Phase 3d · Migration 064
-- Table: fino_cc_payments (bank → card)
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_cc_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_card_id      uuid NOT NULL REFERENCES fino_credit_cards(id),
  payment_date        date NOT NULL,
  amount              numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_via_bank_id    uuid NOT NULL REFERENCES fino_bank_accounts(id),
  linked_statement_id uuid REFERENCES fino_cc_statements(id),
  notes               text,
  ledger_txn_group_id uuid,
  is_deleted          boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccp_card ON fino_cc_payments (credit_card_id);
CREATE INDEX IF NOT EXISTS idx_ccp_date ON fino_cc_payments (payment_date);
