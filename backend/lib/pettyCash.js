/**
 * Fino · Petty Cash (Phase 17B)
 *
 * Petty cash flow:
 *   advance     — staff gets cash from the bank/till
 *                  DEBIT  1110 Petty Cash Advances (party-tagged) / CREDIT bank/cash
 *   expense     — staff spends petty cash on something
 *                  DEBIT  expense COA (or 5290 Petty Cash Expense) / CREDIT 1110 (party)
 *   settlement  — staff returns unused cash
 *                  DEBIT  1100 Cash / CREDIT 1110 Petty Cash Advances (party)
 *   refund      — bank refund into petty cash float
 *                  DEBIT  1110 / CREDIT bank
 *
 * COA seeded:
 *   1110 Petty Cash Advances (asset, current)
 *   5290 Petty Cash Expense  (expense, indirect)
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseBySource } = require('./reversal');

const ADVANCE_CODE  = '1110';
const PETTY_EXP_CODE = '5290';
const CASH_CODE     = '1100';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today  = () => new Date().toISOString().slice(0, 10);

async function ensureExactCoa({ code, name, type, subType }) {
  const { data: existing } = await supabase
    .from('fino_chart_of_accounts').select('id, code').eq('code', code).maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase
    .from('fino_chart_of_accounts').insert({
      code, name, type, sub_type: subType,
      is_system: true, is_active: true,
      description: 'Auto-seeded for Petty Cash (Phase 17B)',
    }).select('id, code').single();
  if (error) throw error;
  return data;
}

async function seedPettyCashCoa() {
  await ensureExactCoa({ code: ADVANCE_CODE,   name: 'Petty Cash Advances', type: 'asset',   subType: 'current_asset' });
  await ensureExactCoa({ code: PETTY_EXP_CODE, name: 'Petty Cash Expense',  type: 'expense', subType: 'indirect_expense' });
}

async function _resolveToCoaId(accountId) {
  if (!accountId) return null;
  const { data: ba } = await supabase
    .from('fino_bank_accounts').select('linked_account_id').eq('id', accountId).maybeSingle();
  if (ba?.linked_account_id) return ba.linked_account_id;
  return accountId;
}

async function _coaCodeFromAccount(accountId) {
  if (!accountId) return null;
  const { data: ba } = await supabase
    .from('fino_bank_accounts').select('linked_account_id').eq('id', accountId).maybeSingle();
  if (ba?.linked_account_id) {
    const { data: c } = await supabase
      .from('fino_chart_of_accounts').select('code').eq('id', ba.linked_account_id).maybeSingle();
    return c?.code || null;
  }
  const { data: c2 } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', accountId).maybeSingle();
  return c2?.code || null;
}

async function _refreshBank(accountId) {
  if (!accountId) return;
  try {
    const { refreshCurrentBalance } = require('./bankAccounts');
    const { data: byId } = await supabase
      .from('fino_bank_accounts').select('id').eq('id', accountId).maybeSingle();
    if (byId?.id) { await refreshCurrentBalance(byId.id); return; }
    const { data: byLinked } = await supabase
      .from('fino_bank_accounts').select('id').eq('linked_account_id', accountId).maybeSingle();
    if (byLinked?.id) await refreshCurrentBalance(byLinked.id);
  } catch (_) {}
}

async function _nextNumber() {
  const { data } = await supabase
    .from('fino_petty_cash').select('txn_number').order('created_at', { ascending: false }).limit(50);
  let max = 0;
  for (const r of (data || [])) {
    const m = (r.txn_number || '').match(/^PC-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `PC-${String(max + 1).padStart(4, '0')}`;
}

async function recordPettyCash({
  txnNumber, txnDate, txnType, staffPartyId, amount, description,
  expenseCategoryCode, receiptAttached = false, approvedBy, companyId, notes,
  paidViaAccountId, // for advance/refund: bank to draw from / refund from
}) {
  if (!txnDate)                    throw new Error('txnDate required');
  if (!['advance','expense','settlement','refund'].includes(txnType)) throw new Error('Invalid txnType');
  if (!staffPartyId)               throw new Error('staffPartyId required');
  const amt = Number(amount);
  if (!(amt > 0))                  throw new Error('amount must be > 0');

  await seedPettyCashCoa();

  // Auto-tag is_employee
  const { data: party } = await supabase
    .from('fino_parties').select('id, name, is_employee').eq('id', staffPartyId).maybeSingle();
  if (!party) throw new Error('Staff party not found');
  if (!party.is_employee) {
    await supabase.from('fino_parties')
      .update({ is_employee: true, updated_at: new Date().toISOString() })
      .eq('id', staffPartyId);
  }

  const number = txnNumber?.trim() || await _nextNumber();
  const lines = [];
  let bankCoaCode = null;
  let bankCoaId   = null;

  if (txnType === 'advance') {
    if (!paidViaAccountId) throw new Error('paidViaAccountId required for advance');
    bankCoaCode = await _coaCodeFromAccount(paidViaAccountId);
    if (!bankCoaCode) throw new Error('paidViaAccountId does not resolve to COA');
    lines.push({ accountCode: ADVANCE_CODE, direction: 'debit',  amount: amt, partyId: staffPartyId, companyId });
    lines.push({ accountCode: bankCoaCode,  direction: 'credit', amount: amt, companyId });
  } else if (txnType === 'expense') {
    const expCode = expenseCategoryCode || PETTY_EXP_CODE;
    const { data: c } = await supabase
      .from('fino_chart_of_accounts').select('code').eq('code', expCode).maybeSingle();
    if (!c) throw new Error(`Expense COA ${expCode} not found`);
    lines.push({ accountCode: expCode,      direction: 'debit',  amount: amt, partyId: staffPartyId, companyId });
    lines.push({ accountCode: ADVANCE_CODE, direction: 'credit', amount: amt, partyId: staffPartyId, companyId });
  } else if (txnType === 'settlement') {
    lines.push({ accountCode: CASH_CODE,    direction: 'debit',  amount: amt, companyId });
    lines.push({ accountCode: ADVANCE_CODE, direction: 'credit', amount: amt, partyId: staffPartyId, companyId });
  } else { // refund
    if (!paidViaAccountId) throw new Error('paidViaAccountId required for refund');
    bankCoaCode = await _coaCodeFromAccount(paidViaAccountId);
    if (!bankCoaCode) throw new Error('paidViaAccountId does not resolve to COA');
    lines.push({ accountCode: ADVANCE_CODE, direction: 'debit',  amount: amt, partyId: staffPartyId, companyId });
    lines.push({ accountCode: bankCoaCode,  direction: 'credit', amount: amt, companyId });
  }

  if (paidViaAccountId) bankCoaId = await _resolveToCoaId(paidViaAccountId);

  const { data: row, error } = await supabase
    .from('fino_petty_cash').insert({
      txn_number: number,
      txn_date: txnDate,
      txn_type: txnType,
      staff_party_id: staffPartyId,
      amount: amt,
      description: description?.trim() || null,
      expense_category_code: txnType === 'expense' ? (expenseCategoryCode || PETTY_EXP_CODE) : null,
      receipt_attached: !!receiptAttached,
      approved_by: approvedBy || null,
      company_id: companyId || null,
      notes: notes?.trim() || null,
    }).select().single();
  if (error) throw error;

  const ledger = await createLedgerEntryGroup({
    txnDate,
    lines,
    description: `Petty cash · ${txnType} · ${party.name}`,
    sourceModule: 'petty_cash',
    sourceId: row.id,
    partyId: staffPartyId,
    companyId: companyId || null,
  });
  await supabase.from('fino_petty_cash')
    .update({ ledger_txn_group_id: ledger.txn_group_id })
    .eq('id', row.id);

  if (paidViaAccountId) await _refreshBank(paidViaAccountId);
  return { record: row, ledger };
}

async function listPettyCash({ staffId = null, txnType = null, from = null, to = null, includeDeleted = false } = {}) {
  let q = supabase
    .from('fino_petty_cash')
    .select('*, staff:staff_party_id(id, name)')
    .order('txn_date', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (staffId)         q = q.eq('staff_party_id', staffId);
  if (txnType)         q = q.eq('txn_type', txnType);
  if (from)            q = q.gte('txn_date', from);
  if (to)              q = q.lte('txn_date', to);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function deletePettyCash(id, reason = null) {
  const { data: row, error } = await supabase
    .from('fino_petty_cash').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Petty cash record not found');
  if (row.is_deleted) throw new Error('Already deleted');
  if (row.ledger_txn_group_id) {
    try { await reverseBySource({ sourceModule: 'petty_cash', sourceId: id, reason: reason || 'Petty cash cancelled' }); } catch (_) {}
  }
  await supabase.from('fino_petty_cash').update({ is_deleted: true }).eq('id', id);
  return { success: true };
}

async function getStaffPettyCashBalance(staffPartyId) {
  const { data, error } = await supabase
    .from('fino_petty_cash')
    .select('txn_type, amount')
    .eq('staff_party_id', staffPartyId)
    .eq('is_deleted', false);
  if (error) throw error;
  let advances = 0, expenses = 0, settlements = 0, refunds = 0;
  for (const r of (data || [])) {
    const a = Number(r.amount);
    if      (r.txn_type === 'advance')    advances    += a;
    else if (r.txn_type === 'expense')    expenses    += a;
    else if (r.txn_type === 'settlement') settlements += a;
    else if (r.txn_type === 'refund')     refunds     += a;
  }
  return {
    advances: round2(advances),
    expenses: round2(expenses),
    settlements: round2(settlements),
    refunds: round2(refunds),
    outstanding: round2(advances + refunds - expenses - settlements),
  };
}

async function getPettyCashSummary() {
  const all = await listPettyCash();
  const byStaff = new Map();
  let totalAdvances = 0, totalExpenses = 0, totalSettlements = 0;
  for (const r of all) {
    const a = Number(r.amount);
    if      (r.txn_type === 'advance')    totalAdvances    += a;
    else if (r.txn_type === 'expense')    totalExpenses    += a;
    else if (r.txn_type === 'settlement') totalSettlements += a;
    const k = r.staff_party_id;
    const cur = byStaff.get(k) || { name: r.staff?.name, advances: 0, expenses: 0, settlements: 0, refunds: 0 };
    if      (r.txn_type === 'advance')    cur.advances    += a;
    else if (r.txn_type === 'expense')    cur.expenses    += a;
    else if (r.txn_type === 'settlement') cur.settlements += a;
    else if (r.txn_type === 'refund')     cur.refunds     += a;
    byStaff.set(k, cur);
  }
  const staffSummary = [...byStaff.entries()].map(([id, v]) => ({
    staff_party_id: id, name: v.name,
    advances: round2(v.advances), expenses: round2(v.expenses),
    settlements: round2(v.settlements), refunds: round2(v.refunds),
    outstanding: round2(v.advances + v.refunds - v.expenses - v.settlements),
  })).sort((a, b) => b.outstanding - a.outstanding);
  const totalOutstanding = staffSummary.reduce((s, x) => s + x.outstanding, 0);
  return {
    count: all.length,
    totalAdvances:    round2(totalAdvances),
    totalExpenses:    round2(totalExpenses),
    totalSettlements: round2(totalSettlements),
    totalOutstanding: round2(totalOutstanding),
    staffSummary,
  };
}

module.exports = {
  recordPettyCash, listPettyCash, deletePettyCash,
  getStaffPettyCashBalance, getPettyCashSummary, seedPettyCashCoa,
};
