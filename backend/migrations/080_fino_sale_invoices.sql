-- ============================================================
-- Fino Phase 5 · Migration 080
-- Table: fino_sale_invoices
-- Header for sale invoices (line items in 081, payments in 082)
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_sale_invoices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number        text UNIQUE NOT NULL,
  invoice_date          date NOT NULL,
  due_date              date,

  customer_party_id     uuid NOT NULL REFERENCES fino_parties(id),

  subtotal              numeric(14,2) DEFAULT 0,
  total_gst             numeric(14,2) DEFAULT 0,
  discount_amount       numeric(14,2) DEFAULT 0,
  round_off             numeric(14,2) DEFAULT 0,
  grand_total           numeric(14,2) DEFAULT 0,

  amount_paid           numeric(14,2) DEFAULT 0,
  balance_due           numeric(14,2) DEFAULT 0,

  status                text DEFAULT 'confirmed'
                       CHECK (status IN ('draft','confirmed','partially_paid','paid','cancelled','deleted')),

  company_id            uuid REFERENCES fino_companies(id),
  notes                 text,
  terms_and_conditions  text,

  revenue_txn_group_id  uuid,
  cogs_txn_group_id     uuid,

  is_deleted            boolean DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_si_customer ON fino_sale_invoices (customer_party_id);
CREATE INDEX IF NOT EXISTS idx_si_date     ON fino_sale_invoices (invoice_date);
CREATE INDEX IF NOT EXISTS idx_si_status   ON fino_sale_invoices (status);
CREATE INDEX IF NOT EXISTS idx_si_number   ON fino_sale_invoices (invoice_number);
