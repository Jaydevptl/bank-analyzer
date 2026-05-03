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
