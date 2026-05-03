/**
 * Fino · Cash Conversions service (Phase 7)
 *
 * Bank → conversion vendor → cash flow.
 *   Initiation (3-line group):
 *     DEBIT  Cash in Hand (1100)              cash_received  (= bank - commission)
 *     DEBIT  Conversion Charges (5210)        commission_amount
 *     CREDIT Bank: <source> (12XX)            bank_amount
 *
 *   GST invoice received (separate 2-line group):
 *     DEBIT  GST Input Credit (1800)          gst_amount
 *     CREDIT Conversion Charges (5210)        gst_amount
 *
 * Cancel reverses both groups; bank balance restored via refreshCurrentBalance.
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseLedgerGroup, reverseBySource } = require('./reversal');
const { ensurePartyByName } = require('./parties');
const { refreshCurrentBalance } = require('./bankAccounts');

const CASH_CODE        = '1100';
const GST_INPUT_CODE   = '1800';
const CONV_CHARGE_CODE = '5210';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today  = () => new Date().toISOString().slice(0, 10);

// ─── Auto numbering ──────────────────────────────────────────────────────────

async function getNextConversionNumber() {
  const { data, error } = await supabase
    .from('fino_cash_conversions')
    .select('conversion_number')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0]?.conversion_number;
  if (!last) return 'CONV-0001';
  const m = /CONV-(\d+)/i.exec(last);
  if (!m) return 'CONV-0001';
  const n = parseInt(m[1], 10) + 1;
  return `CONV-${String(n).padStart(4, '0')}`;
}

// ─── COA helpers ─────────────────────────────────────────────────────────────

async function bankCoaCode(bankAccountId) {
  const { data, error } = await supabase
    .from('fino_bank_accounts').select('linked_account_id').eq('id', bankAccountId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Bank account not found');
  const { data: coa, error: cErr } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', data.linked_account_id).maybeSingle();
  if (cErr) throw cErr;
  return coa?.code || null;
}

// ─── List / get ──────────────────────────────────────────────────────────────

async function listConversions({
  vendorId = null, status = null, companyId = null,
  from = null, to = null, includeDeleted = false,
} = {}) {
  let q = supabase
    .from('fino_cash_conversions')
    .select('*, vendor:fino_parties(id, name, default_conversion_pct, reliability_score), bank:fino_bank_accounts(id, account_name, bank_name)')
    .order('conversion_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (vendorId)   q = q.eq('vendor_party_id', vendorId);
  if (status)     q = q.eq('status', status);
  if (companyId)  q = q.eq('company_id', companyId);
  if (from)       q = q.gte('conversion_date', from);
  if (to)         q = q.lte('conversion_date', to);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getConversion(id) {
  const { data: conv, error } = await supabase
    .from('fino_cash_conversions')
    .select('*, vendor:fino_parties(id, name, default_conversion_pct, reliability_score, gstin), bank:fino_bank_accounts(id, account_name, bank_name, linked_account_id)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!conv) return null;

  // Linked ledger entries (both main + gst groups)
  const groupIds = [conv.main_txn_group_id, conv.gst_txn_group_id].filter(Boolean);
  let ledger = [];
  if (groupIds.length) {
    const { data: rows } = await supabase
      .from('fino_ledger_entries')
      .select('*, account:fino_chart_of_accounts(code, name)')
      .in('txn_group_id', groupIds)
      .order('created_at', { ascending: true });
    ledger = rows || [];
  }
  return { conversion: conv, ledger };
}

// ─── Create ──────────────────────────────────────────────────────────────────

async function createConversion(data) {
  let {
    conversionNumber,
    conversionDate,
    vendorPartyId, vendorName,
    bankAccountId,
    bankAmount,
    commissionPct,
    companyId, notes,
  } = data;

  if (!conversionDate) throw new Error('conversionDate required');
  if (!bankAccountId)  throw new Error('bankAccountId required');
  const amt = Number(bankAmount);
  if (!(amt > 0)) throw new Error('bankAmount must be > 0');

  // Resolve vendor (id or name)
  if (!vendorPartyId && vendorName) {
    const party = await ensurePartyByName(vendorName, { is_conversion_vendor: true });
    vendorPartyId = party.id;
  }
  if (!vendorPartyId) throw new Error('vendorPartyId or vendorName required');

  // Confirm vendor party exists; auto-set is_conversion_vendor flag if not set
  const { data: party, error: pErr } = await supabase
    .from('fino_parties')
    .select('id, name, is_conversion_vendor, default_conversion_pct, is_deleted')
    .eq('id', vendorPartyId).maybeSingle();
  if (pErr) throw pErr;
  if (!party || party.is_deleted) throw new Error('Vendor not found');
  if (!party.is_conversion_vendor) {
    await supabase.from('fino_parties')
      .update({ is_conversion_vendor: true, updated_at: new Date().toISOString() })
      .eq('id', vendorPartyId);
  }

  const pct = commissionPct != null
    ? Number(commissionPct)
    : Number(party.default_conversion_pct || 0);
  if (!(pct >= 0) || pct > 100) throw new Error('commissionPct must be between 0 and 100');

  const commission = round2(amt * pct / 100);
  const cashReceived = round2(amt - commission);

  const number = (conversionNumber?.trim?.()) || (await getNextConversionNumber());

  // Insert header
  const { data: conv, error: cErr } = await supabase
    .from('fino_cash_conversions').insert({
      conversion_number: number,
      conversion_date: conversionDate,
      vendor_party_id: vendorPartyId,
      bank_account_id: bankAccountId,
      bank_amount: amt,
      commission_pct: pct,
      commission_amount: commission,
      cash_received: cashReceived,
      cash_status: 'pending',
      gst_invoice_status: 'pending',
      status: 'active',
      company_id: companyId || null,
      notes: notes?.trim?.() || null,
    }).select().single();
  if (cErr) {
    if (cErr.code === '23505') throw new Error(`Conversion number "${number}" already exists`);
    throw cErr;
  }

  // 3-line ledger group
  const bankCode = await bankCoaCode(bankAccountId);
  if (!bankCode) throw new Error('Bank COA code not found');

  const lines = [];
  if (cashReceived > 0) lines.push({ accountCode: CASH_CODE, direction: 'debit', amount: cashReceived, description: `Cash received via ${number}` });
  if (commission   > 0) lines.push({ accountCode: CONV_CHARGE_CODE, direction: 'debit', amount: commission, description: `Conversion charges ${number}` });
  lines.push({ accountCode: bankCode, direction: 'credit', amount: amt, description: `Bank withdrawal for ${number}` });

  const ledger = await createLedgerEntryGroup({
    txnDate: conversionDate,
    lines,
    sourceModule: 'cash_conversion',
    sourceId: conv.id,
    partyId: vendorPartyId,
    companyId: companyId || null,
    description: `Cash conversion ${number}`,
  });

  await supabase.from('fino_cash_conversions').update({
    main_txn_group_id: ledger.txn_group_id,
    updated_at: new Date().toISOString(),
  }).eq('id', conv.id);

  // Refresh bank's stored current_balance
  try { await refreshCurrentBalance(bankAccountId); } catch (_) {}

  const { data: fresh } = await supabase.from('fino_cash_conversions').select('*').eq('id', conv.id).maybeSingle();
  return { conversion: fresh || conv, ledgerGroup: ledger };
}

// ─── Mark cash received ──────────────────────────────────────────────────────

async function markCashReceived(id, { receivedDate, notes } = {}) {
  const { data: conv, error } = await supabase
    .from('fino_cash_conversions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!conv) throw new Error('Conversion not found');
  if (conv.is_deleted || conv.status === 'cancelled') throw new Error(`Cannot mark a ${conv.status} conversion`);
  if (conv.cash_status === 'received') throw new Error('Cash already marked as received');

  const update = {
    cash_status: 'received',
    cash_received_date: receivedDate || today(),
    updated_at: new Date().toISOString(),
  };
  if (notes) update.notes = notes;

  // Auto-complete if both received (or invoice n/a)
  const invoiceDone = ['received', 'not_applicable'].includes(conv.gst_invoice_status);
  if (invoiceDone) update.status = 'completed';

  const { data, error: uErr } = await supabase
    .from('fino_cash_conversions').update(update).eq('id', id).select().single();
  if (uErr) throw uErr;
  return data;
}

// ─── Mark GST invoice received ───────────────────────────────────────────────

async function markGstInvoiceReceived(id, {
  receivedDate, invoiceNumber, invoiceAmount, gstRate, notes,
} = {}) {
  const { data: conv, error } = await supabase
    .from('fino_cash_conversions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!conv) throw new Error('Conversion not found');
  if (conv.is_deleted || conv.status === 'cancelled') throw new Error(`Cannot mark a ${conv.status} conversion`);
  if (conv.gst_invoice_status === 'received') throw new Error('GST invoice already marked as received');

  const invAmt = Number(invoiceAmount != null ? invoiceAmount : conv.bank_amount);
  const rate   = Number(gstRate != null ? gstRate : 18);
  if (!(invAmt > 0)) throw new Error('invoiceAmount must be > 0');
  if (!(rate >= 0))  throw new Error('gstRate must be >= 0');

  const gstAmount = round2(invAmt * rate / 100);

  // Create 2-line GST ledger group (only if gstAmount > 0)
  let gstLedger = null;
  if (gstAmount > 0) {
    gstLedger = await createLedgerEntryGroup({
      txnDate: receivedDate || today(),
      lines: [
        { accountCode: GST_INPUT_CODE,   direction: 'debit',  amount: gstAmount, description: `GST input from ${conv.conversion_number}` },
        { accountCode: CONV_CHARGE_CODE, direction: 'credit', amount: gstAmount, description: `GST credit offset ${conv.conversion_number}` },
      ],
      sourceModule: 'cash_conversion_gst',
      sourceId: conv.id,
      partyId: conv.vendor_party_id,
      companyId: conv.company_id,
      description: `GST claim for ${conv.conversion_number}`,
    });
  }

  const update = {
    gst_invoice_status: 'received',
    gst_invoice_received_date: receivedDate || today(),
    gst_invoice_number: invoiceNumber || null,
    gst_invoice_amount: invAmt,
    gst_rate: rate,
    gst_amount: gstAmount,
    gst_txn_group_id: gstLedger?.txn_group_id || null,
    updated_at: new Date().toISOString(),
  };
  if (notes) update.notes = notes;
  if (conv.cash_status === 'received') update.status = 'completed';

  const { data, error: uErr } = await supabase
    .from('fino_cash_conversions').update(update).eq('id', id).select().single();
  if (uErr) throw uErr;
  return { conversion: data, gstLedger };
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

async function cancelConversion(id, reason = null) {
  const { data: conv, error } = await supabase
    .from('fino_cash_conversions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!conv) throw new Error('Conversion not found');
  if (conv.is_deleted || conv.status === 'cancelled') throw new Error('Conversion already cancelled');

  if (conv.main_txn_group_id) {
    try { await reverseLedgerGroup({ txnGroupId: conv.main_txn_group_id, reason: reason || 'Conversion cancelled' }); } catch (_) {}
  }
  if (conv.gst_txn_group_id) {
    try { await reverseLedgerGroup({ txnGroupId: conv.gst_txn_group_id, reason: reason || 'Conversion cancelled' }); } catch (_) {}
  }
  // Belt & braces — reverse anything tagged at these sources
  try { await reverseBySource({ sourceModule: 'cash_conversion',     sourceId: id, reason: reason || 'Conversion cancelled' }); } catch (_) {}
  try { await reverseBySource({ sourceModule: 'cash_conversion_gst', sourceId: id, reason: reason || 'Conversion cancelled' }); } catch (_) {}

  await supabase.from('fino_cash_conversions').update({
    status: 'cancelled', is_deleted: true,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  if (conv.bank_account_id) try { await refreshCurrentBalance(conv.bank_account_id); } catch (_) {}

  return { success: true };
}

// ─── Edit notes ──────────────────────────────────────────────────────────────

async function updateConversionMeta(id, { notes }) {
  const { data: conv, error } = await supabase
    .from('fino_cash_conversions').select('id, status').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!conv) throw new Error('Conversion not found');
  if (conv.status === 'cancelled') throw new Error('Cannot edit a cancelled conversion');

  const { data, error: uErr } = await supabase
    .from('fino_cash_conversions')
    .update({ notes: notes ?? null, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (uErr) throw uErr;
  return data;
}

// ─── Summary ─────────────────────────────────────────────────────────────────

async function getConversionSummary() {
  const { data, error } = await supabase
    .from('fino_cash_conversions')
    .select('bank_amount, commission_amount, gst_amount, cash_status, gst_invoice_status, status, conversion_date, is_deleted');
  if (error) throw error;

  const t = today();
  const monthStart = t.slice(0, 7) + '-01';

  let total_conversions = 0, total_converted = 0, total_commission = 0, total_gst_claimed = 0;
  let pending_cash_count = 0, pending_invoice_count = 0;
  let m_count = 0, m_amount = 0, m_commission = 0;

  for (const r of (data || [])) {
    if (r.is_deleted || r.status === 'cancelled') continue;
    total_conversions += 1;
    total_converted   += Number(r.bank_amount || 0);
    total_commission  += Number(r.commission_amount || 0);
    total_gst_claimed += Number(r.gst_amount || 0);
    if (r.cash_status === 'pending') pending_cash_count += 1;
    if (r.gst_invoice_status === 'pending') pending_invoice_count += 1;
    if (r.conversion_date >= monthStart) {
      m_count += 1;
      m_amount     += Number(r.bank_amount || 0);
      m_commission += Number(r.commission_amount || 0);
    }
  }
  return {
    total_conversions,
    total_converted:   round2(total_converted),
    total_commission:  round2(total_commission),
    total_gst_claimed: round2(total_gst_claimed),
    pending_cash_count, pending_invoice_count,
    this_month: { count: m_count, amount: round2(m_amount), commission: round2(m_commission) },
  };
}

module.exports = {
  getNextConversionNumber,
  listConversions, getConversion,
  createConversion, updateConversionMeta, cancelConversion,
  markCashReceived, markGstInvoiceReceived,
  getConversionSummary,
};
