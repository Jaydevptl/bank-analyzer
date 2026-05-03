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
