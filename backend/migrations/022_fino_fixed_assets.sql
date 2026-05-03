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
