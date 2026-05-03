-- ============================================================
-- Fino Phase 3b · Migration 032
-- Table: fino_loan_interest_accruals (audit snapshots; NOT source of truth)
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_loan_interest_accruals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id               uuid NOT NULL REFERENCES fino_loans_given(id) ON DELETE CASCADE,
  as_of_date            date NOT NULL,
  outstanding_principal numeric(14,2) NOT NULL,
  interest_accrued      numeric(14,2) NOT NULL,
  total_outstanding     numeric(14,2) NOT NULL,
  computed_at           timestamptz DEFAULT now(),
  notes                 text
);

CREATE INDEX IF NOT EXISTS idx_accruals_loan ON fino_loan_interest_accruals (loan_id, as_of_date);
