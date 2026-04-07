-- ============================================================================
-- Allow 'backup-deleted' status
-- Run this in Supabase SQL Editor
-- ============================================================================

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('pending', 'verified', 'duplicate', 'backup', 'backup-deleted'));
