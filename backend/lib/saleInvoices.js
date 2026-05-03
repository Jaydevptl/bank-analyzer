/**
 * Fino · Sale Invoices service (Phase 5)
 *
 * Ledger flow per invoice:
 *   Group 1 (revenue): DEBIT 1300 (AR) / CREDIT 4100 (Sales) [+ CREDIT 2300 (GST Output)]
 *   Group 2 (cogs):    DEBIT 5100 (COGS) / CREDIT 1400 (Inventory)  [products only]
 *   Each payment:      DEBIT bank/cash/cc / CREDIT 1300 (AR)
 *
 * Stock & inventory value adjusted on `fino_items` for product lines only.
 * Cancellation reverses every linked ledger group + restores stock.
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseLedgerGroup, reverseBySource } = require('./reversal');
const { ensurePartyByName } = require('./parties');
const { adjustStock } = require('./items');
const { refreshCurrentBalance } = require('./bankAccounts');

const AR_CODE         = '1300';
const INVENTORY_CODE  = '1400';
const GST_OUTPUT_CODE = '2300';
const SALES_CODE      = '4100';
const COGS_CODE       = '5100';
const CASH_CODE       = '1100';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today  = () => new Date().toISOString().slice(0, 10);

// ─── Auto invoice numbering ──────────────────────────────────────────────────

async function getNextInvoiceNumber() {
  const { data, error } = await supabase
    .from('fino_sale_invoices')
    .select('invoice_number')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0]?.invoice_number;
  if (!last) return 'INV-0001';
  const m = /INV-(\d+)/i.exec(last);
  if (!m) return 'INV-0001';
  const n = parseInt(m[1], 10) + 1;
  return `INV-${String(n).padStart(4, '0')}`;
}

// ─── Internal: COA code resolution for payment paid_via_account_id ──────────

async function coaCodeById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', id).maybeSingle();
  if (error) throw error;
  return data?.code || null;
}

async function bankCoaIdByBankId(bankId) {
  const { data, error } = await supabase
    .from('fino_bank_accounts').select('linked_account_id').eq('id', bankId).maybeSingle();
  if (error) throw error;
  return data?.linked_account_id || null;
}

async function coaIdByCode(code) {
  const { data, error } = await supabase
    .from('fino_chart_of_accounts').select('id').eq('code', code).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`COA code ${code} missing — run Phase 2 seed`);
  return data.id;
}

// ─── List / get ──────────────────────────────────────────────────────────────

async function listInvoices({
  customerId = null, status = null, companyId = null,
  from = null, to = null, search = null, includeDeleted = false,
} = {}) {
  let q = supabase
    .from('fino_sale_invoices')
    .select('*, customer:fino_parties(id, name)')
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (customerId) q = q.eq('customer_party_id', customerId);
  if (status)     q = q.eq('status', status);
  if (companyId)  q = q.eq('company_id', companyId);
  if (from)       q = q.gte('invoice_date', from);
  if (to)         q = q.lte('invoice_date', to);
  if (search) {
    // invoice_number is the easy ilike; customer name match handled client-side after fetch
    q = q.ilike('invoice_number', `%${search}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getInvoice(id) {
  const { data: invoice, error } = await supabase
    .from('fino_sale_invoices')
    .select('*, customer:fino_parties(id, name, gstin, contact_phone, contact_email)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!invoice) return null;

  const [itemsR, paysR] = await Promise.all([
    supabase.from('fino_sale_invoice_items')
      .select('*, item:fino_items(id, name, type, unit, hsn_sac_code)')
      .eq('invoice_id', id).order('sort_order', { ascending: true }),
    supabase.from('fino_sale_payments')
      .select('*').eq('invoice_id', id).eq('is_deleted', false)
      .order('payment_date', { ascending: false }),
  ]);
  if (itemsR.error) throw itemsR.error;
  if (paysR.error)  throw paysR.error;
  return { invoice, items: itemsR.data || [], payments: paysR.data || [] };
}

// ─── Create ──────────────────────────────────────────────────────────────────

async function createInvoice(data) {
  let {
    invoiceNumber,
    invoiceDate, dueDate,
    customerPartyId, customerName,
    companyId, notes, termsAndConditions,
    discountAmount = 0, roundOff = 0,
    items = [],
    paymentOnCreation = null,
  } = data;

  if (!invoiceDate) throw new Error('invoiceDate required');
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one line item required');
  }

  // Resolve customer (id or name)
  if (!customerPartyId && customerName) {
    const party = await ensurePartyByName(customerName, { is_customer: true });
    customerPartyId = party.id;
  }
  if (!customerPartyId) throw new Error('customerPartyId or customerName required');

  // Ensure party has is_customer flag
  const { data: party, error: pErr } = await supabase
    .from('fino_parties').select('id, name, is_customer, is_deleted').eq('id', customerPartyId).maybeSingle();
  if (pErr) throw pErr;
  if (!party || party.is_deleted) throw new Error('Customer not found');
  if (!party.is_customer) {
    await supabase.from('fino_parties').update({ is_customer: true, updated_at: new Date().toISOString() }).eq('id', customerPartyId);
  }

  // Pre-fetch all referenced items for stock + COGS data
  const itemIds = [...new Set(items.map(li => li.itemId).filter(Boolean))];
  const { data: itemRows, error: iErr } = await supabase
    .from('fino_items').select('*').in('id', itemIds);
  if (iErr) throw iErr;
  const itemById = new Map((itemRows || []).map(r => [r.id, r]));

  // Compute lines + validate stock
  const lineRows = [];
  let subtotal = 0, totalGst = 0;
  for (let i = 0; i < items.length; i++) {
    const li = items[i];
    if (!li.itemId) throw new Error(`Line ${i + 1}: itemId required`);
    const item = itemById.get(li.itemId);
    if (!item) throw new Error(`Line ${i + 1}: item not found`);
    const qty  = Number(li.quantity);
    const rate = Number(li.rate);
    if (!(qty > 0))  throw new Error(`Line ${i + 1}: quantity must be > 0`);
    if (!(rate >= 0)) throw new Error(`Line ${i + 1}: rate must be >= 0`);

    const isProduct = item.type === 'product';
    if (isProduct) {
      const inStock = Number(item.current_stock_qty || 0);
      if (qty > inStock + 0.0001) {
        throw new Error(`Insufficient stock for "${item.name}": only ${inStock} available, requested ${qty}`);
      }
    }

    const gstRate = li.gstRate != null ? Number(li.gstRate) : Number(item.gst_rate || 0);
    const lineTotal = round2(qty * rate);
    const gstAmount = round2(lineTotal * gstRate / 100);
    const lineGrandTotal = round2(lineTotal + gstAmount);

    const costPrice = isProduct ? Number(item.default_purchase_price || 0) : 0;
    const cogsTotal = isProduct ? round2(qty * costPrice) : 0;

    subtotal += lineTotal;
    totalGst += gstAmount;
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
      cost_price: costPrice,
      cogs_total: cogsTotal,
      sort_order: i,
      _is_product: isProduct,
      _item_name: item.name,
    });
  }
  subtotal = round2(subtotal);
  totalGst = round2(totalGst);
  const discount = round2(discountAmount);
  const round    = round2(roundOff);
  const grandTotal = round2(subtotal + totalGst - discount + round);

  // Auto invoice number (use provided if given)
  const number = (invoiceNumber?.trim?.()) || (await getNextInvoiceNumber());

  // Insert header
  const { data: invoice, error: invErr } = await supabase
    .from('fino_sale_invoices').insert({
      invoice_number: number,
      invoice_date: invoiceDate,
      due_date: dueDate || null,
      customer_party_id: customerPartyId,
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
    if (invErr.code === '23505') throw new Error(`Invoice number "${number}" already exists`);
    throw invErr;
  }

  // Insert line items (strip helper underscore fields)
  const stripped = lineRows.map(({ _is_product, _item_name, ...r }) => ({ ...r, invoice_id: invoice.id }));
  const { error: liErr } = await supabase.from('fino_sale_invoice_items').insert(stripped);
  if (liErr) {
    // Best-effort cleanup
    await supabase.from('fino_sale_invoices').delete().eq('id', invoice.id);
    throw liErr;
  }

  // Build revenue ledger group.
  // Discount: handled as a reduction in Sales credit (net revenue), keeping group balanced
  //   without needing a dedicated Discount COA.
  // Round-off: handled by adding a balancing line on Sales (the plug account).
  const arDebit     = round2(grandTotal);
  const salesCredit = round2(subtotal - discount);
  const adjLines = [
    { accountCode: AR_CODE,    direction: 'debit',  amount: arDebit,     description: `Receivable for ${number}` },
    { accountCode: SALES_CODE, direction: 'credit', amount: salesCredit, description: `Sales revenue ${number}` },
  ];
  if (totalGst > 0) adjLines.push({ accountCode: GST_OUTPUT_CODE, direction: 'credit', amount: totalGst, description: `GST output ${number}` });

  let dSum = 0, cSum = 0;
  for (const l of adjLines) (l.direction === 'debit' ? dSum += l.amount : cSum += l.amount);
  const diff = round2(dSum - cSum);
  if (Math.abs(diff) > 0.001) {
    adjLines.push({
      accountCode: SALES_CODE,
      direction: diff > 0 ? 'credit' : 'debit',
      amount: Math.abs(diff),
      description: `Round-off ${number}`,
    });
  }

  const revenueGroup = await createLedgerEntryGroup({
    txnDate: invoiceDate,
    lines: adjLines,
    sourceModule: 'sale_invoice_revenue',
    sourceId: invoice.id,
    partyId: customerPartyId,
    companyId: companyId || null,
    description: `Sale invoice ${number}`,
  });

  // COGS ledger group (sum across product lines only)
  let cogsGroup = null;
  const productLines = lineRows.filter(l => l._is_product && l.cogs_total > 0);
  const cogsSum = round2(productLines.reduce((a, l) => a + Number(l.cogs_total), 0));
  if (cogsSum > 0) {
    cogsGroup = await createLedgerEntryGroup({
      txnDate: invoiceDate,
      lines: [
        { accountCode: COGS_CODE,      direction: 'debit',  amount: cogsSum, description: `COGS for ${number}` },
        { accountCode: INVENTORY_CODE, direction: 'credit', amount: cogsSum, description: `Inventory out ${number}` },
      ],
      sourceModule: 'sale_invoice_cogs',
      sourceId: invoice.id,
      partyId: customerPartyId,
      companyId: companyId || null,
      description: `COGS for invoice ${number}`,
    });
  }

  // Stamp ledger group ids on header
  await supabase.from('fino_sale_invoices').update({
    revenue_txn_group_id: revenueGroup.txn_group_id,
    cogs_txn_group_id:    cogsGroup?.txn_group_id || null,
  }).eq('id', invoice.id);

  // Adjust item stock for products (qty + value down)
  for (const l of productLines) {
    await adjustStock(l.item_id, -Number(l.quantity), -Number(l.cogs_total));
  }
  // Also handle non-cogs product lines (zero cost): still reduce qty
  for (const l of lineRows.filter(l => l._is_product && !(l.cogs_total > 0))) {
    await adjustStock(l.item_id, -Number(l.quantity), 0);
  }

  // Optional payment on creation
  let payment = null;
  if (paymentOnCreation && Number(paymentOnCreation.amount) > 0) {
    payment = (await recordPayment({
      invoiceId: invoice.id,
      paymentDate: paymentOnCreation.paymentDate || invoiceDate,
      amount: Number(paymentOnCreation.amount),
      paymentMode: paymentOnCreation.paymentMode,
      paidViaAccountId: paymentOnCreation.paidViaAccountId,
      referenceNumber: paymentOnCreation.referenceNumber,
      notes: paymentOnCreation.notes,
    })).payment;
  }

  // Refetch fresh header (status / amount_paid may have changed via recordPayment)
  const { data: fresh } = await supabase.from('fino_sale_invoices').select('*').eq('id', invoice.id).maybeSingle();
  return {
    invoice: fresh || invoice,
    items: stripped,
    revenueGroup,
    cogsGroup,
    payment,
  };
}

// ─── Edit metadata only ──────────────────────────────────────────────────────

async function updateInvoiceMeta(id, fields) {
  const { data: inv, error } = await supabase
    .from('fino_sale_invoices').select('id, status').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!inv) throw new Error('Invoice not found');
  if (['cancelled', 'deleted'].includes(inv.status)) {
    throw new Error(`Cannot edit a ${inv.status} invoice`);
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
    .from('fino_sale_invoices').update(update).eq('id', id).select().single();
  if (uErr) throw uErr;
  return data;
}

// ─── Cancel (full reversal) ──────────────────────────────────────────────────

async function cancelInvoice(id, reason = null) {
  const detail = await getInvoice(id);
  if (!detail) throw new Error('Invoice not found');
  const { invoice, items, payments } = detail;
  if (invoice.is_deleted || invoice.status === 'cancelled') throw new Error('Invoice already cancelled');

  // Reverse payments first
  for (const p of payments) {
    if (p.is_deleted) continue;
    if (p.ledger_txn_group_id) {
      try { await reverseLedgerGroup({ txnGroupId: p.ledger_txn_group_id, reason: reason || 'Invoice cancelled' }); } catch (_) {}
    }
    await supabase.from('fino_sale_payments').update({ is_deleted: true }).eq('id', p.id);
    // Refresh bank balance if applicable
    if (p.payment_mode === 'bank' || p.payment_mode === 'upi' || p.payment_mode === 'cheque') {
      // Best-effort: find bank by linked_account_id
      const { data: b } = await supabase.from('fino_bank_accounts').select('id').eq('linked_account_id', p.paid_via_account_id).maybeSingle();
      if (b?.id) try { await refreshCurrentBalance(b.id); } catch (_) {}
    }
  }

  // Reverse revenue + COGS groups
  if (invoice.revenue_txn_group_id) {
    try { await reverseLedgerGroup({ txnGroupId: invoice.revenue_txn_group_id, reason: reason || 'Invoice cancelled' }); } catch (_) {}
  }
  if (invoice.cogs_txn_group_id) {
    try { await reverseLedgerGroup({ txnGroupId: invoice.cogs_txn_group_id, reason: reason || 'Invoice cancelled' }); } catch (_) {}
  }
  // Belt-and-braces: also reverse anything tagged at this source
  try { await reverseBySource({ sourceModule: 'sale_invoice_revenue', sourceId: id, reason: reason || 'Invoice cancelled' }); } catch (_) {}
  try { await reverseBySource({ sourceModule: 'sale_invoice_cogs',    sourceId: id, reason: reason || 'Invoice cancelled' }); } catch (_) {}

  // Restore stock (qty + value)
  for (const li of items) {
    if (li.item?.type === 'product') {
      await adjustStock(li.item_id, +Number(li.quantity), +Number(li.cogs_total));
    }
  }

  // Mark cancelled + deleted
  await supabase.from('fino_sale_invoices').update({
    status: 'cancelled', is_deleted: true,
    amount_paid: 0, balance_due: 0,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  return { success: true };
}

// ─── Payments ────────────────────────────────────────────────────────────────

async function _resolvePaymentCoa({ paymentMode, paidViaAccountId }) {
  if (!paymentMode) throw new Error('paymentMode required');
  // Cash: convenience — caller may omit paidViaAccountId
  if (paymentMode === 'cash' && !paidViaAccountId) {
    return { code: CASH_CODE, accountId: await coaIdByCode(CASH_CODE) };
  }
  if (!paidViaAccountId) throw new Error('paidViaAccountId required for non-cash payment modes');
  // paidViaAccountId may be a COA id directly OR a bank/cc id — assume COA id (frontend passes COA id)
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
    .from('fino_sale_invoices').select('*').eq('id', invoiceId).maybeSingle();
  if (error) throw error;
  if (!inv) throw new Error('Invoice not found');
  if (inv.is_deleted || ['cancelled', 'deleted'].includes(inv.status)) {
    throw new Error(`Cannot accept payment on ${inv.status} invoice`);
  }
  if (amt > Number(inv.balance_due) + 0.001) {
    throw new Error(`Payment exceeds balance due (max ₹${Number(inv.balance_due).toFixed(2)})`);
  }

  const { code: paidViaCode, accountId } = await _resolvePaymentCoa({ paymentMode, paidViaAccountId });

  const { data: pay, error: pErr } = await supabase
    .from('fino_sale_payments').insert({
      invoice_id: invoiceId,
      payment_date: paymentDate,
      amount: amt,
      payment_mode: paymentMode,
      paid_via_account_id: accountId,
      reference_number: referenceNumber || null,
      notes: notes || null,
    }).select().single();
  if (pErr) throw pErr;

  const ledger = await createLedgerEntryGroup({
    txnDate: paymentDate,
    lines: [
      { accountCode: paidViaCode, direction: 'debit',  amount: amt, description: `Payment for ${inv.invoice_number}` },
      { accountCode: AR_CODE,     direction: 'credit', amount: amt, description: `AR settled ${inv.invoice_number}` },
    ],
    sourceModule: 'sale_payment',
    sourceId: pay.id,
    partyId: inv.customer_party_id,
    companyId: inv.company_id,
    description: `Payment for ${inv.invoice_number}`,
  });
  await supabase.from('fino_sale_payments').update({ ledger_txn_group_id: ledger.txn_group_id }).eq('id', pay.id);

  // Update invoice totals + status
  const newPaid = round2(Number(inv.amount_paid) + amt);
  const newBal  = round2(Number(inv.grand_total) - newPaid);
  let newStatus = inv.status;
  if (newBal <= 0.005) newStatus = 'paid';
  else if (newPaid > 0) newStatus = 'partially_paid';
  await supabase.from('fino_sale_invoices').update({
    amount_paid: newPaid, balance_due: Math.max(0, newBal),
    status: newStatus, updated_at: new Date().toISOString(),
  }).eq('id', invoiceId);

  // If bank-style payment, refresh that bank's current_balance
  if (['bank', 'upi', 'cheque'].includes(paymentMode)) {
    const { data: bank } = await supabase
      .from('fino_bank_accounts').select('id').eq('linked_account_id', accountId).maybeSingle();
    if (bank?.id) try { await refreshCurrentBalance(bank.id); } catch (_) {}
  }

  return { payment: { ...pay, ledger_txn_group_id: ledger.txn_group_id }, ledger, newBalanceDue: Math.max(0, newBal), newStatus };
}

async function deletePayment(paymentId, reason = null) {
  const { data: p, error } = await supabase
    .from('fino_sale_payments').select('*').eq('id', paymentId).maybeSingle();
  if (error) throw error;
  if (!p) throw new Error('Payment not found');
  if (p.is_deleted) throw new Error('Already deleted');

  if (p.ledger_txn_group_id) {
    await reverseLedgerGroup({ txnGroupId: p.ledger_txn_group_id, reason: reason || 'Payment deleted' });
  }
  await supabase.from('fino_sale_payments').update({ is_deleted: true }).eq('id', paymentId);

  // Recompute invoice totals
  const { data: inv } = await supabase.from('fino_sale_invoices').select('*').eq('id', p.invoice_id).maybeSingle();
  if (inv && !inv.is_deleted) {
    const { data: pays } = await supabase
      .from('fino_sale_payments').select('amount').eq('invoice_id', p.invoice_id).eq('is_deleted', false);
    const sumPaid = round2((pays || []).reduce((a, x) => a + Number(x.amount), 0));
    const newBal  = round2(Number(inv.grand_total) - sumPaid);
    let newStatus = 'confirmed';
    if (newBal <= 0.005 && Number(inv.grand_total) > 0) newStatus = 'paid';
    else if (sumPaid > 0) newStatus = 'partially_paid';
    await supabase.from('fino_sale_invoices').update({
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
    .from('fino_sale_payments').select('*')
    .eq('invoice_id', invoiceId).eq('is_deleted', false)
    .order('payment_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ─── Summary ─────────────────────────────────────────────────────────────────

async function getInvoiceSummary() {
  const { data, error } = await supabase
    .from('fino_sale_invoices').select('grand_total, amount_paid, balance_due, due_date, invoice_date, status, is_deleted');
  if (error) throw error;
  const t = today();
  const monthStart = t.slice(0, 7) + '-01';

  let total_invoices = 0, total_revenue = 0, total_collected = 0, total_outstanding = 0;
  let overdue_count = 0, overdue_amount = 0;
  let m_invoices = 0, m_revenue = 0, m_collected = 0;

  for (const r of (data || [])) {
    if (r.is_deleted || r.status === 'cancelled' || r.status === 'deleted') continue;
    total_invoices += 1;
    total_revenue   += Number(r.grand_total || 0);
    total_collected += Number(r.amount_paid || 0);
    total_outstanding += Number(r.balance_due || 0);
    if (r.due_date && r.due_date < t && Number(r.balance_due) > 0) {
      overdue_count += 1;
      overdue_amount += Number(r.balance_due);
    }
    if (r.invoice_date >= monthStart) {
      m_invoices += 1;
      m_revenue  += Number(r.grand_total || 0);
      m_collected += Number(r.amount_paid || 0);
    }
  }
  return {
    total_invoices,
    total_revenue:   round2(total_revenue),
    total_collected: round2(total_collected),
    total_outstanding: round2(total_outstanding),
    overdue_count,
    overdue_amount: round2(overdue_amount),
    this_month: { invoices: m_invoices, revenue: round2(m_revenue), collected: round2(m_collected) },
  };
}

async function getCustomerOutstanding(customerPartyId) {
  const { data, error } = await supabase
    .from('fino_sale_invoices').select('balance_due')
    .eq('customer_party_id', customerPartyId).eq('is_deleted', false);
  if (error) throw error;
  return round2((data || []).reduce((a, r) => a + Number(r.balance_due || 0), 0));
}

module.exports = {
  getNextInvoiceNumber,
  listInvoices, getInvoice,
  createInvoice, updateInvoiceMeta, cancelInvoice,
  recordPayment, deletePayment, listPayments,
  getInvoiceSummary, getCustomerOutstanding,
};
