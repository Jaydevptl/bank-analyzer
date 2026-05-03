-- ============================================================
-- Fino Phase 2 · Migration 010
-- Table: fino_companies
-- Stores businesses + personal pool (anything money flows into/out of as a unit)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fino_companies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  type              text NOT NULL CHECK (type IN ('own','partnered','external','personal')),
  ownership_percent numeric(5,2) DEFAULT 100,
  is_personal       boolean DEFAULT false,
  currency          text DEFAULT 'INR',
  start_date        date,
  status            text DEFAULT 'active' CHECK (status IN ('active','paused','closed')),
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_status ON fino_companies (status);
CREATE INDEX IF NOT EXISTS idx_companies_type   ON fino_companies (type);
