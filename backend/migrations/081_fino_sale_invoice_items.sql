-- ============================================================
-- Fino Phase 5 · Migration 081
-- Table: fino_sale_invoice_items
-- One row per line on a sale invoice
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_sale_invoice_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            uuid NOT NULL REFERENCES fino_sale_invoices(id) ON DELETE CASCADE,
  item_id               uuid NOT NULL REFERENCES fino_items(id),

  description           text,
  quantity              numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit                  text,
  rate                  numeric(14,2) NOT NULL,

  line_total            numeric(14,2) NOT NULL,
  gst_rate              numeric(5,2) DEFAULT 0,
  gst_amount            numeric(14,2) DEFAULT 0,
  line_grand_total      numeric(14,2) NOT NULL,

  cost_price            numeric(14,2) DEFAULT 0,
  cogs_total            numeric(14,2) DEFAULT 0,

  sort_order            integer DEFAULT 0,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sii_invoice ON fino_sale_invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_sii_item    ON fino_sale_invoice_items (item_id);
