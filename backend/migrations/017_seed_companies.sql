-- ============================================================
-- Fino Phase 2 · Migration 017
-- Seed: 3 default companies
-- Idempotent — only inserts if name not present
-- ============================================================

INSERT INTO fino_companies (name, type, ownership_percent, is_personal, currency)
SELECT 'Dropy Retails', 'own', 100, false, 'INR'
WHERE NOT EXISTS (SELECT 1 FROM fino_companies WHERE name = 'Dropy Retails');

INSERT INTO fino_companies (name, type, ownership_percent, is_personal, currency)
SELECT 'Rudra Retails', 'own', 100, false, 'INR'
WHERE NOT EXISTS (SELECT 1 FROM fino_companies WHERE name = 'Rudra Retails');

INSERT INTO fino_companies (name, type, ownership_percent, is_personal, currency)
SELECT 'Personal', 'personal', 100, true, 'INR'
WHERE NOT EXISTS (SELECT 1 FROM fino_companies WHERE name = 'Personal');
