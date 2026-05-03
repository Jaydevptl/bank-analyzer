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
-- ============================================================
-- Fino Phase 3a · Migration 021
-- Table: fino_cash_adjustments
-- Audit trail for explicit cash counting / reconciliation events.
-- Matching ledger entries are written separately on COA 1100.
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_cash_adjustments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_date     date NOT NULL,
  type                text NOT NULL CHECK (type IN ('add','reduce')),
  amount              numeric(14,2) NOT NULL CHECK (amount > 0),
  reason              text NOT NULL,
  notes               text,
  ledger_txn_group_id uuid,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_adj_date ON fino_cash_adjustments (adjustment_date);
-- ============================================================
-- Fino Phase 3a · Migration 022
-- Table: fino_fixed_assets
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_fixed_assets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_name           text NOT NULL,
  category             text,
  purchase_date        date,
  purchase_price       numeric(14,2),
  current_value        numeric(14,2),
  quantity             integer DEFAULT 1,
  vendor_party_id      uuid REFERENCES fino_parties(id),
  payment_status       text DEFAULT 'unpaid' CHECK (payment_status IN ('paid','unpaid','partial')),
  paid_via_account_id  uuid REFERENCES fino_chart_of_accounts(id),
  depreciation_method  text CHECK (depreciation_method IN ('straight_line','wdv','manual')),
  depreciation_rate    numeric(5,2),
  useful_life_years    integer,
  company_id           uuid REFERENCES fino_companies(id),
  notes                text,
  status               text DEFAULT 'active' CHECK (status IN ('active','sold','written_off')),
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_status   ON fino_fixed_assets (status);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_category ON fino_fixed_assets (category);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_company  ON fino_fixed_assets (company_id);
-- ============================================================
-- Fino Phase 3a · Migration 023
-- Table: fino_fixed_asset_adjustments (depreciation/appreciation log)
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_fixed_asset_adjustments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixed_asset_id      uuid NOT NULL REFERENCES fino_fixed_assets(id) ON DELETE CASCADE,
  adjustment_date     date NOT NULL,
  type                text NOT NULL CHECK (type IN ('depreciation','appreciation','revaluation')),
  amount              numeric(14,2) NOT NULL CHECK (amount > 0),
  reason              text,
  ledger_txn_group_id uuid,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fxa_asset ON fino_fixed_asset_adjustments (fixed_asset_id);
CREATE INDEX IF NOT EXISTS idx_fxa_date  ON fino_fixed_asset_adjustments (adjustment_date);
