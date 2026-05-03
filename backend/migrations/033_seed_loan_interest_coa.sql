-- ============================================================
-- Fino Phase 3b · Migration 033
-- Seed: Loan Interest Income (4270) — separate income code for cleaner P&L
-- Idempotent.
-- ============================================================

INSERT INTO fino_chart_of_accounts (code, name, type, sub_type, is_system)
VALUES ('4270', 'Loan Interest Income', 'income', 'other_income', true)
ON CONFLICT (code) DO NOTHING;
