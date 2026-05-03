-- ============================================================
-- Fino Phase 3b · Migration 030
-- Table: fino_loans_given
-- Loans we GIVE (asset side). Borrower is a fino_parties row with is_borrower=true.
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_loans_given (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_party_id        uuid NOT NULL REFERENCES fino_parties(id),
  loan_label               text,
  principal_amount         numeric(14,2) NOT NULL CHECK (principal_amount > 0),
  disbursed_date           date NOT NULL,
  interest_rate_percent    numeric(7,4) NOT NULL DEFAULT 0,
  interest_type            text NOT NULL DEFAULT 'simple'
                           CHECK (interest_type IN ('simple','compound','none')),
  compound_frequency       text CHECK (compound_frequency IN ('monthly','quarterly','yearly')),
  disbursed_via_account_id uuid NOT NULL REFERENCES fino_chart_of_accounts(id),
  expected_return_date     date,
  notes                    text,
  outstanding_principal    numeric(14,2) DEFAULT 0,
  total_interest_accrued   numeric(14,2) DEFAULT 0,
  total_repaid             numeric(14,2) DEFAULT 0,
  status                   text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','partially_repaid','closed','defaulted','written_off')),
  company_id               uuid REFERENCES fino_companies(id),
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loans_borrower       ON fino_loans_given (borrower_party_id);
CREATE INDEX IF NOT EXISTS idx_loans_status         ON fino_loans_given (status);
CREATE INDEX IF NOT EXISTS idx_loans_disbursed_date ON fino_loans_given (disbursed_date);
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
-- ============================================================
-- Fino Phase 3b · Migration 033
-- Seed: Loan Interest Income (4270) — separate income code for cleaner P&L
-- Idempotent.
-- ============================================================

INSERT INTO fino_chart_of_accounts (code, name, type, sub_type, is_system)
VALUES ('4270', 'Loan Interest Income', 'income', 'other_income', true)
ON CONFLICT (code) DO NOTHING;
