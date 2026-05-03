-- ============================================================
-- Fino Phase 4 · Migration 071
-- Add is_deleted, sku, barcode, opening_stock_*, company_id to fino_items
-- ============================================================

ALTER TABLE fino_items ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE fino_items ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE fino_items ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE fino_items ADD COLUMN IF NOT EXISTS opening_stock_qty numeric(14,3) DEFAULT 0;
ALTER TABLE fino_items ADD COLUMN IF NOT EXISTS opening_stock_rate numeric(14,2) DEFAULT 0;
ALTER TABLE fino_items ADD COLUMN IF NOT EXISTS opening_stock_date date;
ALTER TABLE fino_items ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES fino_companies(id);

CREATE INDEX IF NOT EXISTS idx_items_deleted ON fino_items (is_deleted);
CREATE INDEX IF NOT EXISTS idx_items_sku ON fino_items (sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_company ON fino_items (company_id);
