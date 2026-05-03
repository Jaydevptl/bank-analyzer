-- ============================================================
-- Fino Phase 2 · Migration 014
-- Table: fino_ledger_entries
-- Double-entry ledger. Each money movement = 2 rows sharing txn_group_id.
--
-- INVARIANT (enforced at app layer for now; sum-to-zero CHECK trigger
-- to be added in Phase 19 once usage patterns are stable):
--   For every txn_group_id:
--     SUM(amount WHERE direction='debit') = SUM(amount WHERE direction='credit')
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_ledger_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_group_id  uuid NOT NULL,
  txn_date      date NOT NULL,
  account_id    uuid NOT NULL REFERENCES fino_chart_of_accounts(id),
  direction     text NOT NULL CHECK (direction IN ('debit','credit')),
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  description   text,
  source_module text,
  source_id     uuid,
  party_id      uuid REFERENCES fino_parties(id),
  company_id    uuid REFERENCES fino_companies(id),
  notes         text,
  created_by    uuid,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_date    ON fino_ledger_entries (txn_date);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON fino_ledger_entries (account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_group   ON fino_ledger_entries (txn_group_id);
CREATE INDEX IF NOT EXISTS idx_ledger_source  ON fino_ledger_entries (source_module, source_id);
CREATE INDEX IF NOT EXISTS idx_ledger_company ON fino_ledger_entries (company_id);
