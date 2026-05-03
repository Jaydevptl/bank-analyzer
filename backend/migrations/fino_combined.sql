-- ============================================================
-- Fino Phase 2 · Migration 010
-- Table: fino_companies
-- Stores businesses + personal pool (anything money flows into/out of as a unit)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fino_companies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  type              text NOT NULL CHECK (type IN ('own','partnered','external','personal')),
  ownership_percent numeric(5,2) DEFAULT 100,
  is_personal       boolean DEFAULT false,
  currency          text DEFAULT 'INR',
  start_date        date,
  status            text DEFAULT 'active' CHECK (status IN ('active','paused','closed')),
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_status ON fino_companies (status);
CREATE INDEX IF NOT EXISTS idx_companies_type   ON fino_companies (type);
-- ============================================================
-- Fino Phase 2 · Migration 011
-- Table: fino_parties
-- Unified contacts table — a party can hold multiple roles
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_parties (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  contact_phone           text,
  contact_email           text,
  gstin                   text,
  pan                     text,
  address                 text,
  -- Role flags (a party can fill multiple roles)
  is_customer             boolean DEFAULT false,
  is_supplier             boolean DEFAULT false,
  is_conversion_vendor    boolean DEFAULT false,
  is_hawala_agent         boolean DEFAULT false,
  is_borrower             boolean DEFAULT false,
  is_partner              boolean DEFAULT false,
  is_employee             boolean DEFAULT false,
  -- Conversion-vendor specific
  default_conversion_pct  numeric(5,2),
  -- Hawala-agent specific
  default_inr_usd_rate    numeric(10,4),
  -- Reliability tracking
  reliability_score       integer CHECK (reliability_score BETWEEN 1 AND 5),
  notes                   text,
  status                  text DEFAULT 'active',
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parties_name ON fino_parties (name);
CREATE INDEX IF NOT EXISTS idx_parties_role ON fino_parties (is_customer, is_supplier, is_conversion_vendor);
-- ============================================================
-- Fino Phase 2 · Migration 012
-- Table: fino_items
-- Master for products + services
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_items (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  type                    text NOT NULL CHECK (type IN ('product','service')),
  category                text,
  unit                    text,
  hsn_sac_code            text,
  default_sale_price      numeric(14,2),
  default_purchase_price  numeric(14,2),
  current_stock_qty       numeric(14,3) DEFAULT 0,
  current_stock_value     numeric(14,2) DEFAULT 0,
  gst_rate                numeric(5,2),
  weight_grams            numeric(10,2),
  notes                   text,
  status                  text DEFAULT 'active',
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_name     ON fino_items (name);
CREATE INDEX IF NOT EXISTS idx_items_category ON fino_items (category);
-- ============================================================
-- Fino Phase 2 · Migration 013
-- Table: fino_chart_of_accounts (+ seed)
-- Standard chart of accounts — every ledger entry references this
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_chart_of_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  sub_type    text,
  parent_id   uuid REFERENCES fino_chart_of_accounts(id),
  is_system   boolean DEFAULT false,
  is_active   boolean DEFAULT true,
  description text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coa_type ON fino_chart_of_accounts (type);
CREATE INDEX IF NOT EXISTS idx_coa_code ON fino_chart_of_accounts (code);

-- ───── Seed: standard chart of accounts ─────
INSERT INTO fino_chart_of_accounts (code, name, type, sub_type, is_system) VALUES
  -- Assets
  ('1100', 'Cash in Hand',            'asset',     'current_asset',     true),
  ('1200', 'Bank Accounts',           'asset',     'current_asset',     true),
  ('1300', 'Accounts Receivable',     'asset',     'current_asset',     true),
  ('1400', 'Inventory',               'asset',     'current_asset',     true),
  ('1500', 'Loans Given',             'asset',     'current_asset',     true),
  ('1600', 'Gift Cards',              'asset',     'current_asset',     true),
  ('1610', 'Amazon Cards (USD)',      'asset',     'current_asset',     true),
  ('1700', 'TDS Receivable',          'asset',     'current_asset',     true),
  ('1800', 'GST Input Credit',        'asset',     'current_asset',     true),
  ('1900', 'Investments',             'asset',     'non_current_asset', true),
  ('1950', 'Fixed Assets',            'asset',     'non_current_asset', true),
  -- Liabilities
  ('2100', 'Accounts Payable',        'liability', 'current_liability', true),
  ('2200', 'Credit Cards Payable',    'liability', 'current_liability', true),
  ('2300', 'GST Output Liability',    'liability', 'current_liability', true),
  ('2400', 'Partner Capital Payable', 'liability', 'current_liability', true),
  -- Equity
  ('3100', 'Owner''s Capital',        'equity',    'equity',            true),
  ('3200', 'Drawings',                'equity',    'equity',            true),
  -- Income
  ('4100', 'Sales',                   'income',    'operating_income',  true),
  ('4200', 'Other Income',            'income',    'other_income',      true),
  ('4210', 'Bank Interest',           'income',    'other_income',      true),
  ('4220', 'Dividend Received',       'income',    'other_income',      true),
  ('4230', 'Cashback / Rewards',      'income',    'other_income',      true),
  ('4240', 'Gift Card Discount',      'income',    'other_income',      true),
  ('4250', 'Refunds',                 'income',    'other_income',      true),
  ('4260', 'TDS Refund',              'income',    'other_income',      true),
  -- Expenses
  ('5100', 'Purchases',               'expense',   'cost_of_sales',     true),
  ('5200', 'Direct Expenses',         'expense',   'direct_expense',    true),
  ('5210', 'Cash Conversion Charge',  'expense',   'direct_expense',    true),
  ('5220', 'Bank Charges',            'expense',   'direct_expense',    true),
  ('5230', 'Shipping',                'expense',   'direct_expense',    true),
  ('5240', 'Custom Duty',             'expense',   'direct_expense',    true),
  ('5300', 'Salary',                  'expense',   'indirect_expense',  true),
  ('5400', 'Office Rent',             'expense',   'indirect_expense',  true),
  ('5500', 'Marketing / Ads',         'expense',   'indirect_expense',  true),
  ('5600', 'Office Expenses',         'expense',   'indirect_expense',  true),
  ('5700', 'Misc Expenses',           'expense',   'indirect_expense',  true)
ON CONFLICT (code) DO NOTHING;
-- ============================================================
-- Fino Phase 2 · Migration 014
-- Table: fino_ledger_entries
-- Double-entry ledger. Each money movement = 2 rows sharing txn_group_id.
--
-- INVARIANT (enforced at app layer for now; sum-to-zero CHECK trigger
-- to be added in Phase 19 once usage patterns are stable):
--   For every txn_group_id:
--     SUM(amount WHERE direction='debit') = SUM(amount WHERE direction='credit')
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_ledger_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_group_id  uuid NOT NULL,
  txn_date      date NOT NULL,
  account_id    uuid NOT NULL REFERENCES fino_chart_of_accounts(id),
  direction     text NOT NULL CHECK (direction IN ('debit','credit')),
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  description   text,
  source_module text,
  source_id     uuid,
  party_id      uuid REFERENCES fino_parties(id),
  company_id    uuid REFERENCES fino_companies(id),
  notes         text,
  created_by    uuid,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_date    ON fino_ledger_entries (txn_date);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON fino_ledger_entries (account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_group   ON fino_ledger_entries (txn_group_id);
CREATE INDEX IF NOT EXISTS idx_ledger_source  ON fino_ledger_entries (source_module, source_id);
CREATE INDEX IF NOT EXISTS idx_ledger_company ON fino_ledger_entries (company_id);
-- ============================================================
-- Fino Phase 2 · Migration 015
-- Table: fino_business_tags
-- Generic many-to-many: any record (source_module, source_id) → companies
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_business_tags (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_module   text NOT NULL,
  source_id       uuid NOT NULL,
  company_id      uuid NOT NULL REFERENCES fino_companies(id),
  allocation_pct  numeric(5,2) DEFAULT 100,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_btags_source  ON fino_business_tags (source_module, source_id);
CREATE INDEX IF NOT EXISTS idx_btags_company ON fino_business_tags (company_id);
-- ============================================================
-- Fino Phase 2 · Migration 016
-- Table: fino_attachments
-- Generic file attachments — any record can hold N files
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_module text NOT NULL,
  source_id     uuid NOT NULL,
  file_name     text NOT NULL,
  file_url      text NOT NULL,
  file_size     integer,
  mime_type     text,
  uploaded_by   uuid,
  uploaded_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attach_source ON fino_attachments (source_module, source_id);
-- ============================================================
-- Fino Phase 2 · Migration 017
-- Seed: 3 default companies
-- Idempotent — only inserts if name not present
-- ============================================================

INSERT INTO fino_companies (name, type, ownership_percent, is_personal, currency)
SELECT 'Dropy Retails', 'own', 100, false, 'INR'
WHERE NOT EXISTS (SELECT 1 FROM fino_companies WHERE name = 'Dropy Retails');

INSERT INTO fino_companies (name, type, ownership_percent, is_personal, currency)
SELECT 'Rudra Retails', 'own', 100, false, 'INR'
WHERE NOT EXISTS (SELECT 1 FROM fino_companies WHERE name = 'Rudra Retails');

INSERT INTO fino_companies (name, type, ownership_percent, is_personal, currency)
SELECT 'Personal', 'personal', 100, true, 'INR'
WHERE NOT EXISTS (SELECT 1 FROM fino_companies WHERE name = 'Personal');
