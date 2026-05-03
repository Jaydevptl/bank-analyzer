-- ============================================================
-- Fino Phase 3 Polish · Migration 042
-- Robustly extend fino_loans_given.status check to include
-- 'cancelled' and 'deleted'. Drops *every* status-related check
-- constraint by inspecting pg_constraint, since the original auto-
-- generated name may vary across Postgres versions.
-- ============================================================

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'fino_loans_given'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE fino_loans_given DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE fino_loans_given
  ADD CONSTRAINT fino_loans_given_status_check
  CHECK (status IN ('active','partially_repaid','closed','defaulted','written_off','cancelled','deleted'));
