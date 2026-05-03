/**
 * Fino · Bank Transactions service (Phase 3a)
 * Every helper goes through createLedgerEntry — no direct ledger inserts.
 */

const supabase = require('./supabase');
const { createLedgerEntry, getAccountLedger } = require('./ledger');
const { refreshCurrentBalance } = require('./bankAccounts');

// ─── Helper: load bank → linked COA code ─────────────────────────────────────
async function bankToCoaCode(bankAccountId) {
  const { data, error } = await supabase
    .from('fino_bank_accounts')
    .select('id, linked_account_id, account_name')
    .eq('id', bankAccountId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Bank account ${bankAccountId} not found`);

  const { data: coa, error: coaErr } = await supabase
    .from('fino_chart_of_accounts')
    .select('code')
    .eq('id', data.linked_account_id)
    .maybeSingle();
  if (coaErr) throw coaErr;
  if (!coa) throw new Error(`Linked COA missing for bank ${bankAccountId}`);
  return { code: coa.code, name: data.account_name };
}

// ─── Source / Destination category → COA code mapping ────────────────────────
const SOURCE_TO_CODE = {
  cash_deposit:     '1100',  // Cash in Hand
  customer_payment: '1300',  // Accounts Receivable
  loan_received:    '2100',  // Accounts Payable (we owe them) — note: spec is 'received', adjust if needed
  other_income:     '4200',
  refund:           '4250',
  bank_interest:    '4210',
  cashback:         '4230',
  sales:            '4100',
  drawings_in:      '3200',
  manual:           '4200',
};

const DEST_TO_CODE = {
  cash_withdrawal:   '1100',
  supplier_payment:  '2100',
  expense:           '5700',
  bank_charge:       '5220',
  shipping:          '5230',
  custom_duty:       '5240',
  salary:            '5300',
  rent:              '5400',
  marketing:         '5500',
  office_expense:    '5600',
  drawings_out:      '3200',
  manual:            '5700',
};

// ─── Recorders ───────────────────────────────────────────────────────────────

async function recordDeposit({
  bankAccountId, amount, date, sourceCategory = 'manual',
  description, partyId, companyId, notes,
}) {
  const bank = await bankToCoaCode(bankAccountId);
  const sourceCode = SOURCE_TO_CODE[sourceCategory];
  if (!sourceCode) throw new Error(`Unknown sourceCategory: ${sourceCategory}`);

  const result = await createLedgerEntry({
    txnDate: date,
    amount,
    debitAccountCode:  bank.code,    // Bank ↑
    creditAccountCode: sourceCode,   // Source ↓
    description: description || `Deposit · ${sourceCategory}`,
    sourceModule: 'bank_txn',
    sourceId: bankAccountId,
    partyId, companyId, notes,
  });
  await refreshCurrentBalance(bankAccountId);
  return result;
}

async function recordWithdrawal({
  bankAccountId, amount, date, destinationCategory = 'manual',
  description, partyId, companyId, notes,
}) {
  const bank = await bankToCoaCode(bankAccountId);
  const destCode = DEST_TO_CODE[destinationCategory];
  if (!destCode) throw new Error(`Unknown destinationCategory: ${destinationCategory}`);

  const result = await createLedgerEntry({
    txnDate: date,
    amount,
    debitAccountCode:  destCode,     // Destination ↑
    creditAccountCode: bank.code,    // Bank ↓
    description: description || `Withdrawal · ${destinationCategory}`,
    sourceModule: 'bank_txn',
    sourceId: bankAccountId,
    partyId, companyId, notes,
  });
  await refreshCurrentBalance(bankAccountId);
  return result;
}

async function recordTransfer({
  fromBankId, toBankId, amount, date, description, companyId, notes,
}) {
  if (fromBankId === toBankId) throw new Error('From and To bank must differ');
  const from = await bankToCoaCode(fromBankId);
  const to   = await bankToCoaCode(toBankId);

  const result = await createLedgerEntry({
    txnDate: date,
    amount,
    debitAccountCode:  to.code,    // Receiving bank ↑
    creditAccountCode: from.code,  // Sending bank ↓
    description: description || `Transfer · ${from.name} → ${to.name}`,
    sourceModule: 'bank_transfer',
    sourceId: fromBankId,
    companyId, notes,
  });
  await Promise.all([refreshCurrentBalance(fromBankId), refreshCurrentBalance(toBankId)]);
  return result;
}

async function recordBankCharge({ bankAccountId, amount, date, description, companyId, notes }) {
  return recordWithdrawal({
    bankAccountId, amount, date,
    destinationCategory: 'bank_charge',
    description: description || 'Bank charge',
    companyId, notes,
  });
}

async function recordInterestEarned({ bankAccountId, amount, date, description, companyId, notes }) {
  return recordDeposit({
    bankAccountId, amount, date,
    sourceCategory: 'bank_interest',
    description: description || 'Interest earned',
    companyId, notes,
  });
}

async function getBankLedger(bankAccountId, opts = {}) {
  const bank = await supabase
    .from('fino_bank_accounts')
    .select('linked_account_id')
    .eq('id', bankAccountId)
    .maybeSingle();
  if (bank.error) throw bank.error;
  if (!bank.data) throw new Error(`Bank ${bankAccountId} not found`);

  const result = await getAccountLedger(bank.data.linked_account_id, opts);

  // Compute running balance (asset → debit-positive)
  // We need ascending order to compute, then we can return as-is or reverse.
  const asc = [...result.entries].reverse();
  let running = 0;
  for (const r of asc) {
    running += r.direction === 'debit' ? Number(r.amount) : -Number(r.amount);
    r.running_balance = running;
  }
  return { ...result, entries: asc.reverse() };
}

// Delete a bank txn = reverse the ledger group; refresh affected bank balances.
async function deleteBankTransaction(txnGroupId, reason = null) {
  const { reverseLedgerGroup } = require('./reversal');

  // Find banks this group touched (so we can refresh denormalized balance)
  const { data: rows, error } = await supabase
    .from('fino_ledger_entries')
    .select('account_id')
    .eq('txn_group_id', txnGroupId);
  if (error) throw error;
  const accIds = [...new Set((rows || []).map(r => r.account_id))];

  const result = await reverseLedgerGroup({ txnGroupId, reason: reason || 'Transaction deleted' });

  if (accIds.length) {
    const { data: banks, error: bErr } = await supabase
      .from('fino_bank_accounts')
      .select('id, linked_account_id')
      .in('linked_account_id', accIds);
    if (!bErr && banks) {
      const { refreshCurrentBalance } = require('./bankAccounts');
      await Promise.all(banks.map(b => refreshCurrentBalance(b.id)));
    }
  }
  return result;
}

// Edit safe meta on every line of a group: description, notes, date.
async function updateBankTransactionMeta(txnGroupId, { description, notes, date }) {
  const update = {};
  if (description !== undefined) update.description = description;
  if (notes       !== undefined) update.notes = notes;
  if (date        !== undefined) update.txn_date = date;
  if (Object.keys(update).length === 0) throw new Error('No editable fields supplied');

  const { error } = await supabase
    .from('fino_ledger_entries')
    .update(update)
    .eq('txn_group_id', txnGroupId)
    .eq('is_reversed', false);
  if (error) throw error;
  return { success: true };
}

module.exports = {
  recordDeposit, recordWithdrawal, recordTransfer,
  recordBankCharge, recordInterestEarned, getBankLedger,
  deleteBankTransaction, updateBankTransactionMeta,
  SOURCE_TO_CODE, DEST_TO_CODE,
};
