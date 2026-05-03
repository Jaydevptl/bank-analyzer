-- ============================================================
-- Fino Phase 3b · Migration 031
-- Table: fino_loan_repayments (auto-split into interest + principal)
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_loan_repayments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id                 uuid NOT NULL REFERENCES fino_loans_given(id) ON DELETE CASCADE,
  repayment_date          date NOT NULL,
  amount_received         numeric(14,2) NOT NULL CHECK (amount_received > 0),
  principal_portion       numeric(14,2) NOT NULL DEFAULT 0,
  interest_portion        numeric(14,2) NOT NULL DEFAULT 0,
  received_via_account_id uuid NOT NULL REFERENCES fino_chart_of_accounts(id),
  ledger_txn_group_id     uuid,
  notes                   text,
  created_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repayments_loan ON fino_loan_repayments (loan_id);
CREATE INDEX IF NOT EXISTS idx_repayments_date ON fino_loan_repayments (repayment_date);
