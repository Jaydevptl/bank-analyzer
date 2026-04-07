-- Run this in Supabase SQL Editor to add account name support
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_name TEXT DEFAULT '';
