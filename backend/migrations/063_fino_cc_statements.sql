-- ============================================================
-- Fino Phase 3d · Migration 063
-- Table: fino_cc_statements (manual entry; parser comes Phase 9)
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_cc_statements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_card_id      uuid NOT NULL REFERENCES fino_credit_cards(id),
  statement_period    text NOT NULL,
  statement_date      date NOT NULL,
  due_date            date NOT NULL,

  opening_balance     numeric(14,2) DEFAULT 0,
  total_spend         numeric(14,2) DEFAULT 0,
  total_payment       numeric(14,2) DEFAULT 0,
  total_cashback      numeric(14,2) DEFAULT 0,
  total_interest      numeric(14,2) DEFAULT 0,
  total_fees          numeric(14,2) DEFAULT 0,
  closing_balance     numeric(14,2) DEFAULT 0,
  min_amount_due      numeric(14,2) DEFAULT 0,
  total_amount_due    numeric(14,2) DEFAULT 0,

  payment_status      text DEFAULT 'unpaid'
                      CHECK (payment_status IN ('unpaid','partial','paid','overdue')),
  paid_amount         numeric(14,2) DEFAULT 0,
  paid_at             date,

  pdf_url             text,
  notes               text,
  is_deleted          boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccs_card ON fino_cc_statements (credit_card_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ccs_period
  ON fino_cc_statements (credit_card_id, statement_period)
  WHERE is_deleted = false;
