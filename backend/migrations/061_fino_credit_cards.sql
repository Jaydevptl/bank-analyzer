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
