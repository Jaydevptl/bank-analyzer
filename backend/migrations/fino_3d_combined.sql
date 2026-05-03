-- ============================================================
-- Fino Phase 3d · Migration 060
-- Add is_card_holder flag on fino_parties
-- ============================================================

ALTER TABLE fino_parties ADD COLUMN IF NOT EXISTS is_card_holder boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_parties_card_holder ON fino_parties (is_card_holder);
-- ============================================================
-- Fino Phase 3d · Migration 061
-- Table: fino_credit_cards (liability side)
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_credit_cards (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_label               text NOT NULL,
  card_holder_party_id     uuid REFERENCES fino_parties(id),
  bank_name                text NOT NULL,
  card_network             text CHECK (card_network IN ('visa','mastercard','amex','rupay','diners','other')),
  card_number_last4        text,
  credit_limit             numeric(14,2),

  statement_day            integer CHECK (statement_day BETWEEN 1 AND 31),
  due_day                  integer CHECK (due_day BETWEEN 1 AND 31),

  default_payment_bank_id  uuid REFERENCES fino_bank_accounts(id),
  reward_program           text,
  point_value_inr          numeric(10,4) DEFAULT 0,

  linked_account_id        uuid REFERENCES fino_chart_of_accounts(id),

  current_outstanding      numeric(14,2) DEFAULT 0,
  total_cashback_ytd       numeric(14,2) DEFAULT 0,
  total_rewards_ytd        numeric(14,2) DEFAULT 0,

  status                   text DEFAULT 'active'
                           CHECK (status IN ('active','inactive','closed','deleted','cancelled')),
  company_id               uuid REFERENCES fino_companies(id),
  notes                    text,
  is_deleted               boolean DEFAULT false,

  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cc_active  ON fino_credit_cards (is_deleted, status);
CREATE INDEX IF NOT EXISTS idx_cc_holder  ON fino_credit_cards (card_holder_party_id);
CREATE INDEX IF NOT EXISTS idx_cc_company ON fino_credit_cards (company_id);
-- ============================================================
-- Fino Phase 3d · Migration 062
-- Table: fino_cc_transactions
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_cc_transactions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_card_id        uuid NOT NULL REFERENCES fino_credit_cards(id),
  txn_date              date NOT NULL,
  posted_date           date,
  description           text NOT NULL,
  amount                numeric(14,2) NOT NULL,

  txn_type              text NOT NULL DEFAULT 'spend'
                        CHECK (txn_type IN ('spend','refund','cashback','reward_points','interest','fee','fx_markup','reversal')),

  linked_module         text,
  linked_id             uuid,
  expense_category_code text,

  business_id           uuid REFERENCES fino_companies(id),

  ledger_txn_group_id   uuid,
  is_deleted            boolean DEFAULT false,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cct_card_date ON fino_cc_transactions (credit_card_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_cct_type      ON fino_cc_transactions (txn_type);
CREATE INDEX IF NOT EXISTS idx_cct_active    ON fino_cc_transactions (is_deleted);
-- ============================================================
-- Fino Phase 3d · Migration 063
-- Table: fino_cc_statements (manual entry; parser comes Phase 9)
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_cc_statements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_card_id      uuid NOT NULL REFERENCES fino_credit_cards(id),
  statement_period    text NOT NULL,
  statement_date      date NOT NULL,
  due_date            date NOT NULL,

  opening_balance     numeric(14,2) DEFAULT 0,
  total_spend         numeric(14,2) DEFAULT 0,
  total_payment       numeric(14,2) DEFAULT 0,
  total_cashback      numeric(14,2) DEFAULT 0,
  total_interest      numeric(14,2) DEFAULT 0,
  total_fees          numeric(14,2) DEFAULT 0,
  closing_balance     numeric(14,2) DEFAULT 0,
  min_amount_due      numeric(14,2) DEFAULT 0,
  total_amount_due    numeric(14,2) DEFAULT 0,

  payment_status      text DEFAULT 'unpaid'
                      CHECK (payment_status IN ('unpaid','partial','paid','overdue')),
  paid_amount         numeric(14,2) DEFAULT 0,
  paid_at             date,

  pdf_url             text,
  notes               text,
  is_deleted          boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccs_card ON fino_cc_statements (credit_card_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ccs_period
  ON fino_cc_statements (credit_card_id, statement_period)
  WHERE is_deleted = false;
-- ============================================================
-- Fino Phase 3d · Migration 064
-- Table: fino_cc_payments (bank → card)
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_cc_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_card_id      uuid NOT NULL REFERENCES fino_credit_cards(id),
  payment_date        date NOT NULL,
  amount              numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_via_bank_id    uuid NOT NULL REFERENCES fino_bank_accounts(id),
  linked_statement_id uuid REFERENCES fino_cc_statements(id),
  notes               text,
  ledger_txn_group_id uuid,
  is_deleted          boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccp_card ON fino_cc_payments (credit_card_id);
CREATE INDEX IF NOT EXISTS idx_ccp_date ON fino_cc_payments (payment_date);
-- ============================================================
-- Fino Phase 3d · Migration 065
-- Table: fino_cc_rewards (cashback / points / miles audit)
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_cc_rewards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_card_id  uuid NOT NULL REFERENCES fino_credit_cards(id),
  earn_date       date NOT NULL,
  reward_type     text NOT NULL CHECK (reward_type IN ('cashback','points','miles')),
  raw_amount      numeric(14,2) NOT NULL,
  inr_value       numeric(14,2) NOT NULL,
  source_txn_id   uuid REFERENCES fino_cc_transactions(id),
  status          text DEFAULT 'earned' CHECK (status IN ('earned','redeemed','expired')),
  notes           text,
  is_deleted      boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccr_card_year ON fino_cc_rewards (credit_card_id, earn_date);
