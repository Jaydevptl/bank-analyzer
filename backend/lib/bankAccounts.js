/**
 * Fino · Bank Accounts service (Phase 3a)
 *
 *  - Auto-provisions a child COA entry under code 1200 ("Bank Accounts")
 *  - Records opening balance via the ledger (Bank ↑ / Owner's Capital ↑)
 *  - Soft delete only when balance is zero
 */

const supabase = require('./supabase');
const { createLedgerEntry, getAccountBalance } = require('./ledger');

const PARENT_CODE = '1200'; // "Bank Accounts" parent in chart of accounts

async function getParentCoaId() {
  const { data, error } = await supabase
    .from('fino_chart_of_accounts')
    .select('id')
    .eq('code', PARENT_CODE)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`COA parent code ${PARENT_CODE} ("Bank Accounts") missing — run Phase 2 seed`);
  return data.id;
}

// Generate next free 12XX code (1201, 1202, ...) excluding 1200 itself.
async function nextBankCoaCode() {
  const { data, error } = await supabase
    .from('fino_chart_of_accounts')
    .select('code')
    .like('code', '12%')
    .order('code', { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = data?.[0]?.code;
  if (!max || max === '1200') return '1201';
  const n = parseInt(max, 10);
  if (Number.isNaN(n)) return '1201';
  return String(n + 1);
}

async function createBankAccount(payload) {
  const {
    accountName, bankName, accountHolder, accountNumberLast4, ifscCode,
    accountType, openingBalance = 0, openingDate, companyId, notes,
  } = payload;

  if (!accountName?.trim()) throw new Error('accountName required');
  if (!bankName?.trim())    throw new Error('bankName required');
  if (accountType && !['savings','current','salary','other'].includes(accountType)) {
    throw new Error('accountType must be savings|current|salary|other');
  }

  // 1. Provision linked COA entry
  const parentId = await getParentCoaId();
  const newCode  = await nextBankCoaCode();
  const coaName  = `Bank: ${accountName.trim()}`;

  const { data: coa, error: coaErr } = await supabase
    .from('fino_chart_of_accounts')
    .insert({
      code: newCode,
      name: coaName,
      type: 'asset',
      sub_type: 'current_asset',
      parent_id: parentId,
      is_system: false,
      is_active: true,
      description: `Auto-created for bank account "${accountName.trim()}"`,
    })
    .select()
    .single();
  if (coaErr) throw coaErr;

  // 2. Insert bank account row
  const opening = Number(openingBalance) || 0;
  const { data: bank, error: bankErr } = await supabase
    .from('fino_bank_accounts')
    .insert({
      account_name:           accountName.trim(),
      bank_name:              bankName.trim(),
      account_holder:         accountHolder?.trim() || null,
      account_number_last4:   accountNumberLast4?.trim() || null,
      ifsc_code:              ifscCode?.trim() || null,
      account_type:           accountType || null,
      opening_balance:        opening,
      opening_date:           openingDate || null,
      current_balance:        opening,
      company_id:             companyId || null,
      linked_account_id:      coa.id,
      notes:                  notes?.trim() || null,
    })
    .select()
    .single();
  if (bankErr) {
    // rollback COA insert if bank insert fails
    await supabase.from('fino_chart_of_accounts').delete().eq('id', coa.id);
    throw bankErr;
  }

  // 3. Opening-balance ledger entry: Bank ↑ / Owner's Capital ↑ (3100)
  let openingTxn = null;
  if (opening > 0) {
    openingTxn = await createLedgerEntry({
      txnDate: openingDate || new Date().toISOString().slice(0, 10),
      amount: opening,
      debitAccountCode:  newCode,
      creditAccountCode: '3100',
      description: `Opening balance: ${accountName.trim()}`,
      sourceModule: 'bank_account',
      sourceId: bank.id,
      companyId: companyId || null,
    });
  }

  return { bank, linked_coa: coa, opening_txn: openingTxn };
}

async function listBankAccounts({ companyId = null, activeOnly = true, includeDeleted = false } = {}) {
  let q = supabase.from('fino_bank_accounts').select('*').order('account_name');
  if (activeOnly) q = q.eq('is_active', true);
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (companyId)  q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getBankAccount(id) {
  const { data, error } = await supabase
    .from('fino_bank_accounts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // Live balance from ledger
  const { net } = await getAccountBalance(data.linked_account_id);
  return { ...data, live_balance: net };
}

async function updateBankAccount(id, patch) {
  const update = { updated_at: new Date().toISOString() };
  const map = {
    accountName: 'account_name', bankName: 'bank_name',
    accountHolder: 'account_holder', accountNumberLast4: 'account_number_last4',
    ifscCode: 'ifsc_code', accountType: 'account_type',
    companyId: 'company_id', notes: 'notes',
  };
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) update[col] = (typeof patch[k] === 'string') ? patch[k].trim() : patch[k];
  }
  // openingBalance is intentionally immutable post-creation (per spec).

  const { data, error } = await supabase
    .from('fino_bank_accounts')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  // Rename linked COA name to match (cosmetic)
  if (patch.accountName && data.linked_account_id) {
    await supabase
      .from('fino_chart_of_accounts')
      .update({ name: `Bank: ${patch.accountName.trim()}` })
      .eq('id', data.linked_account_id);
  }
  return data;
}

async function deactivateBankAccount(id) {
  const bank = await getBankAccount(id);
  if (!bank) throw new Error('Bank account not found');
  if (Math.abs(bank.live_balance) > 0.01) {
    throw new Error(`Cannot deactivate: balance is ${bank.live_balance.toFixed(2)} (must be zero)`);
  }
  const { error } = await supabase
    .from('fino_bank_accounts')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  return { success: true };
}

// Recompute & persist current_balance from the ledger (call after transactions).
async function refreshCurrentBalance(id) {
  const bank = await getBankAccount(id);
  if (!bank) return null;
  const { error } = await supabase
    .from('fino_bank_accounts')
    .update({ current_balance: bank.live_balance, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  return bank.live_balance;
}

// Soft-delete a bank account: reverse all linked ledger groups, then mark deleted.
async function deleteBankAccount(id, reason = null) {
  const { reverseBySource, reverseLedgerGroup } = require('./reversal');
  const bank = await getBankAccount(id);
  if (!bank) throw new Error('Bank account not found');
  if (bank.is_deleted) throw new Error('Bank already deleted');

  // Reverse the opening-balance group (sourceModule=bank_account, sourceId=bank.id)
  await reverseBySource({ sourceModule: 'bank_account', sourceId: id, reason: reason || 'Bank deleted' });

  // Reverse any other ledger groups touching this bank's COA account that aren't yet reversed
  const { data: rows, error } = await supabase
    .from('fino_ledger_entries')
    .select('txn_group_id, is_reversed, source_module')
    .eq('account_id', bank.linked_account_id)
    .eq('is_reversed', false);
  if (error) throw error;
  const groups = [...new Set((rows || []).map(r => r.txn_group_id))];
  for (const g of groups) {
    try { await reverseLedgerGroup({ txnGroupId: g, reason: reason || 'Bank deleted' }); } catch (_) {}
  }

  // Hide the auto-created COA child + mark bank deleted
  if (bank.linked_account_id) {
    await supabase.from('fino_chart_of_accounts')
      .update({ is_active: false }).eq('id', bank.linked_account_id);
  }
  await supabase
    .from('fino_bank_accounts')
    .update({ is_deleted: true, is_active: false, current_balance: 0, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { success: true };
}

module.exports = {
  createBankAccount, listBankAccounts, getBankAccount,
  updateBankAccount, deactivateBankAccount, deleteBankAccount,
  refreshCurrentBalance,
};
