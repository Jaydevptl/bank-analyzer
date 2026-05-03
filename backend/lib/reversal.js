/**
 * Fino · Reversal helper (Phase 3 Polish)
 *
 * Reverses a ledger group by inserting mirror entries (direction flipped) under
 * a new txn_group_id, marking originals is_reversed=true, and recording the
 * link in fino_reversals.
 *
 * Always uses createLedgerEntryGroup → reversal entries are themselves balanced.
 * Never hard-deletes ledger rows → audit trail intact.
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');

async function reverseLedgerGroup({ txnGroupId, reason = null, reversedBy = null, reversalDate = null }) {
  if (!txnGroupId) throw new Error('txnGroupId required');

  const { data: rows, error } = await supabase
    .from('fino_ledger_entries')
    .select('*')
    .eq('txn_group_id', txnGroupId);
  if (error) throw error;
  if (!rows || rows.length === 0) throw new Error(`txn_group_id ${txnGroupId} not found`);
  if (rows.some(r => r.is_reversed)) throw new Error(`Group ${txnGroupId} already reversed`);

  // Resolve account_id → code for createLedgerEntryGroup
  const ids = [...new Set(rows.map(r => r.account_id))];
  const { data: coa, error: coaErr } = await supabase
    .from('fino_chart_of_accounts')
    .select('id, code')
    .in('id', ids);
  if (coaErr) throw coaErr;
  const codeMap = new Map(coa.map(c => [c.id, c.code]));

  const original = rows[0];
  const lines = rows.map(r => ({
    accountCode: codeMap.get(r.account_id),
    direction: r.direction === 'debit' ? 'credit' : 'debit',
    amount: Number(r.amount),
    description: `REVERSAL: ${r.description || ''}`.trim(),
    partyId: r.party_id,
    companyId: r.company_id,
  }));

  const reversal = await createLedgerEntryGroup({
    txnDate: reversalDate || new Date().toISOString().slice(0, 10),
    lines,
    sourceModule: (original.source_module || 'unknown') + '_reversal',
    sourceId: original.source_id,
    partyId: original.party_id,
    companyId: original.company_id,
    notes: reason || `Reversal of ${txnGroupId}`,
    description: `REVERSAL of ${txnGroupId}`,
  });

  // Mark originals as reversed
  await supabase
    .from('fino_ledger_entries')
    .update({ is_reversed: true })
    .eq('txn_group_id', txnGroupId);

  // Audit row
  await supabase.from('fino_reversals').insert({
    original_group_id: txnGroupId,
    reversal_group_id: reversal.txn_group_id,
    source_module: original.source_module,
    source_id: original.source_id,
    reason,
    reversed_by: reversedBy,
  });

  return { reversal_group_id: reversal.txn_group_id, entry_ids: reversal.entry_ids };
}

async function reverseBySource({ sourceModule, sourceId, reason, reversedBy, reversalDate }) {
  const { data: rows, error } = await supabase
    .from('fino_ledger_entries')
    .select('txn_group_id, is_reversed')
    .eq('source_module', sourceModule)
    .eq('source_id', sourceId);
  if (error) throw error;

  const groups = [...new Set((rows || []).filter(r => !r.is_reversed).map(r => r.txn_group_id))];
  const results = [];
  for (const g of groups) {
    results.push(await reverseLedgerGroup({ txnGroupId: g, reason, reversedBy, reversalDate }));
  }
  return { reversed_count: results.length, results };
}

module.exports = { reverseLedgerGroup, reverseBySource };
