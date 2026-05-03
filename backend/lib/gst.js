/**
 * Fino · GST Records (Phase 16)
 *
 * recordGstReturn — captures a return-period snapshot:
 *   net_gst_payable = total_output_gst - total_input_gst
 *
 * payGst — books the actual cash outflow:
 *   DEBIT 2300 GST Output Liability / CREDIT bank
 *
 * Note: GST Input Credit (1800) and GST Output Liability (2300) are already
 * accumulated by sale/purchase invoice modules. This module's payGst clears
 * the output liability when you remit cash to the GST portal.
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseBySource } = require('./reversal');

const GST_OUTPUT_CODE = '2300';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

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

async function recordGstReturn({
  companyId, returnPeriod, returnType,
  totalOutputGst = 0, totalInputGst = 0,
  igst = 0, cgst = 0, sgst = 0, notes,
}) {
  if (!returnPeriod) throw new Error('returnPeriod required');
  if (!['GSTR1','GSTR3B','GSTR9','other'].includes(returnType)) throw new Error('Invalid returnType');
  const out = Number(totalOutputGst) || 0;
  const inp = Number(totalInputGst)  || 0;
  const net = round2(out - inp);

  const { data, error } = await supabase
    .from('fino_gst_records').insert({
      company_id: companyId || null,
      return_period: returnPeriod,
      return_type: returnType,
      total_output_gst: out,
      total_input_gst:  inp,
      net_gst_payable:  net,
      igst: Number(igst) || 0,
      cgst: Number(cgst) || 0,
      sgst: Number(sgst) || 0,
      status: 'draft',
      notes: notes?.trim() || null,
    }).select().single();
  if (error) throw error;
  return data;
}

async function fileGstReturn(id, { filedDate }) {
  if (!filedDate) throw new Error('filedDate required');
  const { data: row, error } = await supabase
    .from('fino_gst_records').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('GST record not found');
  if (row.is_deleted) throw new Error('Deleted');
  if (row.status === 'filed' || row.status === 'paid') throw new Error(`Already ${row.status}`);
  const { data: upd, error: uErr } = await supabase
    .from('fino_gst_records').update({ filed_date: filedDate, status: 'filed' }).eq('id', id).select().single();
  if (uErr) throw uErr;
  return upd;
}

async function payGst(id, { paymentDate, paymentAmount, paidViaAccountId }) {
  if (!paymentDate)      throw new Error('paymentDate required');
  if (!paidViaAccountId) throw new Error('paidViaAccountId required');
  const { data: row, error } = await supabase
    .from('fino_gst_records').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('GST record not found');
  if (row.is_deleted)        throw new Error('Deleted');
  if (row.status === 'paid') throw new Error('Already paid');
  if (row.status === 'cancelled') throw new Error('Cancelled');

  const amt = Number(paymentAmount) || Number(row.net_gst_payable) || 0;
  if (!(amt > 0)) throw new Error('Payment amount must be > 0');

  const bankCode = await _accountCoaCode(paidViaAccountId);
  if (!bankCode) throw new Error('paidViaAccountId does not resolve to COA');

  const ledger = await createLedgerEntryGroup({
    txnDate: paymentDate,
    lines: [
      { accountCode: GST_OUTPUT_CODE, direction: 'debit',  amount: amt, companyId: row.company_id },
      { accountCode: bankCode,        direction: 'credit', amount: amt, companyId: row.company_id },
    ],
    description: `GST payment · ${row.return_type} ${row.return_period}`,
    sourceModule: 'gst_payment',
    sourceId: row.id,
    companyId: row.company_id,
  });

  await supabase.from('fino_gst_records').update({
    payment_date: paymentDate,
    payment_amount: amt,
    paid_via_account_id: paidViaAccountId,
    ledger_txn_group_id: ledger.txn_group_id,
    status: 'paid',
  }).eq('id', id);

  try {
    const { refreshCurrentBalance } = require('./bankAccounts');
    const { data: ba } = await supabase.from('fino_bank_accounts').select('id').eq('id', paidViaAccountId).maybeSingle();
    if (ba?.id) await refreshCurrentBalance(ba.id);
  } catch (_) {}
  return { success: true, ledger };
}

async function listGstRecords({ companyId = null, returnType = null, financialYear = null, includeDeleted = false } = {}) {
  let q = supabase
    .from('fino_gst_records')
    .select('*, company:company_id(id, name)')
    .order('return_period', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (companyId)       q = q.eq('company_id', companyId);
  if (returnType)      q = q.eq('return_type', returnType);
  // financialYear like '2025-26' → return_period prefix '2025' or '2026'
  if (financialYear)   q = q.ilike('return_period', `${financialYear.split('-')[0]}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function cancelGst(id, reason = null) {
  const { data: row, error } = await supabase
    .from('fino_gst_records').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('GST record not found');
  if (row.is_deleted) throw new Error('Already deleted');
  if (row.ledger_txn_group_id) {
    try { await reverseBySource({ sourceModule: 'gst_payment', sourceId: id, reason: reason || 'GST cancelled' }); } catch (_) {}
  }
  await supabase.from('fino_gst_records').update({ is_deleted: true, status: 'cancelled' }).eq('id', id);
  if (row.paid_via_account_id) {
    try {
      const { refreshCurrentBalance } = require('./bankAccounts');
      const { data: ba } = await supabase.from('fino_bank_accounts').select('id').eq('id', row.paid_via_account_id).maybeSingle();
      if (ba?.id) await refreshCurrentBalance(ba.id);
    } catch (_) {}
  }
  return { success: true };
}

async function getGstSummary({ financialYear = null } = {}) {
  const recs = await listGstRecords({ financialYear });
  let totalOutput = 0, totalInput = 0, totalPaid = 0, totalNet = 0;
  const byType = {}, byPeriod = {};
  for (const r of recs) {
    totalOutput += Number(r.total_output_gst);
    totalInput  += Number(r.total_input_gst);
    totalNet    += Number(r.net_gst_payable);
    if (r.status === 'paid') totalPaid += Number(r.payment_amount || 0);
    byType[r.return_type] = (byType[r.return_type] || 0) + Number(r.net_gst_payable);
    byPeriod[r.return_period] = (byPeriod[r.return_period] || 0) + Number(r.net_gst_payable);
  }
  return {
    count: recs.length,
    totalOutput: round2(totalOutput),
    totalInput:  round2(totalInput),
    totalNet:    round2(totalNet),
    totalPaid:   round2(totalPaid),
    pending:     round2(totalNet - totalPaid),
    byType, byPeriod,
  };
}

module.exports = { recordGstReturn, fileGstReturn, payGst, listGstRecords, cancelGst, getGstSummary };
