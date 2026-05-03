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
