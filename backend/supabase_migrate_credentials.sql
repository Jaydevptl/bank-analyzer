-- ============================================================================
-- Credentials Table Migration
-- Run this in Supabase SQL Editor
-- ============================================================================

CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT DEFAULT '',
  bank TEXT DEFAULT '',
  account_type TEXT DEFAULT '',
  account_no TEXT DEFAULT '',
  crn_no TEXT DEFAULT '',
  ifsc TEXT DEFAULT '',
  debit_card_no TEXT DEFAULT '',
  expiry TEXT DEFAULT '',
  cvv TEXT DEFAULT '',
  username TEXT DEFAULT '',
  password TEXT DEFAULT '',
  phone_no TEXT DEFAULT '',
  used TEXT DEFAULT '',
  pan TEXT DEFAULT '',
  card_pin TEXT DEFAULT '',
  mpin TEXT DEFAULT '',
  dob TEXT DEFAULT '',
  link TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Page access password (stored hashed)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
