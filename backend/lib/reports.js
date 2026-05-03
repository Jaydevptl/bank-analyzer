/**
 * Fino · Financial Reports (Phase 19)
 *
 * All reports compute live from fino_ledger_entries + fino_chart_of_accounts.
 * No new tables, no caching — slow but always consistent.
 *
 * Sign convention per code prefix:
 *   1XXX Asset      → net = debits - credits (positive = asset value)
 *   2XXX Liability  → net = credits - debits (positive = amount owed)
 *   3XXX Equity     → net = credits - debits (positive = equity)
 *   4XXX Income     → net = credits - debits (positive = revenue earned)
 *   5XXX Expense    → net = debits - credits (positive = expense incurred)
 */

const supabase = require('./supabase');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today  = () => new Date().toISOString().slice(0, 10);

function _natureFromCode(code) {
  const head = String(code || '').charAt(0);
  if (head === '1') return { type: 'asset',     direction: 'debit'  };
  if (head === '2') return { type: 'liability', direction: 'credit' };
  if (head === '3') return { type: 'equity',    direction: 'credit' };
  if (head === '4') return { type: 'income',    direction: 'credit' };
  if (head === '5') return { type: 'expense',   direction: 'debit'  };
  return { type: 'unknown', direction: 'debit' };
}

// ─── Internal: aggregate ledger by account_id, returning a map of account_id → { debit, credit } ──
async function _aggregateLedger({ companyId = null, from = null, to = null } = {}) {
  // Stream-fetch (paginate to handle > 1000 rows)
  const limit = 1000;
  let offset = 0;
  const accMap = new Map();
  while (true) {
    let q = supabase
      .from('fino_ledger_entries')
      .select('account_id, direction, amount, txn_date, company_id, is_reversed')
      .eq('is_reversed', false)
      .range(offset, offset + limit - 1);
    if (companyId) q = q.eq('company_id', companyId);
    if (from)      q = q.gte('txn_date', from);
    if (to)        q = q.lte('txn_date', to);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const cur = accMap.get(r.account_id) || { debit: 0, credit: 0 };
      if (r.direction === 'debit') cur.debit  += Number(r.amount);
      else                          cur.credit += Number(r.amount);
      accMap.set(r.account_id, cur);
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return accMap;
}

async function _coaMap() {
  const { data, error } = await supabase
    .from('fino_chart_of_accounts')
    .select('id, code, name, type, sub_type');
  if (error) throw error;
  return new Map((data || []).map(c => [c.id, c]));
}

// ─── Profit & Loss ───────────────────────────────────────────────────────────

async function getProfitAndLoss({ companyId = null, from = null, to = null } = {}) {
  const [agg, coas] = await Promise.all([
    _aggregateLedger({ companyId, from, to }),
    _coaMap(),
  ]);
  const revenue = [], expenses = [];
  let totalRevenue = 0, totalExpenses = 0;

  for (const [accId, totals] of agg.entries()) {
    const c = coas.get(accId);
    if (!c) continue;
    const head = c.code.charAt(0);
    if (head === '4') {
      const amt = round2(totals.credit - totals.debit);
      if (Math.abs(amt) < 0.01) continue;
      revenue.push({ code: c.code, name: c.name, amount: amt });
      totalRevenue += amt;
    } else if (head === '5') {
      const amt = round2(totals.debit - totals.credit);
      if (Math.abs(amt) < 0.01) continue;
      expenses.push({ code: c.code, name: c.name, amount: amt });
      totalExpenses += amt;
    }
  }
  revenue.sort((a, b) => a.code.localeCompare(b.code));
  expenses.sort((a, b) => a.code.localeCompare(b.code));
  const netProfit = round2(totalRevenue - totalExpenses);
  return {
    period: { from: from || null, to: to || today() },
    companyId,
    revenue,
    expenses,
    totalRevenue: round2(totalRevenue),
    totalExpenses: round2(totalExpenses),
    netProfit,
  };
}

// ─── Balance Sheet ───────────────────────────────────────────────────────────

async function getBalanceSheet({ companyId = null, asOfDate = null } = {}) {
  const [agg, coas] = await Promise.all([
    _aggregateLedger({ companyId, to: asOfDate || today() }),
    _coaMap(),
  ]);
  const assets = [], liabilities = [], equity = [];
  let totalAssets = 0, totalLiabilities = 0, totalEquity = 0;
  let income = 0, expense = 0;

  for (const [accId, totals] of agg.entries()) {
    const c = coas.get(accId);
    if (!c) continue;
    const head = c.code.charAt(0);
    if (head === '1') {
      const amt = round2(totals.debit - totals.credit);
      if (Math.abs(amt) < 0.01) continue;
      assets.push({ code: c.code, name: c.name, amount: amt });
      totalAssets += amt;
    } else if (head === '2') {
      const amt = round2(totals.credit - totals.debit);
      if (Math.abs(amt) < 0.01) continue;
      liabilities.push({ code: c.code, name: c.name, amount: amt });
      totalLiabilities += amt;
    } else if (head === '3') {
      const amt = round2(totals.credit - totals.debit);
      if (Math.abs(amt) < 0.01) continue;
      equity.push({ code: c.code, name: c.name, amount: amt });
      totalEquity += amt;
    } else if (head === '4') {
      income += totals.credit - totals.debit;
    } else if (head === '5') {
      expense += totals.debit - totals.credit;
    }
  }
  // Retained earnings = net P&L through asOfDate, folded into equity
  const retainedEarnings = round2(income - expense);
  if (Math.abs(retainedEarnings) >= 0.01) {
    equity.push({ code: 'RE', name: 'Retained Earnings (P&L this period)', amount: retainedEarnings });
    totalEquity += retainedEarnings;
  }

  assets.sort((a, b) => a.code.localeCompare(b.code));
  liabilities.sort((a, b) => a.code.localeCompare(b.code));
  equity.sort((a, b) => a.code.localeCompare(b.code));

  const balanced = Math.abs(round2(totalAssets) - round2(totalLiabilities + totalEquity)) < 0.5;
  return {
    asOfDate: asOfDate || today(),
    companyId,
    assets, liabilities, equity,
    totalAssets:      round2(totalAssets),
    totalLiabilities: round2(totalLiabilities),
    totalEquity:      round2(totalEquity),
    balanced,
    difference: round2(totalAssets - totalLiabilities - totalEquity),
  };
}

// ─── Cash Flow ───────────────────────────────────────────────────────────────

async function getCashFlow({ companyId = null, from = null, to = null } = {}) {
  // Pull every ledger row that touched cash/bank accounts (codes 1100, 1200, 12XX)
  // and classify by counter-side code prefix.
  const limit = 1000;
  let offset = 0;
  const allRows = [];
  while (true) {
    let q = supabase
      .from('fino_ledger_entries')
      .select('txn_group_id, account_id, direction, amount, txn_date, source_module, company_id, is_reversed')
      .eq('is_reversed', false)
      .range(offset, offset + limit - 1);
    if (companyId) q = q.eq('company_id', companyId);
    if (from)      q = q.gte('txn_date', from);
    if (to)        q = q.lte('txn_date', to);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  const coas = await _coaMap();

  // Group by txn_group_id
  const groups = new Map();
  for (const r of allRows) {
    const g = groups.get(r.txn_group_id) || [];
    g.push(r);
    groups.set(r.txn_group_id, g);
  }

  let operatingIn = 0, operatingOut = 0;
  let investingIn = 0, investingOut = 0;
  let financingIn = 0, financingOut = 0;

  for (const [, lines] of groups.entries()) {
    // Find the cash/bank line(s) in this group
    const cashLines = lines.filter(l => {
      const c = coas.get(l.account_id);
      return c && (c.code === '1100' || c.code === '1200' || (c.code.startsWith('12') && c.code !== '1200'));
    });
    if (cashLines.length === 0) continue;
    // Net cash effect from this group: debits to cash = inflow, credits = outflow
    let cashDelta = 0;
    for (const l of cashLines) cashDelta += (l.direction === 'debit' ? Number(l.amount) : -Number(l.amount));
    if (Math.abs(cashDelta) < 0.01) continue;
    // Category from source_module + counter-side codes
    const counterCodes = lines
      .filter(l => !cashLines.includes(l))
      .map(l => coas.get(l.account_id)?.code)
      .filter(Boolean);
    const sm = lines[0]?.source_module || '';
    let category = 'operating';
    if (/loan|drawing|capital|partnership/i.test(sm) || counterCodes.some(c => c.startsWith('1500') || c.startsWith('31') || c.startsWith('32') || c.startsWith('34') || c.startsWith('22') || c.startsWith('24'))) {
      category = 'financing';
    } else if (/share|invest|fixed_asset|stock_buy|stock_sell|amazon|hawala/i.test(sm) || counterCodes.some(c => c.startsWith('19') || c.startsWith('195') || c.startsWith('161'))) {
      category = 'investing';
    }
    if (category === 'operating') {
      if (cashDelta > 0) operatingIn += cashDelta; else operatingOut += -cashDelta;
    } else if (category === 'investing') {
      if (cashDelta > 0) investingIn += cashDelta; else investingOut += -cashDelta;
    } else {
      if (cashDelta > 0) financingIn += cashDelta; else financingOut += -cashDelta;
    }
  }

  const operatingNet = round2(operatingIn - operatingOut);
  const investingNet = round2(investingIn - investingOut);
  const financingNet = round2(financingIn - financingOut);
  const netCashChange = round2(operatingNet + investingNet + financingNet);

  return {
    period: { from: from || null, to: to || today() },
    companyId,
    operating: { inflow: round2(operatingIn), outflow: round2(operatingOut), net: operatingNet },
    investing: { inflow: round2(investingIn), outflow: round2(investingOut), net: investingNet },
    financing: { inflow: round2(financingIn), outflow: round2(financingOut), net: financingNet },
    netCashChange,
  };
}

// ─── Trial Balance ───────────────────────────────────────────────────────────

async function getTrialBalance({ companyId = null, asOfDate = null } = {}) {
  const [agg, coas] = await Promise.all([
    _aggregateLedger({ companyId, to: asOfDate || today() }),
    _coaMap(),
  ]);
  const lines = [];
  let totalDebits = 0, totalCredits = 0;
  for (const [accId, totals] of agg.entries()) {
    const c = coas.get(accId);
    if (!c) continue;
    const debit = round2(totals.debit), credit = round2(totals.credit);
    if (debit < 0.01 && credit < 0.01) continue;
    const net = debit - credit;
    lines.push({
      code: c.code, name: c.name, type: c.type,
      debit, credit,
      balance: round2(Math.abs(net)),
      balanceSide: net >= 0 ? 'debit' : 'credit',
    });
    totalDebits  += debit;
    totalCredits += credit;
  }
  lines.sort((a, b) => a.code.localeCompare(b.code));
  const balanced = Math.abs(round2(totalDebits) - round2(totalCredits)) < 0.5;
  return {
    asOfDate: asOfDate || today(),
    companyId,
    lines,
    totalDebits:  round2(totalDebits),
    totalCredits: round2(totalCredits),
    balanced,
    difference: round2(totalDebits - totalCredits),
  };
}

// ─── Tax Report ──────────────────────────────────────────────────────────────

async function getTaxReport({ companyId = null, financialYear = null } = {}) {
  // GST: use 1800 (input), 2300 (output) ledger movement
  // TDS: use 1700 (receivable) + 2410 (payable, may not exist)
  const [agg, coas] = await Promise.all([
    _aggregateLedger({ companyId }),
    _coaMap(),
  ]);
  const codeBalance = (code, dir) => {
    const acc = [...coas.entries()].find(([, c]) => c.code === code);
    if (!acc) return 0;
    const t = agg.get(acc[0]) || { debit: 0, credit: 0 };
    return dir === 'debit' ? round2(t.debit - t.credit) : round2(t.credit - t.debit);
  };
  const inputGst       = codeBalance('1800', 'debit');
  const outputGst      = codeBalance('2300', 'credit');
  const tdsReceivable  = codeBalance('1700', 'debit');
  const tdsPayable     = codeBalance('2410', 'credit');

  // Pull GST records for the FY
  let gstRecords = [];
  try {
    const { data } = await supabase
      .from('fino_gst_records')
      .select('*').eq('is_deleted', false);
    gstRecords = data || [];
    if (financialYear) {
      const yr = financialYear.split('-')[0];
      gstRecords = gstRecords.filter(r => (r.return_period || '').startsWith(yr));
    }
  } catch {}

  let tdsRecords = [];
  try {
    const { data } = await supabase
      .from('fino_tds_records')
      .select('*').eq('is_deleted', false);
    tdsRecords = data || [];
    if (financialYear) tdsRecords = tdsRecords.filter(r => r.financial_year === financialYear);
  } catch {}

  return {
    companyId, financialYear,
    gst: {
      inputCredit: inputGst,
      outputLiability: outputGst,
      netPayable: round2(outputGst - inputGst),
      records: gstRecords,
    },
    tds: {
      receivable: tdsReceivable,
      payable: tdsPayable,
      records: tdsRecords,
    },
  };
}

// ─── Day Book ────────────────────────────────────────────────────────────────

async function getDayBook({ companyId = null, date = null } = {}) {
  const d = date || today();
  let q = supabase
    .from('fino_ledger_entries')
    .select('*, account:account_id(code, name, type)')
    .eq('is_reversed', false)
    .eq('txn_date', d)
    .order('created_at', { ascending: true });
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw error;
  let totalDebits = 0, totalCredits = 0;
  for (const r of (data || [])) {
    if (r.direction === 'debit') totalDebits += Number(r.amount);
    else                          totalCredits += Number(r.amount);
  }
  return {
    date: d, companyId,
    entries: data || [],
    totalDebits:  round2(totalDebits),
    totalCredits: round2(totalCredits),
    balanced: Math.abs(round2(totalDebits) - round2(totalCredits)) < 0.5,
  };
}

// ─── Ledger Report (single account) ──────────────────────────────────────────

async function getLedgerReport({ accountCode, from = null, to = null } = {}) {
  if (!accountCode) throw new Error('accountCode required');
  const { data: coa, error: cErr } = await supabase
    .from('fino_chart_of_accounts').select('id, code, name, type').eq('code', accountCode).maybeSingle();
  if (cErr) throw cErr;
  if (!coa) throw new Error(`COA code ${accountCode} not found`);

  let q = supabase
    .from('fino_ledger_entries')
    .select('*')
    .eq('account_id', coa.id)
    .eq('is_reversed', false)
    .order('txn_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (from) q = q.gte('txn_date', from);
  if (to)   q = q.lte('txn_date', to);
  const { data, error } = await q;
  if (error) throw error;

  // Apply running balance using account natural side
  const isDebitNat = ['1', '5'].includes(String(coa.code).charAt(0));
  let running = 0;
  const entries = (data || []).map(r => {
    const amt = Number(r.amount);
    if (isDebitNat) running += (r.direction === 'debit' ? amt : -amt);
    else            running += (r.direction === 'credit' ? amt : -amt);
    return { ...r, running_balance: round2(running) };
  });
  let totalDebits = 0, totalCredits = 0;
  for (const r of entries) {
    if (r.direction === 'debit') totalDebits += Number(r.amount);
    else                          totalCredits += Number(r.amount);
  }
  return {
    account: coa,
    period: { from: from || null, to: to || today() },
    entries,
    totalDebits:  round2(totalDebits),
    totalCredits: round2(totalCredits),
    closingBalance: round2(running),
    closingSide: isDebitNat ? 'debit' : 'credit',
  };
}

// ─── Receivables / Payables ──────────────────────────────────────────────────

async function getReceivablesReport({ companyId = null } = {}) {
  let q = supabase
    .from('fino_sale_invoices')
    .select('id, invoice_number, invoice_date, due_date, grand_total, amount_paid, balance_due, status, customer:customer_party_id(id, name)')
    .eq('is_deleted', false)
    .gt('balance_due', 0)
    .order('due_date', { ascending: true });
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data || [];
  let totalOutstanding = 0;
  const byCustomer = new Map();
  const t = today();
  let overdueCount = 0, overdueAmount = 0;
  for (const inv of rows) {
    totalOutstanding += Number(inv.balance_due);
    const k = inv.customer?.id || 'unknown';
    const cur = byCustomer.get(k) || { name: inv.customer?.name || 'Unknown', total: 0, count: 0 };
    cur.total += Number(inv.balance_due); cur.count += 1;
    byCustomer.set(k, cur);
    if (inv.due_date && inv.due_date < t) {
      overdueCount += 1;
      overdueAmount += Number(inv.balance_due);
    }
  }
  return {
    companyId,
    invoices: rows,
    totalOutstanding: round2(totalOutstanding),
    overdueCount,
    overdueAmount: round2(overdueAmount),
    byCustomer: [...byCustomer.entries()].map(([id, v]) => ({ customer_id: id, name: v.name, total: round2(v.total), count: v.count }))
      .sort((a, b) => b.total - a.total),
  };
}

async function getPayablesReport({ companyId = null } = {}) {
  let q = supabase
    .from('fino_purchase_invoices')
    .select('id, bill_number, bill_date, due_date, grand_total, amount_paid, balance_due, status, supplier:supplier_party_id(id, name)')
    .eq('is_deleted', false)
    .gt('balance_due', 0)
    .order('due_date', { ascending: true });
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data || [];
  let totalOutstanding = 0;
  const bySupplier = new Map();
  const t = today();
  let overdueCount = 0, overdueAmount = 0;
  for (const bill of rows) {
    totalOutstanding += Number(bill.balance_due);
    const k = bill.supplier?.id || 'unknown';
    const cur = bySupplier.get(k) || { name: bill.supplier?.name || 'Unknown', total: 0, count: 0 };
    cur.total += Number(bill.balance_due); cur.count += 1;
    bySupplier.set(k, cur);
    if (bill.due_date && bill.due_date < t) {
      overdueCount += 1;
      overdueAmount += Number(bill.balance_due);
    }
  }
  return {
    companyId,
    bills: rows,
    totalOutstanding: round2(totalOutstanding),
    overdueCount,
    overdueAmount: round2(overdueAmount),
    bySupplier: [...bySupplier.entries()].map(([id, v]) => ({ supplier_id: id, name: v.name, total: round2(v.total), count: v.count }))
      .sort((a, b) => b.total - a.total),
  };
}

module.exports = {
  getProfitAndLoss, getBalanceSheet, getCashFlow, getTrialBalance,
  getTaxReport, getDayBook, getLedgerReport,
  getReceivablesReport, getPayablesReport,
};
