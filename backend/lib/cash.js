/**
 * Fino · Cash in Hand service (Phase 3a)
 * Single global cash pool on COA 1100.
 */

const supabase = require('./supabase');
const { createLedgerEntry, getAccountBalance, getAccountLedger } = require('./ledger');

const CASH_CODE = '1100';

async function cashCoaId() {
  const { data, error } = await supabase
    .from('fino_chart_of_accounts')
    .select('id')
    .eq('code', CASH_CODE)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Cash COA (1100) missing — run Phase 2 seed');
  return data.id;
}

async function getCashBalance(asOfDate = null) {
  const id = await cashCoaId();
  const { net } = await getAccountBalance(id, asOfDate);
  return net;
}

async function getCashLedger(opts = {}) {
  const id = await cashCoaId();
  const result = await getAccountLedger(id, opts);
  const asc = [...result.entries].reverse();
  let running = 0;
  for (const r of asc) {
    running += r.direction === 'debit' ? Number(r.amount) : -Number(r.amount);
    r.running_balance = running;
  }
  return { ...result, entries: asc.reverse() };
}

const CASH_SOURCES = {
  customer_payment: '1300',
  sales:            '4100',
  other_income:     '4200',
  refund:           '4250',
  drawings_in:      '3200',
  manual:           '4200',
};
const CASH_DESTINATIONS = {
  supplier_payment: '2100',
  expense:          '5700',
  shipping:         '5230',
  salary:           '5300',
  rent:             '5400',
  marketing:        '5500',
  office_expense:   '5600',
  drawings_out:     '3200',
  manual:           '5700',
};

async function recordCashDeposit({ amount, date, source = 'manual', description, partyId, companyId, notes }) {
  const code = CASH_SOURCES[source];
  if (!code) throw new Error(`Unknown source: ${source}`);
  return createLedgerEntry({
    txnDate: date, amount,
    debitAccountCode: CASH_CODE,
    creditAccountCode: code,
    description: description || `Cash in · ${source}`,
    sourceModule: 'cash', partyId, companyId, notes,
  });
}

async function recordCashWithdrawal({ amount, date, destination = 'manual', description, partyId, companyId, notes }) {
  const code = CASH_DESTINATIONS[destination];
  if (!code) throw new Error(`Unknown destination: ${destination}`);
  return createLedgerEntry({
    txnDate: date, amount,
    debitAccountCode: code,
    creditAccountCode: CASH_CODE,
    description: description || `Cash out · ${destination}`,
    sourceModule: 'cash', partyId, companyId, notes,
  });
}

async function recordCashAdjustment({ type, amount, date, reason, notes }) {
  if (!['add', 'reduce'].includes(type)) throw new Error("type must be 'add' or 'reduce'");
  if (!reason?.trim()) throw new Error('reason required');

  const debit  = type === 'add' ? CASH_CODE : '3100'; // Cash ↑ vs Owner's Capital ↑
  const credit = type === 'add' ? '3100'     : CASH_CODE;

  const ledger = await createLedgerEntry({
    txnDate: date, amount,
    debitAccountCode: debit,
    creditAccountCode: credit,
    description: `Cash adjustment (${type}): ${reason}`,
    sourceModule: 'cash_adjustment',
    notes,
  });

  const { data: adj, error } = await supabase
    .from('fino_cash_adjustments')
    .insert({
      adjustment_date: date,
      type, amount, reason,
      notes: notes || null,
      ledger_txn_group_id: ledger.txn_group_id,
    })
    .select()
    .single();
  if (error) throw error;

  return { adjustment: adj, ledger };
}

// Cash → Bank (uses bank deposit)
async function recordCashTransferToBank({ bankAccountId, amount, date, description, companyId, notes }) {
  const { recordDeposit } = require('./bankTransactions');
  return recordDeposit({
    bankAccountId, amount, date,
    sourceCategory: 'cash_deposit',
    description: description || 'Cash → Bank',
    companyId, notes,
  });
}

// Bank → Cash (uses bank withdrawal)
async function recordCashFromBank({ bankAccountId, amount, date, description, companyId, notes }) {
  const { recordWithdrawal } = require('./bankTransactions');
  return recordWithdrawal({
    bankAccountId, amount, date,
    destinationCategory: 'cash_withdrawal',
    description: description || 'Bank → Cash',
    companyId, notes,
  });
}

// Delete a cash transaction (deposit/withdrawal) = reverse its ledger group.
async function deleteCashTransaction(txnGroupId, reason = null) {
  const { reverseLedgerGroup } = require('./reversal');
  return reverseLedgerGroup({ txnGroupId, reason: reason || 'Cash txn deleted' });
}

// Update meta fields on a cash ledger group.
async function updateCashTransaction(txnGroupId, { description, notes, date }) {
  const update = {};
  if (description !== undefined) update.description = description;
  if (notes       !== undefined) update.notes = notes;
  if (date        !== undefined) update.txn_date = date;
  if (!Object.keys(update).length) throw new Error('No editable fields supplied');
  const { error } = await supabase
    .from('fino_ledger_entries')
    .update(update)
    .eq('txn_group_id', txnGroupId)
    .eq('is_reversed', false);
  if (error) throw error;
  return { success: true };
}

// Delete a cash adjustment row + reverse its ledger group + mark adjustment row deleted.
async function deleteCashAdjustment(adjustmentId, reason = null) {
  const { reverseLedgerGroup } = require('./reversal');
  const { data: adj, error } = await supabase
    .from('fino_cash_adjustments').select('*').eq('id', adjustmentId).maybeSingle();
  if (error) throw error;
  if (!adj) throw new Error('Adjustment not found');
  if (adj.is_deleted) throw new Error('Already deleted');
  if (adj.ledger_txn_group_id) {
    await reverseLedgerGroup({ txnGroupId: adj.ledger_txn_group_id, reason: reason || 'Adjustment deleted' });
  }
  await supabase
    .from('fino_cash_adjustments')
    .update({ is_deleted: true })
    .eq('id', adjustmentId);
  return { success: true };
}

// Update meta on a cash adjustment row (reason / notes only).
async function updateCashAdjustment(id, { reason, notes }) {
  const update = {};
  if (reason !== undefined) update.reason = reason;
  if (notes  !== undefined) update.notes = notes;
  if (!Object.keys(update).length) throw new Error('No editable fields supplied');
  const { data, error } = await supabase
    .from('fino_cash_adjustments').update(update).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

module.exports = {
  getCashBalance, getCashLedger,
  recordCashDeposit, recordCashWithdrawal, recordCashAdjustment,
  recordCashTransferToBank, recordCashFromBank,
  deleteCashTransaction, updateCashTransaction,
  deleteCashAdjustment, updateCashAdjustment,
  CASH_SOURCES, CASH_DESTINATIONS,
};
