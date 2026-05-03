/**
 * Fino · Ledger service helpers (Phase 2)
 *
 * Public API:
 *   createLedgerEntry(opts)  — write a balanced debit+credit pair
 *   getAccountBalance(id, asOfDate?)
 *   getAccountLedger(id, { from, to, limit, offset })
 *   reverseLedgerEntry(txnGroupId, reason)
 *
 * NOTE on atomicity: Supabase JS SDK lacks BEGIN/COMMIT. We insert both rows
 * in a single batched insert() — Postgres treats a multi-row INSERT as one
 * statement, so it succeeds-or-fails atomically. A future Phase 19 RPC
 * (`fino_create_ledger_pair`) can replace this if we need cross-table atomicity.
 */

const { randomUUID } = require('crypto');
const supabase = require('./supabase');

// ─── Internal: resolve account code → id ─────────────────────────────────────
async function resolveAccountId(code) {
  const { data, error } = await supabase
    .from('fino_chart_of_accounts')
    .select('id')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Chart of accounts: code "${code}" not found`);
  return data.id;
}

// ─── Public ──────────────────────────────────────────────────────────────────

/**
 * createLedgerEntryGroup — write N balanced lines under one txn_group_id.
 *
 *   lines: [{ accountCode, direction: 'debit'|'credit', amount, partyId?, companyId?, description? }]
 *
 * Validates sum(debits) === sum(credits) within ₹0.01 tolerance, resolves all
 * account codes in parallel, and inserts every line in a single batched
 * insert() (atomic at the SQL statement level — Postgres treats multi-row
 * INSERT as one statement).
 *
 * Returns { txn_group_id, entry_ids: [...] } in insertion order.
 */
async function createLedgerEntryGroup({
  txnDate,
  txnGroupId = null,
  lines,
  description = null,
  sourceModule = null,
  sourceId = null,
  partyId = null,
  companyId = null,
  notes = null,
  createdBy = null,
}) {
  if (!txnDate) throw new Error('txnDate required');
  if (!Array.isArray(lines) || lines.length < 2) throw new Error('lines: at least 2 entries required');

  let debits = 0, credits = 0;
  for (const l of lines) {
    if (!l.accountCode) throw new Error('Each line needs accountCode');
    if (!['debit','credit'].includes(l.direction)) throw new Error("Each line needs direction 'debit' or 'credit'");
    const amt = Number(l.amount);
    if (!(amt > 0)) throw new Error('Each line amount must be > 0');
    if (l.direction === 'debit') debits += amt; else credits += amt;
  }
  if (Math.abs(debits - credits) > 0.01) {
    throw new Error(`Ledger group unbalanced: debits=${debits.toFixed(2)} credits=${credits.toFixed(2)}`);
  }

  // Resolve all account codes (deduped)
  const codes = [...new Set(lines.map(l => l.accountCode))];
  const idMap = new Map();
  await Promise.all(codes.map(async (c) => { idMap.set(c, await resolveAccountId(c)); }));

  const groupId = txnGroupId || randomUUID();
  const rows = lines.map(l => ({
    txn_group_id: groupId,
    txn_date: txnDate,
    account_id: idMap.get(l.accountCode),
    direction: l.direction,
    amount: Number(l.amount),
    description: l.description ?? description,
    source_module: sourceModule,
    source_id: sourceId,
    party_id: l.partyId ?? partyId,
    company_id: l.companyId ?? companyId,
    notes,
    created_by: createdBy,
  }));

  const { data, error } = await supabase
    .from('fino_ledger_entries')
    .insert(rows)
    .select('id');
  if (error) throw error;

  return { txn_group_id: groupId, entry_ids: data.map(r => r.id) };
}

// Thin wrapper preserving Phase 2 / 3a signature + return shape.
async function createLedgerEntry({
  txnDate, amount,
  debitAccountCode, creditAccountCode,
  description = null, sourceModule = null, sourceId = null,
  partyId = null, companyId = null, notes = null, createdBy = null,
}) {
  if (debitAccountCode === creditAccountCode) throw new Error('debit and credit accounts must differ');
  const result = await createLedgerEntryGroup({
    txnDate,
    lines: [
      { accountCode: debitAccountCode,  direction: 'debit',  amount },
      { accountCode: creditAccountCode, direction: 'credit', amount },
    ],
    description, sourceModule, sourceId, partyId, companyId, notes, createdBy,
  });
  // Original return shape: { txn_group_id, debit_id, credit_id }
  return {
    txn_group_id: result.txn_group_id,
    debit_id:     result.entry_ids[0],
    credit_id:    result.entry_ids[1],
  };
}

async function getAccountBalance(accountId, asOfDate = null) {
  let query = supabase
    .from('fino_ledger_entries')
    .select('direction, amount')
    .eq('account_id', accountId);
  if (asOfDate) query = query.lte('txn_date', asOfDate);

  const { data, error } = await query;
  if (error) throw error;

  let debit = 0, credit = 0;
  for (const r of data || []) {
    const a = Number(r.amount);
    if (r.direction === 'debit') debit += a; else credit += a;
  }
  // Net balance signed against the account's natural side is decided by the
  // caller (asset/expense → debit-positive, liability/equity/income → credit-positive).
  // Here we return raw debit/credit + their algebraic difference.
  return { debit, credit, net: debit - credit };
}

async function getAccountLedger(accountId, { from = null, to = null, limit = 100, offset = 0 } = {}) {
  let query = supabase
    .from('fino_ledger_entries')
    .select('*', { count: 'exact' })
    .eq('account_id', accountId)
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (from) query = query.gte('txn_date', from);
  if (to)   query = query.lte('txn_date', to);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { entries: data || [], total: count || 0, limit, offset };
}

async function reverseLedgerEntry(txnGroupId, reason = null) {
  // Fetch original pair
  const { data: rows, error } = await supabase
    .from('fino_ledger_entries')
    .select('*')
    .eq('txn_group_id', txnGroupId);
  if (error) throw error;
  if (!rows || rows.length === 0) throw new Error(`txn_group_id ${txnGroupId} not found`);

  const newGroupId = randomUUID();
  const reversed = rows.map(r => ({
    txn_group_id: newGroupId,
    txn_date: new Date().toISOString().slice(0, 10),
    account_id: r.account_id,
    direction: r.direction === 'debit' ? 'credit' : 'debit', // flip
    amount: r.amount,
    description: `[REVERSAL] ${r.description || ''}`.trim(),
    source_module: r.source_module,
    source_id: r.source_id,
    party_id: r.party_id,
    company_id: r.company_id,
    notes: reason ? `Reversal of ${txnGroupId}: ${reason}` : `Reversal of ${txnGroupId}`,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from('fino_ledger_entries')
    .insert(reversed)
    .select('id');
  if (insErr) throw insErr;

  return { reversal_group_id: newGroupId, reversed_ids: inserted.map(r => r.id) };
}

module.exports = {
  createLedgerEntry,
  createLedgerEntryGroup,
  getAccountBalance,
  getAccountLedger,
  reverseLedgerEntry,
};
