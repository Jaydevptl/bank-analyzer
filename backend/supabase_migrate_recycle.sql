-- ============================================================================
-- Recycle Bin Table Migration
-- Run this in Supabase SQL Editor
-- ============================================================================

CREATE TABLE IF NOT EXISTS recycle_bin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID,
  item_type TEXT NOT NULL CHECK (item_type IN ('transaction', 'report')),
  data JSONB NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recycle_bin_type ON recycle_bin(item_type);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_deleted_at ON recycle_bin(deleted_at);
