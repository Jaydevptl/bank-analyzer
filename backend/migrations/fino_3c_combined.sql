-- ============================================================
-- Fino Phase 3c · Migration 050
-- Table: fino_gift_card_platforms (+ 5 seeds)
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_gift_card_platforms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text UNIQUE NOT NULL,
  display_color text,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

INSERT INTO fino_gift_card_platforms (name, display_color) VALUES
  ('Amazon',   '#FF9900'),
  ('Flipkart', '#2874F0'),
  ('Myntra',   '#FF3F6C'),
  ('Nykaa',    '#FC2779'),
  ('Other',    '#888888')
ON CONFLICT (name) DO NOTHING;
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
-- ============================================================
-- Fino Phase 3c · Migration 052
-- Table: fino_gift_card_usages
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_gift_card_usages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id        uuid NOT NULL REFERENCES fino_gift_cards(id) ON DELETE CASCADE,
  usage_date          date NOT NULL,
  amount_used         numeric(14,2) NOT NULL CHECK (amount_used > 0),
  description         text,
  ledger_txn_group_id uuid,
  is_deleted          boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gcu_card ON fino_gift_card_usages (gift_card_id);
CREATE INDEX IF NOT EXISTS idx_gcu_date ON fino_gift_card_usages (usage_date);
-- ============================================================
-- Fino Phase 3c · Migration 053
-- Table: fino_gift_card_transfers
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_gift_card_transfers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_date       date NOT NULL,
  from_card_id        uuid NOT NULL REFERENCES fino_gift_cards(id),
  to_card_id          uuid NOT NULL REFERENCES fino_gift_cards(id),
  amount              numeric(14,2) NOT NULL CHECK (amount > 0),
  reason              text,
  ledger_txn_group_id uuid,
  is_deleted          boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),

  CONSTRAINT chk_gct_diff_cards CHECK (from_card_id <> to_card_id)
);

CREATE INDEX IF NOT EXISTS idx_gct_from ON fino_gift_card_transfers (from_card_id);
CREATE INDEX IF NOT EXISTS idx_gct_to   ON fino_gift_card_transfers (to_card_id);
