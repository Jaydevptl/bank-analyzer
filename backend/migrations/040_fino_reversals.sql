-- ============================================================
-- Fino Phase 3 Polish · Migration 040
-- Table: fino_reversals  (audit lookup linking reversal groups to originals)
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_reversals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_group_id uuid NOT NULL,
  reversal_group_id uuid NOT NULL,
  source_module     text,
  source_id         uuid,
  reason            text,
  reversed_at       timestamptz DEFAULT now(),
  reversed_by       uuid
);

CREATE INDEX IF NOT EXISTS idx_reversals_original ON fino_reversals (original_group_id);
CREATE INDEX IF NOT EXISTS idx_reversals_source   ON fino_reversals (source_module, source_id);
