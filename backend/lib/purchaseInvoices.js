/**
 * Fino · Purchase Invoices service (Phase 6)
 *
 * Mirror of saleInvoices.js with directions flipped:
 *   Sale:     customer owes us → AR (asset, debit↑) → inventory ↓
 *   Purchase: we owe supplier → AP (liability, credit↑) → inventory ↑
 *
 * Ledger flow per bill:
 *   Group 1 (purchase): DEBIT 1400 (Inventory) and/or DEBIT 5100 (Purchases)
 *                       [+ DEBIT 1800 (GST Input Credit)]
 *                       CREDIT 2100 (Accounts Payable)
 *   Each payment:       DEBIT 2100 (AP) / CREDIT bank/cash
 *
 * Stock & inventory value adjusted on `fino_items` for product lines (qty + value ↑).
 * Cancellation reverses every ledger group + reduces stock back; stock CAN go
 * negative if items were sold between purchase and cancellation (warned but allowed).
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseLedgerGroup, reverseBySource } = require('./reversal');
const { ensurePartyByName } = require('./parties');
const { adjustStock } = require('./items');
const { refreshCurrentBalance } = require('./bankAccounts');

const AP_CODE        = '2100';
const INVENTORY_CODE = '1400';
const GST_INPUT_CODE = '1800';
const PURCHASES_CODE = '5100';
const CASH_CODE      = '1100';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today  = () => new Date().toISOString().slice(0, 10);

// ─── Auto bill numbering ─────────────────────────────────────────────────────

async function getNextBillNumber() {
  const { data, error } = await supabase
    .from('fino_purchase_invoices')
    .select('bill_number')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0]?.bill_number;
  if (!last) return 'BILL-0001';
  const m = /BILL-(\d+)/i.exec(last);
  if (!m) return 'BILL-0001';
  const n = parseInt(m[1], 10) + 1;
  return `BILL-${String(n).padStart(4, '0')}`;
}

// ─── COA helpers ─────────────────────────────────────────────────────────────

async function coaCodeById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', id).maybeSingle();
  if (error) throw error;
  return data?.code || null;
}

async function coaIdByCode(code) {
  const { data, error } = await supabase
    .from('fino_chart_of_accounts').select('id').eq('code', code).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`COA code ${code} missing — run Phase 2 seed`);
  return data.id;
}

// ─── List / get ──────────────────────────────────────────────────────────────

async function listPurchaseInvoices({
  supplierId = null, status = null, companyId = null,
  from = null, to = null, search = null, includeDeleted = false,
} = {}) {
  let q = supabase
    .from('fino_purchase_invoices')
    .select('*, supplier:fino_parties(id, name)')
    .order('bill_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (supplierId) q = q.eq('supplier_party_id', supplierId);
  if (status)     q = q.eq('status', status);
  if (companyId)  q = q.eq('company_id', companyId);
  if (from)       q = q.gte('bill_date', from);
  if (to)         q = q.lte('bill_date', to);
  if (search)     q = q.ilike('bill_number', `%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getPurchaseInvoice(id) {
  const { data: invoice, error } = await supabase
    .from('fino_purchase_invoices')
    .select('*, supplier:fino_parties(id, name, gstin, contact_phone, contact_email)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!invoice) return null;

  const [itemsR, paysR] = await Promise.all([
    supabase.from('fino_purchase_invoice_items')
      .select('*, item:fino_items(id, name, type, unit, hsn_sac_code)')
      .eq('invoice_id', id).order('sort_order', { ascending: true }),
    supabase.from('fino_purchase_payments')
      .select('*').eq('invoice_id', id).eq('is_deleted', false)
      .order('payment_date', { ascending: false }),
  ]);
  if (itemsR.error) throw itemsR.error;
  if (paysR.error)  throw paysR.error;
  return { invoice, items: itemsR.data || [], payments: paysR.data || [] };
}

// ─── Create ──────────────────────────────────────────────────────────────────

async function createPurchaseInvoice(data) {
  let {
    billNumber,
    billDate, dueDate,
    supplierPartyId, supplierName,
    companyId, notes, termsAndConditions,
    discountAmount = 0, roundOff = 0,
    items = [],
    paymentOnCreation = null,
  } = data;

  if (!billDate) throw new Error('billDate required');
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one line item required');
  }

  // Resolve supplier (id or name)
  if (!supplierPartyId && supplierName) {
    const party = await ensurePartyByName(supplierName, { is_supplier: true });
    supplierPartyId = party.id;
  }
  if (!supplierPartyId) throw new Error('supplierPartyId or supplierName required');

  const { data: party, error: pErr } = await supabase
    .from('fino_parties').select('id, name, is_supplier, is_deleted').eq('id', supplierPartyId).maybeSingle();
  if (pErr) throw pErr;
  if (!party || party.is_deleted) throw new Error('Supplier not found');
  if (!party.is_supplier) {
    await supabase.from('fino_parties').update({ is_supplier: true, updated_at: new Date().toISOString() }).eq('id', supplierPartyId);
  }

  // Pre-fetch items
  const itemIds = [...new Set(items.map(li => li.itemId).filter(Boolean))];
  const { data: itemRows, error: iErr } = await supabase
    .from('fino_items').select('*').in('id', itemIds);
  if (iErr) throw iErr;
  const itemById = new Map((itemRows || []).map(r => [r.id, r]));

  // Compute lines (no stock validation — purchases ADD stock)
  const lineRows = [];
  let subtotal = 0, totalGst = 0;
  let productSubtotal = 0, serviceSubtotal = 0;
  for (let i = 0; i < items.length; i++) {
    const li = items[i];
    if (!li.itemId) throw new Error(`Line ${i + 1}: itemId required`);
    const item = itemById.get(li.itemId);
    if (!item) throw new Error(`Line ${i + 1}: item not found`);
    const qty  = Number(li.quantity);
    const rate = Number(li.rate);
    if (!(qty > 0))   throw new Error(`Line ${i + 1}: quantity must be > 0`);
    if (!(rate >= 0)) throw new Error(`Line ${i + 1}: rate must be >= 0`);

    const isProduct = item.type === 'product';
    const gstRate = li.gstRate != null ? Number(li.gstRate) : Number(item.gst_rate || 0);
    const lineTotal = round2(qty * rate);
    const gstAmount = round2(lineTotal * gstRate / 100);
    const lineGrandTotal = round2(lineTotal + gstAmount);

    subtotal += lineTotal;
    totalGst += gstAmount;
    if (isProduct) productSubtotal += lineTotal; else serviceSubtotal += lineTotal;

    lineRows.push({
      item_id: item.id,
      description: (li.description?.trim?.() || item.name),
      quantity: qty,
      unit: li.unit || item.unit || null,
      rate,
      line_total: lineTotal,
      gst_rate: gstRate,
      gst_amount: gstAmount,
      line_grand_total: lineGrandTotal,
      sort_order: i,
      _is_product: isProduct,
      _item_name: item.name,
    });
  }
  subtotal = round2(subtotal);
  totalGst = round2(totalGst);
  productSubtotal = round2(productSubtotal);
  serviceSubtotal = round2(serviceSubtotal);
  const discount = round2(discountAmount);
  const round    = round2(roundOff);
  const grandTotal = round2(subtotal + totalGst - discount + round);

  const number = (billNumber?.trim?.()) || (await getNextBillNumber());

  // Insert header
  const { data: invoice, error: invErr } = await supabase
    .from('fino_purchase_invoices').insert({
      bill_number: number,
      bill_date: billDate,
      due_date: dueDate || null,
      supplier_party_id: supplierPartyId,
      subtotal, total_gst: totalGst,
      discount_amount: discount, round_off: round,
      grand_total: grandTotal,
      amount_paid: 0,
      balance_due: grandTotal,
      status: 'confirmed',
      company_id: companyId || null,
      notes: notes?.trim?.() || null,
      terms_and_conditions: termsAndConditions?.trim?.() || null,
    }).select().single();
  if (invErr) {
    if (invErr.code === '23505') throw new Error(`Bill number "${number}" already exists`);
    throw invErr;
  }

  // Insert line items
  const stripped = lineRows.map(({ _is_product, _item_name, ...r }) => ({ ...r, invoice_id: invoice.id }));
  const { error: liErr } = await supabase.from('fino_purchase_invoice_items').insert(stripped);
  if (liErr) {
    await supabase.from('fino_purchase_invoices').delete().eq('id', invoice.id);
    throw liErr;
  }

  // Build purchase ledger group.
  // Discount: reduce the debited amount proportionally on the inventory/purchases side.
  //   Simple approach: subtract discount from productSubtotal first (since most discounts
  //   apply to goods); if discount exceeds productSubtotal, spill into serviceSubtotal.
  //   Round-off handled via plug line on AP side at the end.
  let prodDebit = round2(productSubtotal);
  let svcDebit  = round2(serviceSubtotal);
  let discountLeft = discount;
  if (discountLeft > 0 && prodDebit > 0) {
    const cut = Math.min(prodDebit, discountLeft);
    prodDebit = round2(prodDebit - cut);
    discountLeft = round2(discountLeft - cut);
  }
  if (discountLeft > 0 && svcDebit > 0) {
    const cut = Math.min(svcDebit, discountLeft);
    svcDebit = round2(svcDebit - cut);
    discountLeft = round2(discountLeft - cut);
  }

  const apCredit = round2(grandTotal);
  const ledgerLines = [];
  if (prodDebit > 0) ledgerLines.push({ accountCode: INVENTORY_CODE, direction: 'debit', amount: prodDebit, description: `Inventory in ${number}` });
  if (svcDebit  > 0) ledgerLines.push({ accountCode: PURCHASES_CODE, direction: 'debit', amount: svcDebit,  description: `Service purchase ${number}` });
  if (totalGst  > 0) ledgerLines.push({ accountCode: GST_INPUT_CODE, direction: 'debit', amount: totalGst,  description: `GST input ${number}` });
  ledgerLines.push({ accountCode: AP_CODE, direction: 'credit', amount: apCredit, description: `Payable for ${number}` });

  // Round-off plug on AP side if needed
  let dSum = 0, cSum = 0;
  for (const l of ledgerLines) (l.direction === 'debit' ? dSum += l.amount : cSum += l.amount);
  const diff = round2(dSum - cSum);
  if (Math.abs(diff) > 0.001) {
    // diff > 0 → need extra credit; use Purchases (5100) as the plug expense/contra
    ledgerLines.push({
      accountCode: PURCHASES_CODE,
      direction: diff > 0 ? 'credit' : 'debit',
      amount: Math.abs(diff),
      description: `Round-off ${number}`,
    });
  }

  // Edge case: if every line amount is zero (only round-off), skip ledger entirely
  let purchaseGroup = null;
  if (ledgerLines.length >= 2) {
    purchaseGroup = await createLedgerEntryGroup({
      txnDate: billDate,
      lines: ledgerLines,
      sourceModule: 'purchase_invoice',
      sourceId: invoice.id,
      partyId: supplierPartyId,
      companyId: companyId || null,
      description: `Purchase bill ${number}`,
    });
  }

  await supabase.from('fino_purchase_invoices').update({
    purchase_txn_group_id: purchaseGroup?.txn_group_id || null,
  }).eq('id', invoice.id);

  // Adjust stock for product lines: qty + line_total (cost = invoice rate × qty)
  for (const l of lineRows.filter(l => l._is_product)) {
    await adjustStock(l.item_id, +Number(l.quantity), +Number(l.line_total));
  }

  // Optional payment on creation
  let payment = null;
  if (paymentOnCreation && Number(paymentOnCreation.amount) > 0) {
    payment = (await recordPayment({
      invoiceId: invoice.id,
      paymentDate: paymentOnCreation.paymentDate || billDate,
      amount: Number(paymentOnCreation.amount),
      paymentMode: paymentOnCreation.paymentMode,
      paidViaAccountId: paymentOnCreation.paidViaAccountId,
      referenceNumber: paymentOnCreation.referenceNumber,
      notes: paymentOnCreation.notes,
    })).payment;
  }

  const { data: fresh } = await supabase.from('fino_purchase_invoices').select('*').eq('id', invoice.id).maybeSingle();
  return {
    invoice: fresh || invoice,
    items: stripped,
    purchaseGroup,
    payment,
  };
}

// ─── Edit metadata ───────────────────────────────────────────────────────────

async function updatePurchaseInvoiceMeta(id, fields) {
  const { data: inv, error } = await supabase
    .from('fino_purchase_invoices').select('id, status').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!inv) throw new Error('Bill not found');
  if (['cancelled', 'deleted'].includes(inv.status)) {
    throw new Error(`Cannot edit a ${inv.status} bill`);
  }
  const update = { updated_at: new Date().toISOString() };
  const map = {
    notes: 'notes',
    termsAndConditions: 'terms_and_conditions',
    dueDate: 'due_date',
  };
  for (const [k, col] of Object.entries(map)) {
    if (fields[k] !== undefined) update[col] = (typeof fields[k] === 'string') ? fields[k].trim() : fields[k];
  }
  if (Object.keys(update).length === 1) throw new Error('No editable fields supplied');

  const { data, error: uErr } = await supabase
    .from('fino_purchase_invoices').update(update).eq('id', id).select().single();
  if (uErr) throw uErr;
  return data;
}

// ─── Cancel (full reversal) ──────────────────────────────────────────────────

async function cancelPurchaseInvoice(id, reason = null) {
  const detail = await getPurchaseInvoice(id);
  if (!detail) throw new Error('Bill not found');
  const { invoice, items, payments } = detail;
  if (invoice.is_deleted || invoice.status === 'cancelled') throw new Error('Bill already cancelled');

  // Reverse payments first
  for (const p of payments) {
    if (p.is_deleted) continue;
    if (p.ledger_txn_group_id) {
      try { await reverseLedgerGroup({ txnGroupId: p.ledger_txn_group_id, reason: reason || 'Bill cancelled' }); } catch (_) {}
    }
    await supabase.from('fino_purchase_payments').update({ is_deleted: true }).eq('id', p.id);
    if (['bank', 'upi', 'cheque'].includes(p.payment_mode)) {
      const { data: b } = await supabase.from('fino_bank_accounts').select('id').eq('linked_account_id', p.paid_via_account_id).maybeSingle();
      if (b?.id) try { await refreshCurrentBalance(b.id); } catch (_) {}
    }
  }

  // Reverse purchase ledger group
  if (invoice.purchase_txn_group_id) {
    try { await reverseLedgerGroup({ txnGroupId: invoice.purchase_txn_group_id, reason: reason || 'Bill cancelled' }); } catch (_) {}
  }
  try { await reverseBySource({ sourceModule: 'purchase_invoice', sourceId: id, reason: reason || 'Bill cancelled' }); } catch (_) {}

  // Reduce stock back (warn allowed → may go negative if items sold meanwhile)
  for (const li of items) {
    if (li.item?.type === 'product') {
      await adjustStock(li.item_id, -Number(li.quantity), -Number(li.line_total));
    }
  }

  await supabase.from('fino_purchase_invoices').update({
    status: 'cancelled', is_deleted: true,
    amount_paid: 0, balance_due: 0,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  return { success: true };
}

// ─── Payments ────────────────────────────────────────────────────────────────

async function _resolvePaymentCoa({ paymentMode, paidViaAccountId }) {
  if (!paymentMode) throw new Error('paymentMode required');
  if (paymentMode === 'cash' && !paidViaAccountId) {
    return { code: CASH_CODE, accountId: await coaIdByCode(CASH_CODE) };
  }
  if (!paidViaAccountId) throw new Error('paidViaAccountId required for non-cash payment modes');
  const code = await coaCodeById(paidViaAccountId);
  if (!code) throw new Error('paid_via_account_id does not resolve to a COA row');
  return { code, accountId: paidViaAccountId };
}

async function recordPayment({
  invoiceId, paymentDate, amount,
  paymentMode, paidViaAccountId,
  referenceNumber, notes,
}) {
  const amt = Number(amount);
  if (!(amt > 0))   throw new Error('amount must be > 0');
  if (!paymentDate) throw new Error('paymentDate required');

  const { data: inv, error } = await supabase
    .from('fino_purchase_invoices').select('*').eq('id', invoiceId).maybeSingle();
  if (error) throw error;
  if (!inv) throw new Error('Bill not found');
  if (inv.is_deleted || ['cancelled', 'deleted'].includes(inv.status)) {
    throw new Error(`Cannot pay a ${inv.status} bill`);
  }
  if (amt > Number(inv.balance_due) + 0.001) {
    throw new Error(`Payment exceeds balance due (max ₹${Number(inv.balance_due).toFixed(2)})`);
  }

  const { code: paidViaCode, accountId } = await _resolvePaymentCoa({ paymentMode, paidViaAccountId });

  const { data: pay, error: pErr } = await supabase
    .from('fino_purchase_payments').insert({
      invoice_id: invoiceId,
      payment_date: paymentDate,
      amount: amt,
      payment_mode: paymentMode,
      paid_via_account_id: accountId,
      reference_number: referenceNumber || null,
      notes: notes || null,
    }).select().single();
  if (pErr) throw pErr;

  // DEBIT AP (liability ↓) / CREDIT bank-or-cash (asset ↓)
  const ledger = await createLedgerEntryGroup({
    txnDate: paymentDate,
    lines: [
      { accountCode: AP_CODE,     direction: 'debit',  amount: amt, description: `AP settled ${inv.bill_number}` },
      { accountCode: paidViaCode, direction: 'credit', amount: amt, description: `Payment for ${inv.bill_number}` },
    ],
    sourceModule: 'purchase_payment',
    sourceId: pay.id,
    partyId: inv.supplier_party_id,
    companyId: inv.company_id,
    description: `Payment for ${inv.bill_number}`,
  });
  await supabase.from('fino_purchase_payments').update({ ledger_txn_group_id: ledger.txn_group_id }).eq('id', pay.id);

  // Update bill totals + status
  const newPaid = round2(Number(inv.amount_paid) + amt);
  const newBal  = round2(Number(inv.grand_total) - newPaid);
  let newStatus = inv.status;
  if (newBal <= 0.005) newStatus = 'paid';
  else if (newPaid > 0) newStatus = 'partially_paid';
  await supabase.from('fino_purchase_invoices').update({
    amount_paid: newPaid, balance_due: Math.max(0, newBal),
    status: newStatus, updated_at: new Date().toISOString(),
  }).eq('id', invoiceId);

  if (['bank', 'upi', 'cheque'].includes(paymentMode)) {
    const { data: bank } = await supabase
      .from('fino_bank_accounts').select('id').eq('linked_account_id', accountId).maybeSingle();
    if (bank?.id) try { await refreshCurrentBalance(bank.id); } catch (_) {}
  }

  return { payment: { ...pay, ledger_txn_group_id: ledger.txn_group_id }, ledger, newBalanceDue: Math.max(0, newBal), newStatus };
}

async function deletePayment(paymentId, reason = null) {
  const { data: p, error } = await supabase
    .from('fino_purchase_payments').select('*').eq('id', paymentId).maybeSingle();
  if (error) throw error;
  if (!p) throw new Error('Payment not found');
  if (p.is_deleted) throw new Error('Already deleted');

  if (p.ledger_txn_group_id) {
    await reverseLedgerGroup({ txnGroupId: p.ledger_txn_group_id, reason: reason || 'Payment deleted' });
  }
  await supabase.from('fino_purchase_payments').update({ is_deleted: true }).eq('id', paymentId);

  const { data: inv } = await supabase.from('fino_purchase_invoices').select('*').eq('id', p.invoice_id).maybeSingle();
  if (inv && !inv.is_deleted) {
    const { data: pays } = await supabase
      .from('fino_purchase_payments').select('amount').eq('invoice_id', p.invoice_id).eq('is_deleted', false);
    const sumPaid = round2((pays || []).reduce((a, x) => a + Number(x.amount), 0));
    const newBal  = round2(Number(inv.grand_total) - sumPaid);
    let newStatus = 'confirmed';
    if (newBal <= 0.005 && Number(inv.grand_total) > 0) newStatus = 'paid';
    else if (sumPaid > 0) newStatus = 'partially_paid';
    await supabase.from('fino_purchase_invoices').update({
      amount_paid: sumPaid, balance_due: Math.max(0, newBal),
      status: newStatus, updated_at: new Date().toISOString(),
    }).eq('id', p.invoice_id);
  }

  if (['bank', 'upi', 'cheque'].includes(p.payment_mode)) {
    const { data: bank } = await supabase
      .from('fino_bank_accounts').select('id').eq('linked_account_id', p.paid_via_account_id).maybeSingle();
    if (bank?.id) try { await refreshCurrentBalance(bank.id); } catch (_) {}
  }

  return { success: true };
}

async function listPayments(invoiceId) {
  const { data, error } = await supabase
    .from('fino_purchase_payments').select('*')
    .eq('invoice_id', invoiceId).eq('is_deleted', false)
    .order('payment_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ─── Summary ─────────────────────────────────────────────────────────────────

async function getPurchaseSummary() {
  const { data, error } = await supabase
    .from('fino_purchase_invoices').select('grand_total, amount_paid, balance_due, due_date, bill_date, status, is_deleted');
  if (error) throw error;
  const t = today();
  const monthStart = t.slice(0, 7) + '-01';

  let total_bills = 0, total_purchases = 0, total_paid = 0, total_payable = 0;
  let overdue_count = 0, overdue_amount = 0;
  let m_bills = 0, m_purchases = 0, m_paid = 0;

  for (const r of (data || [])) {
    if (r.is_deleted || r.status === 'cancelled' || r.status === 'deleted') continue;
    total_bills += 1;
    total_purchases += Number(r.grand_total || 0);
    total_paid      += Number(r.amount_paid || 0);
    total_payable   += Number(r.balance_due || 0);
    if (r.due_date && r.due_date < t && Number(r.balance_due) > 0) {
      overdue_count += 1;
      overdue_amount += Number(r.balance_due);
    }
    if (r.bill_date >= monthStart) {
      m_bills += 1;
      m_purchases += Number(r.grand_total || 0);
      m_paid      += Number(r.amount_paid || 0);
    }
  }
  return {
    total_bills,
    total_purchases: round2(total_purchases),
    total_paid:      round2(total_paid),
    total_payable:   round2(total_payable),
    overdue_count,
    overdue_amount:  round2(overdue_amount),
    this_month: { bills: m_bills, purchases: round2(m_purchases), paid: round2(m_paid) },
  };
}

async function getSupplierPayable(supplierPartyId) {
  const { data, error } = await supabase
    .from('fino_purchase_invoices').select('balance_due')
    .eq('supplier_party_id', supplierPartyId).eq('is_deleted', false);
  if (error) throw error;
  return round2((data || []).reduce((a, r) => a + Number(r.balance_due || 0), 0));
}

module.exports = {
  getNextBillNumber,
  listPurchaseInvoices, getPurchaseInvoice,
  createPurchaseInvoice, updatePurchaseInvoiceMeta, cancelPurchaseInvoice,
  recordPayment, deletePayment, listPayments,
  getPurchaseSummary, getSupplierPayable,
};
