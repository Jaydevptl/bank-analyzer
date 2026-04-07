-- ============================================================================
-- Bank Analyzer V2 Migration
-- Adds: status, account_holder, reference_no, duplicate_of, upload_id fields
-- Creates: upload_reports table
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Add new columns to transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'duplicate', 'backup'));
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_holder TEXT DEFAULT '';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference_no TEXT DEFAULT '';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS upload_id TEXT DEFAULT '';

-- 2. Create index on status for fast filtering
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_upload_id ON transactions(upload_id);

-- 3. Create upload_reports table
CREATE TABLE IF NOT EXISTS upload_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id TEXT UNIQUE NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  total_files INTEGER DEFAULT 0,
  total_entries INTEGER DEFAULT 0,
  total_unique INTEGER DEFAULT 0,
  total_duplicates INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  files JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_reports_upload_id ON upload_reports(upload_id);

-- 4. Update the get_transaction_stats function to filter by status
CREATE OR REPLACE FUNCTION get_transaction_stats(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date   TIMESTAMPTZ DEFAULT NULL,
  p_bank_name  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH filtered AS (
    SELECT *
    FROM transactions
    WHERE (status = 'pending' OR status = 'verified')
      AND (p_start_date IS NULL OR date >= p_start_date)
      AND (p_end_date   IS NULL OR date <= p_end_date)
      AND (p_bank_name  IS NULL OR bank_name = p_bank_name)
  ),
  overall AS (
    SELECT
      COALESCE(SUM(debit), 0)  AS "totalDebit",
      COALESCE(SUM(credit), 0) AS "totalCredit",
      COUNT(*)::int             AS "count"
    FROM filtered
  ),
  daily AS (
    SELECT
      date::date::text AS "date",
      COALESCE(SUM(debit), 0)  AS "debit",
      COALESCE(SUM(credit), 0) AS "credit",
      COUNT(*)::int             AS "count"
    FROM filtered
    GROUP BY date::date
    ORDER BY date::date
  ),
  monthly AS (
    SELECT
      EXTRACT(YEAR  FROM date)::int AS "year",
      EXTRACT(MONTH FROM date)::int AS "month",
      COALESCE(SUM(debit), 0)  AS "debit",
      COALESCE(SUM(credit), 0) AS "credit",
      COUNT(*)::int             AS "count"
    FROM filtered
    GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
    ORDER BY "year", "month"
  ),
  by_category AS (
    SELECT
      COALESCE(category, 'Uncategorized') AS "category",
      COALESCE(SUM(debit), 0)  AS "debit",
      COALESCE(SUM(credit), 0) AS "credit",
      COUNT(*)::int             AS "count"
    FROM filtered
    GROUP BY category
    ORDER BY "count" DESC
  ),
  by_bank AS (
    SELECT
      bank_name AS "bank",
      COALESCE(SUM(debit), 0)  AS "debit",
      COALESCE(SUM(credit), 0) AS "credit",
      COUNT(*)::int             AS "count"
    FROM filtered
    GROUP BY bank_name
    ORDER BY "count" DESC
  )
  SELECT jsonb_build_object(
    'overall',    (SELECT row_to_json(overall)::jsonb    FROM overall),
    'daily',      (SELECT COALESCE(jsonb_agg(row_to_json(daily)::jsonb),    '[]'::jsonb) FROM daily),
    'monthly',    (SELECT COALESCE(jsonb_agg(row_to_json(monthly)::jsonb),  '[]'::jsonb) FROM monthly),
    'byCategory', (SELECT COALESCE(jsonb_agg(row_to_json(by_category)::jsonb), '[]'::jsonb) FROM by_category),
    'byBank',     (SELECT COALESCE(jsonb_agg(row_to_json(by_bank)::jsonb),  '[]'::jsonb) FROM by_bank)
  ) INTO result;

  RETURN result;
END;
$$;
