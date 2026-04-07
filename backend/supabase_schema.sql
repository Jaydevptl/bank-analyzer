-- ============================================================
-- Bank Analyzer - Supabase Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- 1. Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  date             TIMESTAMPTZ NOT NULL,
  description      TEXT        NOT NULL,
  debit            NUMERIC(15,2) DEFAULT 0,
  credit           NUMERIC(15,2) DEFAULT 0,
  balance          NUMERIC(15,2),
  bank_name        TEXT        NOT NULL,
  account_number   TEXT        DEFAULT '',
  upload_session_id TEXT       DEFAULT '',
  source_file      TEXT        DEFAULT '',
  category         TEXT        DEFAULT 'Uncategorized',
  raw_data         JSONB       DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_date             ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_bank_name        ON transactions(bank_name);
CREATE INDEX IF NOT EXISTS idx_transactions_upload_session   ON transactions(upload_session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date_bank        ON transactions(date, bank_name);

-- 3. Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_updated_at ON transactions;
CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. Stats aggregation RPC (called by the backend)
CREATE OR REPLACE FUNCTION get_transaction_stats(
  p_start_date  TIMESTAMPTZ DEFAULT NULL,
  p_end_date    TIMESTAMPTZ DEFAULT NULL,
  p_bank_name   TEXT        DEFAULT NULL
)
RETURNS JSON
LANGUAGE sql
AS $$
  WITH filtered AS (
    SELECT *
    FROM transactions
    WHERE (p_start_date IS NULL OR date >= p_start_date)
      AND (p_end_date   IS NULL OR date <= p_end_date)
      AND (p_bank_name  IS NULL OR bank_name = p_bank_name)
  ),
  overall AS (
    SELECT
      COALESCE(SUM(debit),  0)::FLOAT AS "totalDebit",
      COALESCE(SUM(credit), 0)::FLOAT AS "totalCredit",
      COUNT(*)::INT                   AS "count"
    FROM filtered
  ),
  daily AS (
    SELECT
      TO_CHAR(DATE_TRUNC('day', date), 'YYYY-MM-DD') AS date,
      COALESCE(SUM(debit),  0)::FLOAT AS debit,
      COALESCE(SUM(credit), 0)::FLOAT AS credit,
      COUNT(*)::INT                   AS count
    FROM filtered
    GROUP BY DATE_TRUNC('day', date)
    ORDER BY DATE_TRUNC('day', date)
  ),
  monthly AS (
    SELECT
      EXTRACT(YEAR  FROM date)::INT   AS year,
      EXTRACT(MONTH FROM date)::INT   AS month,
      COALESCE(SUM(debit),  0)::FLOAT AS debit,
      COALESCE(SUM(credit), 0)::FLOAT AS credit,
      COUNT(*)::INT                   AS count
    FROM filtered
    GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
    ORDER BY year, month
  ),
  by_category AS (
    SELECT
      COALESCE(category, 'Uncategorized') AS category,
      COALESCE(SUM(debit),  0)::FLOAT     AS debit,
      COALESCE(SUM(credit), 0)::FLOAT     AS credit,
      COUNT(*)::INT                        AS count
    FROM filtered
    GROUP BY category
    ORDER BY SUM(debit) DESC
  ),
  by_bank AS (
    SELECT
      bank_name                        AS bank,
      COALESCE(SUM(debit),  0)::FLOAT  AS debit,
      COALESCE(SUM(credit), 0)::FLOAT  AS credit,
      COUNT(*)::INT                    AS count
    FROM filtered
    GROUP BY bank_name
  )
  SELECT json_build_object(
    'overall',    (SELECT row_to_json(o)  FROM overall     o),
    'daily',      COALESCE((SELECT json_agg(d) FROM daily      d), '[]'::json),
    'monthly',    COALESCE((SELECT json_agg(m) FROM monthly    m), '[]'::json),
    'byCategory', COALESCE((SELECT json_agg(c) FROM by_category c), '[]'::json),
    'byBank',     COALESCE((SELECT json_agg(b) FROM by_bank     b), '[]'::json)
  );
$$;
