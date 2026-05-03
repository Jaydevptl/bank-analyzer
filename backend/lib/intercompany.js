/**
 * Fino · Inter-company Transfers + Owner Drawings (Phase 15)
 *
 * Inter-company:
 *   - Internal transfer (cash moves between two companies' bank accounts):
 *       DEBIT to-bank-COA / CREDIT from-bank-COA
 *   - Investment (one company invests in another):
 *       DEBIT 1900 Investments / CREDIT from-bank
 *   - Loan / expense_share: same flow as internal but description reflects intent.
 *
 * Owner Drawings:
 *   - Withdrawal:  DEBIT 3200 Drawings        / CREDIT bank
 *   - Contribution: DEBIT bank                / CREDIT 3100 Owner's Capital
 *
 * Auto-numbering:
 *   ICT-0001, ICT-0002, ... for transfers
 *   DRW-0001, DRW-0002, ... for drawings
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseBySource } = require('./reversal');

const INVESTMENT_CODE = '1900';
const DRAWINGS_CODE   = '3200';
const CAPITAL_CODE    = '3100';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today  = () => new Date().toISOString().slice(0, 10);

async function _accountCoaCode(accountId) {
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

// Resolves either a fino_bank_accounts.id OR a fino_chart_of_accounts.id to a
// COA id (the FK target). Returns null if neither matches.
async function _resolveToCoaId(accountId) {
  if (!accountId) return null;
  const { data: ba } = await supabase
    .from('fino_bank_accounts').select('linked_account_id').eq('id', accountId).maybeSingle();
  if (ba?.linked_account_id) return ba.linked_account_id;
  return accountId; // assume already a COA id
}

// Refresh a bank balance given either its bank id OR its linked COA id.
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

async function _nextNumber(prefix, table) {
  const { data, error } = await supabase
    .from(table)
    .select(prefix === 'ICT' ? 'transfer_number' : 'drawing_number')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  let max = 0;
  for (const r of (data || [])) {
    const num = prefix === 'ICT' ? r.transfer_number : r.drawing_number;
    const m = (num || '').match(/^(?:ICT|DRW)-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

// ─── Inter-company Transfers ─────────────────────────────────────────────────

async function createTransfer({
  transferNumber, transferDate, fromCompanyId, toCompanyId, transferType,
  amount, description, fromAccountId, toAccountId, notes,
}) {
  if (!transferDate)   throw new Error('transferDate required');
  if (!fromCompanyId)  throw new Error('fromCompanyId required');
  if (!toCompanyId)    throw new Error('toCompanyId required');
  if (fromCompanyId === toCompanyId) throw new Error('From and to companies must differ');
  if (!['internal','investment','loan','expense_share'].includes(transferType)) {
    throw new Error('Invalid transferType');
  }
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('amount must be > 0');
  if (!fromAccountId) throw new Error('fromAccountId required');

  const fromCode = await _accountCoaCode(fromAccountId);
  if (!fromCode) throw new Error('fromAccountId does not resolve to COA');

  const lines = [];
  if (transferType === 'investment') {
    lines.push({ accountCode: INVESTMENT_CODE, direction: 'debit',  amount: amt, companyId: fromCompanyId });
    lines.push({ accountCode: fromCode,        direction: 'credit', amount: amt, companyId: fromCompanyId });
  } else {
    if (!toAccountId) throw new Error('toAccountId required for non-investment transfers');
    const toCode = await _accountCoaCode(toAccountId);
    if (!toCode) throw new Error('toAccountId does not resolve to COA');
    lines.push({ accountCode: toCode,   direction: 'debit',  amount: amt, companyId: toCompanyId });
    lines.push({ accountCode: fromCode, direction: 'credit', amount: amt, companyId: fromCompanyId });
  }

  const number = transferNumber?.trim() || await _nextNumber('ICT', 'fino_intercompany_transfers');

  // Resolve bank id → COA id (FK target is fino_chart_of_accounts.id)
  const fromCoaId = await _resolveToCoaId(fromAccountId);
  const toCoaId   = toAccountId ? await _resolveToCoaId(toAccountId) : null;

  const { data: row, error } = await supabase
    .from('fino_intercompany_transfers').insert({
      transfer_number: number,
      transfer_date: transferDate,
      from_company_id: fromCompanyId,
      to_company_id: toCompanyId,
      transfer_type: transferType,
      amount: amt,
      description: description?.trim() || null,
      from_account_id: fromCoaId,
      to_account_id:   toCoaId,
      notes: notes?.trim() || null,
      status: 'completed',
    }).select().single();
  if (error) throw error;

  const ledger = await createLedgerEntryGroup({
    txnDate: transferDate,
    lines,
    description: description?.trim() || `Inter-company ${transferType} ${number}`,
    sourceModule: 'intercompany_transfer',
    sourceId: row.id,
  });
  await supabase.from('fino_intercompany_transfers')
    .update({ ledger_txn_group_id: ledger.txn_group_id })
    .eq('id', row.id);

  await _refreshBank(fromAccountId);
  if (toAccountId) await _refreshBank(toAccountId);

  return { transfer: row, ledger };
}

async function listTransfers({ companyId = null, fromCompany = null, toCompany = null, includeDeleted = false } = {}) {
  let q = supabase
    .from('fino_intercompany_transfers')
    .select('*, from_company:from_company_id(id, name), to_company:to_company_id(id, name)')
    .order('transfer_date', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (fromCompany)     q = q.eq('from_company_id', fromCompany);
  if (toCompany)       q = q.eq('to_company_id', toCompany);
  if (companyId)       q = q.or(`from_company_id.eq.${companyId},to_company_id.eq.${companyId}`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function cancelTransfer(id, reason = null) {
  const { data: row, error } = await supabase
    .from('fino_intercompany_transfers').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Transfer not found');
  if (row.is_deleted) throw new Error('Already deleted');

  if (row.ledger_txn_group_id) {
    try { await reverseBySource({ sourceModule: 'intercompany_transfer', sourceId: id, reason: reason || 'Transfer cancelled' }); } catch (_) {}
  }
  await supabase.from('fino_intercompany_transfers')
    .update({ is_deleted: true, status: 'cancelled' })
    .eq('id', id);

  await _refreshBank(row.from_account_id);
  if (row.to_account_id) await _refreshBank(row.to_account_id);
  return { success: true };
}

// ─── Owner Drawings ──────────────────────────────────────────────────────────

async function recordDrawing({
  drawingNumber, drawingDate, ownerPartyId, companyId, drawingType,
  amount, description, paidViaAccountId, notes,
}) {
  if (!drawingDate)      throw new Error('drawingDate required');
  if (!ownerPartyId)     throw new Error('ownerPartyId required');
  if (!['withdrawal','contribution'].includes(drawingType)) throw new Error('Invalid drawingType');
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('amount must be > 0');
  if (!paidViaAccountId) throw new Error('paidViaAccountId required');

  const bankCode = await _accountCoaCode(paidViaAccountId);
  if (!bankCode) throw new Error('paidViaAccountId does not resolve to COA');

  const lines = [];
  if (drawingType === 'withdrawal') {
    lines.push({ accountCode: DRAWINGS_CODE, direction: 'debit',  amount: amt, partyId: ownerPartyId, companyId });
    lines.push({ accountCode: bankCode,      direction: 'credit', amount: amt, companyId });
  } else {
    lines.push({ accountCode: bankCode,     direction: 'debit',  amount: amt, companyId });
    lines.push({ accountCode: CAPITAL_CODE, direction: 'credit', amount: amt, partyId: ownerPartyId, companyId });
  }

  const number = drawingNumber?.trim() || await _nextNumber('DRW', 'fino_owner_drawings');

  const paidViaCoaId = await _resolveToCoaId(paidViaAccountId);

  const { data: row, error } = await supabase
    .from('fino_owner_drawings').insert({
      drawing_number: number,
      drawing_date: drawingDate,
      owner_party_id: ownerPartyId,
      company_id: companyId || null,
      drawing_type: drawingType,
      amount: amt,
      description: description?.trim() || null,
      paid_via_account_id: paidViaCoaId,
      notes: notes?.trim() || null,
    }).select().single();
  if (error) throw error;

  const ledger = await createLedgerEntryGroup({
    txnDate: drawingDate,
    lines,
    description: description?.trim() || `${drawingType === 'withdrawal' ? 'Owner withdrawal' : 'Owner contribution'} ${number}`,
    sourceModule: 'owner_drawing',
    sourceId: row.id,
    partyId: ownerPartyId,
    companyId: companyId || null,
  });
  await supabase.from('fino_owner_drawings')
    .update({ ledger_txn_group_id: ledger.txn_group_id })
    .eq('id', row.id);

  await _refreshBank(paidViaAccountId);
  return { drawing: row, ledger };
}

async function listDrawings({ ownerPartyId = null, companyId = null, drawingType = null, includeDeleted = false } = {}) {
  let q = supabase
    .from('fino_owner_drawings')
    .select('*, owner:owner_party_id(id, name), company:company_id(id, name)')
    .order('drawing_date', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (ownerPartyId)    q = q.eq('owner_party_id', ownerPartyId);
  if (companyId)       q = q.eq('company_id', companyId);
  if (drawingType)     q = q.eq('drawing_type', drawingType);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function cancelDrawing(id, reason = null) {
  const { data: row, error } = await supabase
    .from('fino_owner_drawings').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Drawing not found');
  if (row.is_deleted) throw new Error('Already deleted');

  if (row.ledger_txn_group_id) {
    try { await reverseBySource({ sourceModule: 'owner_drawing', sourceId: id, reason: reason || 'Drawing cancelled' }); } catch (_) {}
  }
  await supabase.from('fino_owner_drawings').update({ is_deleted: true }).eq('id', id);
  await _refreshBank(row.paid_via_account_id);
  return { success: true };
}

async function getIntercompanyDashboard() {
  const transfers = await listTransfers();
  const drawings  = await listDrawings();
  let totalTransferred = 0;
  const netBetween = {};  // 'fromId|toId' → net amount
  for (const t of transfers) {
    totalTransferred += Number(t.amount);
    const k = `${t.from_company_id}|${t.to_company_id}`;
    netBetween[k] = (netBetween[k] || 0) + Number(t.amount);
  }
  let totalWithdrawals = 0, totalContributions = 0;
  for (const d of drawings) {
    if (d.drawing_type === 'withdrawal') totalWithdrawals += Number(d.amount);
    else                                  totalContributions += Number(d.amount);
  }
  return {
    transferCount: transfers.length,
    totalTransferred: round2(totalTransferred),
    drawingCount: drawings.length,
    totalWithdrawals: round2(totalWithdrawals),
    totalContributions: round2(totalContributions),
    netDrawings: round2(totalWithdrawals - totalContributions),
    recentTransfers: transfers.slice(0, 5),
    recentDrawings: drawings.slice(0, 5),
  };
}

async function nextTransferNumber() { return await _nextNumber('ICT', 'fino_intercompany_transfers'); }
async function nextDrawingNumber()  { return await _nextNumber('DRW', 'fino_owner_drawings'); }

module.exports = {
  createTransfer, listTransfers, cancelTransfer, nextTransferNumber,
  recordDrawing, listDrawings, cancelDrawing, nextDrawingNumber,
  getIntercompanyDashboard,
};
