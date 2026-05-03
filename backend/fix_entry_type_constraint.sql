-- Drop the old entry_type check constraint and add a new one with all types
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_entry_type_check;

ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_entry_type_check
  CHECK (entry_type IN ('Deposit', 'Withdrawal', 'Dividend', 'Charges', 'Tax', 'Interest', 'Trade Profit', 'Trade Loss', 'Other'));
