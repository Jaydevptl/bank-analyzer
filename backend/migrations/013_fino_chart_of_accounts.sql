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
