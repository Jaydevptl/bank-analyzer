-- ============================================================
-- Fino Phase 3 Polish · Migration 041
-- Add is_deleted / is_reversed flags + new loan statuses
-- ============================================================

ALTER TABLE fino_bank_accounts             ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE fino_cash_adjustments          ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE fino_fixed_assets              ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE fino_fixed_asset_adjustments   ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE fino_loans_given               ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE fino_loan_repayments           ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE fino_ledger_entries            ADD COLUMN IF NOT EXISTS is_reversed boolean DEFAULT false;

-- Extend loan status check
ALTER TABLE fino_loans_given DROP CONSTRAINT IF EXISTS fino_loans_given_status_check;
ALTER TABLE fino_loans_given ADD CONSTRAINT fino_loans_given_status_check
  CHECK (status IN ('active','partially_repaid','closed','defaulted','written_off','cancelled','deleted'));
