/**
 * Fino · Recurring Expenses (Phase 17A)
 *
 * Templates for repeating expenses (rent, hosting, salary, etc). When the
 * `next_due_date` is on/before today, generateDueExpenses books a ledger
 * entry and advances next_due_date by the frequency period.
 *
 * Ledger:
 *   DEBIT  expense COA (from expense_category_code) / CREDIT bank
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseBySource } = require('./reversal');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today  = () => new Date().toISOString().slice(0, 10);

async function _resolveToCoaId(accountId) {
  if (!accountId) return null;
  const { data: ba } = await supabase
    .from('fino_bank_accounts').select('linked_account_id').eq('id', accountId).maybeSingle();
  if (ba?.linked_account_id) return ba.linked_account_id;
  return accountId;
}

async function _coaCodeFromId(coaId) {
  if (!coaId) return null;
  const { data } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', coaId).maybeSingle();
  return data?.code || null;
}

async function _refreshBankByEither(accountId) {
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

function _addPeriod(dateStr, frequency) {
  const d = new Date(dateStr);
  switch (frequency) {
    case 'daily':     d.setDate(d.getDate() + 1); break;
    case 'weekly':    d.setDate(d.getDate() + 7); break;
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); break;
    default: throw new Error(`Invalid frequency: ${frequency}`);
  }
  return d.toISOString().slice(0, 10);
}

async function createRecurring({
  name, description, amount, frequency, expenseCategoryCode,
  paidViaAccountId, companyId, startDate, endDate, autoCreate = false, notes,
}) {
  if (!name?.trim())                throw new Error('name required');
  if (!(Number(amount) > 0))        throw new Error('amount must be > 0');
  if (!['daily','weekly','monthly','quarterly','yearly'].includes(frequency)) throw new Error('Invalid frequency');
  if (!expenseCategoryCode)         throw new Error('expenseCategoryCode required');
  if (!paidViaAccountId)            throw new Error('paidViaAccountId required');
  if (!startDate)                   throw new Error('startDate required');

  // Validate expense COA exists
  const { data: coa } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('code', expenseCategoryCode).maybeSingle();
  if (!coa) throw new Error(`Expense COA code ${expenseCategoryCode} not found`);

  const paidViaCoaId = await _resolveToCoaId(paidViaAccountId);

  const { data, error } = await supabase
    .from('fino_recurring_expenses').insert({
      name: name.trim(),
      description: description?.trim() || null,
      amount: Number(amount),
      frequency,
      expense_category_code: expenseCategoryCode,
      paid_via_account_id: paidViaCoaId,
      company_id: companyId || null,
      start_date: startDate,
      end_date: endDate || null,
      next_due_date: startDate,
      auto_create: !!autoCreate,
      is_active: true,
      notes: notes?.trim() || null,
    }).select().single();
  if (error) throw error;
  return data;
}

async function listRecurring({ companyId = null, isActive = null, includeDeleted = false } = {}) {
  let q = supabase.from('fino_recurring_expenses').select('*').order('next_due_date');
  if (!includeDeleted)        q = q.eq('is_deleted', false);
  if (companyId)              q = q.eq('company_id', companyId);
  if (isActive !== null)      q = q.eq('is_active', isActive);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getRecurring(id) {
  const { data, error } = await supabase
    .from('fino_recurring_expenses').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function updateRecurring(id, patch) {
  const update = { updated_at: new Date().toISOString() };
  const map = {
    name: 'name', description: 'description', amount: 'amount',
    frequency: 'frequency', expenseCategoryCode: 'expense_category_code',
    endDate: 'end_date', autoCreate: 'auto_create', isActive: 'is_active',
    notes: 'notes',
  };
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) update[col] = (typeof patch[k] === 'string') ? patch[k].trim() : patch[k];
  }
  if (patch.paidViaAccountId !== undefined) {
    update.paid_via_account_id = await _resolveToCoaId(patch.paidViaAccountId);
  }
  const { data, error } = await supabase
    .from('fino_recurring_expenses').update(update).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function deleteRecurring(id, reason = null) {
  const r = await getRecurring(id);
  if (!r) throw new Error('Recurring not found');
  if (r.is_deleted) throw new Error('Already deleted');
  await supabase.from('fino_recurring_expenses').update({
    is_deleted: true, is_active: false, notes: reason || r.notes,
  }).eq('id', id);
  return { success: true };
}

async function generateDueExpenses({ companyId = null, asOfDate = null } = {}) {
  const t = asOfDate || today();
  let q = supabase
    .from('fino_recurring_expenses').select('*')
    .eq('is_deleted', false).eq('is_active', true)
    .lte('next_due_date', t);
  if (companyId) q = q.eq('company_id', companyId);
  const { data: due, error } = await q;
  if (error) throw error;

  const generated = [];
  for (const r of (due || [])) {
    if (r.end_date && r.end_date < r.next_due_date) continue;
    const bankCode = await _coaCodeFromId(r.paid_via_account_id);
    if (!bankCode) continue; // skip silently if COA missing

    try {
      const ledger = await createLedgerEntryGroup({
        txnDate: r.next_due_date,
        lines: [
          { accountCode: r.expense_category_code, direction: 'debit',  amount: r.amount, companyId: r.company_id },
          { accountCode: bankCode,                direction: 'credit', amount: r.amount, companyId: r.company_id },
        ],
        description: `Recurring · ${r.name}`,
        sourceModule: 'recurring_expense',
        sourceId: r.id,
        companyId: r.company_id,
      });
      const newDue = _addPeriod(r.next_due_date, r.frequency);
      const isFinished = r.end_date && newDue > r.end_date;
      await supabase.from('fino_recurring_expenses').update({
        last_generated_date: r.next_due_date,
        next_due_date: isFinished ? r.end_date : newDue,
        is_active: !isFinished,
        updated_at: new Date().toISOString(),
      }).eq('id', r.id);
      await _refreshBankByEither(r.paid_via_account_id);
      generated.push({ id: r.id, name: r.name, amount: r.amount, due_date: r.next_due_date, ledger_group_id: ledger.txn_group_id });
    } catch (e) {
      generated.push({ id: r.id, name: r.name, error: e.message });
    }
  }
  return { count: generated.length, generated };
}

async function getRecurringSummary() {
  const all = await listRecurring({ isActive: true });
  let monthlyEquivalent = 0;
  const upcomingThisWeek = [];
  const t = new Date();
  const weekFromNow = new Date(t.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  for (const r of all) {
    let perMonth = 0;
    switch (r.frequency) {
      case 'daily':     perMonth = Number(r.amount) * 30; break;
      case 'weekly':    perMonth = Number(r.amount) * 4.33; break;
      case 'monthly':   perMonth = Number(r.amount); break;
      case 'quarterly': perMonth = Number(r.amount) / 3; break;
      case 'yearly':    perMonth = Number(r.amount) / 12; break;
    }
    monthlyEquivalent += perMonth;
    if (r.next_due_date && r.next_due_date <= weekFromNow) upcomingThisWeek.push(r);
  }
  return {
    activeCount: all.length,
    monthlyEquivalent: round2(monthlyEquivalent),
    upcomingThisWeek,
  };
}

module.exports = {
  createRecurring, listRecurring, getRecurring, updateRecurring, deleteRecurring,
  generateDueExpenses, getRecurringSummary,
};
