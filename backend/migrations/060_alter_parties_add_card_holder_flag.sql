-- ============================================================
-- Fino Phase 3d · Migration 060
-- Add is_card_holder flag on fino_parties
-- ============================================================

ALTER TABLE fino_parties ADD COLUMN IF NOT EXISTS is_card_holder boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_parties_card_holder ON fino_parties (is_card_holder);
