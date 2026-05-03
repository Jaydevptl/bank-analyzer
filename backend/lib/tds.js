/**
 * Fino · TDS Records (Phase 16)
 *
 * Two flavors:
 *   1. Salary TDS — collected by us as employer, sits in 2410 TDS Payable.
 *      depositTds → DEBIT 2410 / CREDIT bank
 *   2. Amazon/Professional/Rent TDS — deducted from our income by payer; we get
 *      a TDS receivable. recordTds with type != 'salary_tds':
 *        DEBIT 1700 TDS Receivable / CREDIT income code (default 4200 Other Income)
 *      depositTds for these is a no-op (employer/payer deposits, not us).
 *
 * The actual income source (Amazon revenue, professional fees) should already
 * be booked separately. recordTds for non-salary types here only books the
 * TDS receivable so it surfaces in the filing UI.
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseBySource } = require('./reversal');

const TDS_REC_CODE = '1700';   // TDS Receivable (asset, existing)
const TDS_PAY_CODE = '2410';   // TDS Payable    (liability, seeded by salary.js)
const OTHER_INCOME_CODE = '4200';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function _ensurePayableCoa() {
  const { data } = await supabase
    .from('fino_chart_of_accounts').select('id').eq('code', TDS_PAY_CODE).maybeSingle();
  if (data) return;
  await supabase.from('fino_chart_of_accounts').insert({
    code: TDS_PAY_CODE, name: 'TDS Payable',
    type: 'liability', sub_type: 'current_liability',
    is_system: true, is_active: true,
    description: 'Auto-seeded for Salary/TDS (Phase 16)',
  });
}

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

async function recordTds({
  tdsType, partyId, companyId, financialYear, quarter,
  tdsSection, grossAmount, tdsRate, notes,
}) {
  if (!['salary_tds','amazon_tds','professional_tds','rent_tds','other'].includes(tdsType)) {
    throw new Error('Invalid tdsType');
  }
  if (!financialYear)        throw new Error('financialYear required');
  if (!['Q1','Q2','Q3','Q4'].includes(quarter)) throw new Error('quarter must be Q1..Q4');

  const gross = Number(grossAmount);
  const rate  = Number(tdsRate);
  if (!(gross > 0)) throw new Error('grossAmount must be > 0');
  if (!(rate >= 0)) throw new Error('tdsRate must be >= 0');
  const tdsAmount = round2(gross * rate / 100);

  const { data: row, error } = await supabase
    .from('fino_tds_records').insert({
      tds_type: tdsType,
      party_id: partyId || null,
      company_id: companyId || null,
      financial_year: financialYear,
      quarter,
      tds_section: tdsSection?.trim() || null,
      gross_amount: gross,
      tds_rate: rate,
      tds_amount: tdsAmount,
      status: 'deducted',
      notes: notes?.trim() || null,
    }).select().single();
  if (error) throw error;

  // For non-salary TDS (deducted from our income), book the receivable.
  // For salary_tds, no ledger entry here — it's already booked when salary is paid.
  let ledger = null;
  if (tdsType !== 'salary_tds' && tdsAmount > 0) {
    ledger = await createLedgerEntryGroup({
      txnDate: new Date().toISOString().slice(0, 10),
      lines: [
        { accountCode: TDS_REC_CODE,      direction: 'debit',  amount: tdsAmount, partyId, companyId },
        { accountCode: OTHER_INCOME_CODE, direction: 'credit', amount: tdsAmount, partyId, companyId },
      ],
      description: `${tdsType} ₹${tdsAmount.toFixed(2)} (${financialYear} ${quarter})`,
      sourceModule: 'tds_record',
      sourceId: row.id,
      partyId: partyId || null,
      companyId: companyId || null,
    });
    await supabase.from('fino_tds_records')
      .update({ ledger_txn_group_id: ledger.txn_group_id })
      .eq('id', row.id);
  }
  return { record: row, ledger };
}

async function depositTds(id, { depositDate, challanNumber, paidViaAccountId }) {
  if (!depositDate)     throw new Error('depositDate required');
  if (!paidViaAccountId) throw new Error('paidViaAccountId required');
  const { data: row, error } = await supabase
    .from('fino_tds_records').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('TDS record not found');
  if (row.status === 'deposited' || row.status === 'filed') throw new Error(`Already ${row.status}`);

  await _ensurePayableCoa();
  const bankCode = await _accountCoaCode(paidViaAccountId);
  if (!bankCode) throw new Error('paidViaAccountId does not resolve to COA');

  const amt = Number(row.tds_amount);
  const ledger = await createLedgerEntryGroup({
    txnDate: depositDate,
    lines: [
      { accountCode: TDS_PAY_CODE, direction: 'debit',  amount: amt, partyId: row.party_id, companyId: row.company_id },
      { accountCode: bankCode,     direction: 'credit', amount: amt, companyId: row.company_id },
    ],
    description: `TDS deposit · challan ${challanNumber || '—'} · ${row.financial_year} ${row.quarter}`,
    sourceModule: 'tds_deposit',
    sourceId: row.id,
    partyId: row.party_id,
    companyId: row.company_id,
  });

  await supabase.from('fino_tds_records').update({
    deposit_date: depositDate,
    challan_number: challanNumber?.trim() || null,
    status: 'deposited',
  }).eq('id', id);

  try {
    const { refreshCurrentBalance } = require('./bankAccounts');
    const { data: ba } = await supabase.from('fino_bank_accounts').select('id').eq('id', paidViaAccountId).maybeSingle();
    if (ba?.id) await refreshCurrentBalance(ba.id);
  } catch (_) {}
  return { success: true, ledger };
}

async function listTdsRecords({ tdsType = null, partyId = null, companyId = null, financialYear = null, quarter = null, includeDeleted = false } = {}) {
  let q = supabase
    .from('fino_tds_records')
    .select('*, party:party_id(id, name)')
    .order('created_at', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (tdsType)         q = q.eq('tds_type', tdsType);
  if (partyId)         q = q.eq('party_id', partyId);
  if (companyId)       q = q.eq('company_id', companyId);
  if (financialYear)   q = q.eq('financial_year', financialYear);
  if (quarter)         q = q.eq('quarter', quarter);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function cancelTds(id, reason = null) {
  const { data: row, error } = await supabase
    .from('fino_tds_records').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('TDS record not found');
  if (row.is_deleted) throw new Error('Already deleted');
  for (const sm of ['tds_record', 'tds_deposit']) {
    try { await reverseBySource({ sourceModule: sm, sourceId: id, reason: reason || 'TDS cancelled' }); } catch (_) {}
  }
  await supabase.from('fino_tds_records').update({ is_deleted: true, status: 'cancelled' }).eq('id', id);
  return { success: true };
}

async function getTdsSummary({ financialYear = null } = {}) {
  const recs = await listTdsRecords({ financialYear });
  const byType = {}, byQuarter = {};
  let totalGross = 0, totalTds = 0, totalDeposited = 0, totalPending = 0;
  for (const r of recs) {
    const gross = Number(r.gross_amount), tds = Number(r.tds_amount);
    totalGross += gross; totalTds += tds;
    if (r.status === 'deposited' || r.status === 'filed') totalDeposited += tds;
    else if (r.status === 'deducted') totalPending += tds;
    byType[r.tds_type]    = (byType[r.tds_type] || 0) + tds;
    byQuarter[r.quarter]  = (byQuarter[r.quarter] || 0) + tds;
  }
  return {
    count: recs.length,
    totalGross: round2(totalGross),
    totalTds:   round2(totalTds),
    totalDeposited: round2(totalDeposited),
    totalPending:   round2(totalPending),
    byType, byQuarter,
  };
}

module.exports = { recordTds, depositTds, listTdsRecords, cancelTds, getTdsSummary };
