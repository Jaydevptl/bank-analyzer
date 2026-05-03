-- ============================================================
-- Fino Phase 4 · Migration 070
-- Add is_deleted, opening_balance, opening_balance_date, company_id to fino_parties
-- ============================================================

ALTER TABLE fino_parties ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE fino_parties ADD COLUMN IF NOT EXISTS opening_balance numeric(14,2) DEFAULT 0;
ALTER TABLE fino_parties ADD COLUMN IF NOT EXISTS opening_balance_date date;
ALTER TABLE fino_parties ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES fino_companies(id);

CREATE INDEX IF NOT EXISTS idx_parties_deleted ON fino_parties (is_deleted);
CREATE INDEX IF NOT EXISTS idx_parties_company ON fino_parties (company_id);
