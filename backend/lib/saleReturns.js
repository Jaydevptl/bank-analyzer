/**
 * Fino · Sale Returns / Credit Notes (Phase 17C)
 *
 * Reverses a sale: customer returns goods, we issue a credit/refund.
 *
 * Per-line accounting (mirror of saleInvoices.createInvoice):
 *   1) Revenue reversal (always):
 *        DEBIT  4300 Sale Returns       (line_total)
 *        DEBIT  2300 GST Output         (gst_amount, only if > 0)
 *        CREDIT 1300 Accounts Receivable (line_grand_total)
 *   2) Inventory restore (only for product items with stock value):
 *        DEBIT  1400 Inventory   / CREDIT 5100 COGS (proportional value)
 *   3) Optional refund payment (if refundMode='bank' or 'cash'):
 *        DEBIT  1300 AR / CREDIT bank-COA  (settles the credit we just owe them)
 *      For 'credit_note' / 'adjustment': no payment ledger; AR carries the credit
 *
 * COA seeded:
 *   4300 Sale Returns (income, contra) — auto-seeded
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseBySource } = require('./reversal');
const { adjustStock } = require('./items');

const SALE_RETURNS_CODE = '4300';
const GST_OUTPUT_CODE   = '2300';
const AR_CODE           = '1300';
const INVENTORY_CODE    = '1400';
const COGS_CODE         = '5100';

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
      description: 'Auto-seeded for Sale Returns (Phase 17C)',
    }).select('id, code').single();
  if (error) throw error;
  return data;
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
    .from('fino_sale_returns').select('return_number').order('created_at', { ascending: false }).limit(50);
  let max = 0;
  for (const r of (data || [])) {
    const m = (r.return_number || '').match(/^RET-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `RET-${String(max + 1).padStart(4, '0')}`;
}

async function createReturn({
  returnNumber, returnDate, originalInvoiceId, customerPartyId, reason,
  refundMode, refundViaAccountId, companyId, notes, items,
}) {
  if (!returnDate)               throw new Error('returnDate required');
  if (!customerPartyId)          throw new Error('customerPartyId required');
  if (!['bank','cash','credit_note','adjustment'].includes(refundMode)) throw new Error('Invalid refundMode');
  if (!Array.isArray(items) || items.length === 0) throw new Error('At least one item line required');

  await ensureExactCoa({ code: SALE_RETURNS_CODE, name: 'Sale Returns', type: 'income', subType: 'other_income' });

  // Compute line totals
  let subtotal = 0, totalGst = 0, grandTotal = 0;
  const lineRows = [];
  for (const li of items) {
    if (!li.itemId)                      throw new Error('Each line needs itemId');
    const qty  = Number(li.quantity);
    const rate = Number(li.rate);
    const gstRate = Number(li.gstRate || 0);
    if (!(qty > 0))   throw new Error('quantity > 0 per line');
    if (!(rate >= 0)) throw new Error('rate >= 0 per line');
    const line_total = round2(qty * rate);
    const gst_amount = round2(line_total * gstRate / 100);
    const line_grand_total = round2(line_total + gst_amount);
    subtotal += line_total; totalGst += gst_amount; grandTotal += line_grand_total;
    lineRows.push({
      original_invoice_item_id: li.originalInvoiceItemId || null,
      item_id: li.itemId,
      quantity: qty,
      rate,
      gst_rate: gstRate,
      line_total,
      gst_amount,
      line_grand_total,
    });
  }
  subtotal = round2(subtotal); totalGst = round2(totalGst); grandTotal = round2(grandTotal);
  const refundAmount = (refundMode === 'bank' || refundMode === 'cash') ? grandTotal : 0;
  const refundCoaId  = (refundMode === 'bank') ? await _resolveToCoaId(refundViaAccountId) : null;

  const number = returnNumber?.trim() || await _nextNumber();

  // Insert header + items
  const { data: header, error: hErr } = await supabase
    .from('fino_sale_returns').insert({
      return_number: number,
      return_date: returnDate,
      original_invoice_id: originalInvoiceId || null,
      customer_party_id: customerPartyId,
      reason: reason?.trim() || null,
      subtotal,
      total_gst: totalGst,
      grand_total: grandTotal,
      refund_amount: refundAmount,
      refund_mode: refundMode,
      refund_via_account_id: refundCoaId,
      company_id: companyId || null,
      notes: notes?.trim() || null,
      status: refundMode === 'credit_note' || refundMode === 'adjustment' ? 'confirmed' : 'refunded',
    }).select().single();
  if (hErr) throw hErr;

  const { error: liErr } = await supabase
    .from('fino_sale_return_items')
    .insert(lineRows.map(l => ({ ...l, return_id: header.id })));
  if (liErr) throw liErr;

  // Build ledger lines
  const ledgerLines = [];
  if (subtotal > 0) {
    ledgerLines.push({ accountCode: SALE_RETURNS_CODE, direction: 'debit',  amount: subtotal,  partyId: customerPartyId, companyId });
  }
  if (totalGst > 0) {
    ledgerLines.push({ accountCode: GST_OUTPUT_CODE,   direction: 'debit',  amount: totalGst,  partyId: customerPartyId, companyId });
  }
  if (grandTotal > 0) {
    ledgerLines.push({ accountCode: AR_CODE,           direction: 'credit', amount: grandTotal, partyId: customerPartyId, companyId });
  }

  // Inventory restore (only for product items with avg cost > 0)
  const itemIds = [...new Set(items.map(li => li.itemId))];
  const { data: itemRows } = await supabase
    .from('fino_items').select('id, type, current_stock_qty, current_stock_value').in('id', itemIds);
  const itemMap = new Map((itemRows || []).map(it => [it.id, it]));
  let totalCogsReversed = 0;
  for (const li of items) {
    const it = itemMap.get(li.itemId);
    if (!it || it.type !== 'product') continue;
    const qty = Number(li.quantity);
    const curQty = Number(it.current_stock_qty);
    const curVal = Number(it.current_stock_value);
    const avgCost = curQty > 0 ? curVal / curQty : 0;
    const restoreVal = round2(qty * avgCost);
    if (restoreVal > 0) totalCogsReversed += restoreVal;
    try { await adjustStock(li.itemId, qty, restoreVal); } catch (_) {}
  }
  if (totalCogsReversed > 0) {
    ledgerLines.push({ accountCode: INVENTORY_CODE, direction: 'debit',  amount: round2(totalCogsReversed), companyId });
    ledgerLines.push({ accountCode: COGS_CODE,      direction: 'credit', amount: round2(totalCogsReversed), companyId });
  }

  // Refund payment (settles AR back to bank)
  if ((refundMode === 'bank' || refundMode === 'cash') && refundAmount > 0) {
    let bankCode = null;
    if (refundMode === 'bank') {
      bankCode = await _coaCodeFromAccount(refundViaAccountId);
      if (!bankCode) throw new Error('refundViaAccountId does not resolve to COA');
    } else {
      bankCode = '1100';
    }
    ledgerLines.push({ accountCode: AR_CODE,   direction: 'debit',  amount: refundAmount, partyId: customerPartyId, companyId });
    ledgerLines.push({ accountCode: bankCode,  direction: 'credit', amount: refundAmount, companyId });
  }

  let ledger = null;
  if (ledgerLines.length >= 2) {
    ledger = await createLedgerEntryGroup({
      txnDate: returnDate,
      lines: ledgerLines,
      description: `Sale Return ${number}`,
      sourceModule: 'sale_return',
      sourceId: header.id,
      partyId: customerPartyId,
      companyId: companyId || null,
    });
    await supabase.from('fino_sale_returns')
      .update({ ledger_txn_group_id: ledger.txn_group_id })
      .eq('id', header.id);
  }

  if (refundMode === 'bank') await _refreshBank(refundViaAccountId);
  return { return: header, items: lineRows, ledger };
}

async function listReturns({ customerId = null, invoiceId = null, status = null, includeDeleted = false } = {}) {
  let q = supabase
    .from('fino_sale_returns')
    .select('*, customer:customer_party_id(id, name)')
    .order('return_date', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (customerId)      q = q.eq('customer_party_id', customerId);
  if (invoiceId)       q = q.eq('original_invoice_id', invoiceId);
  if (status)          q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getReturn(id) {
  const { data: header, error } = await supabase
    .from('fino_sale_returns').select('*, customer:customer_party_id(id, name, contact_phone)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!header) return null;
  const { data: items } = await supabase
    .from('fino_sale_return_items')
    .select('*, item:fino_items(id, name, type, unit)')
    .eq('return_id', id);
  return { return: header, items: items || [] };
}

async function cancelReturn(id, reason = null) {
  const detail = await getReturn(id);
  if (!detail) throw new Error('Return not found');
  const { return: row, items } = detail;
  if (row.is_deleted) throw new Error('Already deleted');
  if (row.ledger_txn_group_id) {
    try { await reverseBySource({ sourceModule: 'sale_return', sourceId: id, reason: reason || 'Sale return cancelled' }); } catch (_) {}
  }
  // Roll back stock restoration (subtract qty + cost again)
  for (const li of items) {
    if (li.item?.type === 'product') {
      try { await adjustStock(li.item_id, -Number(li.quantity), -Number(li.line_total || 0)); } catch (_) {}
    }
  }
  await supabase.from('fino_sale_returns').update({ is_deleted: true, status: 'cancelled' }).eq('id', id);
  if (row.refund_mode === 'bank') await _refreshBank(row.refund_via_account_id);
  return { success: true };
}

async function getReturnsSummary() {
  const all = await listReturns();
  const t = new Date();
  const monthStart = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`;
  let totalAll = 0, totalThisMonth = 0;
  for (const r of all) {
    totalAll += Number(r.grand_total);
    if (r.return_date >= monthStart) totalThisMonth += Number(r.grand_total);
  }
  return {
    count: all.length,
    totalReturns: round2(totalAll),
    totalThisMonth: round2(totalThisMonth),
    recent: all.slice(0, 5),
  };
}

module.exports = {
  createReturn, listReturns, getReturn, cancelReturn, getReturnsSummary,
};
