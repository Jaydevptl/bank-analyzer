-- ============================================================
-- Fino Phase 2 · Migration 011
-- Table: fino_parties
-- Unified contacts table — a party can hold multiple roles
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_parties (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  contact_phone           text,
  contact_email           text,
  gstin                   text,
  pan                     text,
  address                 text,
  -- Role flags (a party can fill multiple roles)
  is_customer             boolean DEFAULT false,
  is_supplier             boolean DEFAULT false,
  is_conversion_vendor    boolean DEFAULT false,
  is_hawala_agent         boolean DEFAULT false,
  is_borrower             boolean DEFAULT false,
  is_partner              boolean DEFAULT false,
  is_employee             boolean DEFAULT false,
  -- Conversion-vendor specific
  default_conversion_pct  numeric(5,2),
  -- Hawala-agent specific
  default_inr_usd_rate    numeric(10,4),
  -- Reliability tracking
  reliability_score       integer CHECK (reliability_score BETWEEN 1 AND 5),
  notes                   text,
  status                  text DEFAULT 'active',
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parties_name ON fino_parties (name);
CREATE INDEX IF NOT EXISTS idx_parties_role ON fino_parties (is_customer, is_supplier, is_conversion_vendor);
