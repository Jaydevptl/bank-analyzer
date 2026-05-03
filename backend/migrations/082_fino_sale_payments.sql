-- ============================================================
-- Fino Phase 5 · Migration 082
-- Table: fino_sale_payments
-- Payment receipts against a sale invoice
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_sale_payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            uuid NOT NULL REFERENCES fino_sale_invoices(id),
  payment_date          date NOT NULL,
  amount                numeric(14,2) NOT NULL CHECK (amount > 0),

  payment_mode          text NOT NULL
                       CHECK (payment_mode IN ('bank','cash','upi','cheque','credit_card','other')),
  paid_via_account_id   uuid REFERENCES fino_chart_of_accounts(id),

  reference_number      text,
  notes                 text,

  ledger_txn_group_id   uuid,
  is_deleted            boolean DEFAULT false,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sp_invoice ON fino_sale_payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_sp_date    ON fino_sale_payments (payment_date);
