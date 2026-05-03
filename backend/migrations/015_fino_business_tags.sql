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
