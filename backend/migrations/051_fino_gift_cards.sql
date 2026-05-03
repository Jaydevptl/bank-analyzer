-- ============================================================
-- Fino Phase 3c · Migration 051
-- Table: fino_gift_cards
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_gift_cards (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id              uuid NOT NULL REFERENCES fino_gift_card_platforms(id),
  card_label               text,
  card_number_last4        text,
  face_value               numeric(14,2) NOT NULL CHECK (face_value > 0),
  paid_amount              numeric(14,2) NOT NULL CHECK (paid_amount > 0),
  discount_amount          numeric(14,2) GENERATED ALWAYS AS (face_value - paid_amount) STORED,
  purchase_date            date NOT NULL,
  paid_via_account_id      uuid NOT NULL REFERENCES fino_chart_of_accounts(id),
  expiry_date              date,
  current_balance          numeric(14,2) NOT NULL,
  status                   text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','exhausted','expired','closed','deleted','cancelled')),
  company_id               uuid REFERENCES fino_companies(id),
  notes                    text,
  is_deleted               boolean DEFAULT false,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gc_platform ON fino_gift_cards (platform_id);
CREATE INDEX IF NOT EXISTS idx_gc_status   ON fino_gift_cards (status);
CREATE INDEX IF NOT EXISTS idx_gc_company  ON fino_gift_cards (company_id);
