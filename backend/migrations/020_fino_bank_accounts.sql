-- ============================================================
-- Fino Phase 3a · Migration 020
-- Table: fino_bank_accounts
-- One row per bank account. Auto-creates a sibling COA entry
-- under code 1200 ("Bank Accounts") via the bankAccounts service.
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_bank_accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name          text NOT NULL,
  bank_name             text NOT NULL,
  account_holder        text,
  account_number_last4  text,
  ifsc_code             text,
  account_type          text CHECK (account_type IN ('savings','current','salary','other')),
  opening_balance       numeric(14,2) DEFAULT 0,
  opening_date          date,
  current_balance       numeric(14,2) DEFAULT 0,
  company_id            uuid REFERENCES fino_companies(id),
  linked_account_id     uuid REFERENCES fino_chart_of_accounts(id),
  is_active             boolean DEFAULT true,
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_active  ON fino_bank_accounts (is_active);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_company ON fino_bank_accounts (company_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_linked  ON fino_bank_accounts (linked_account_id);
