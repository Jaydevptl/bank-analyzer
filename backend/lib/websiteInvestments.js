/**
 * Fino · Website Investments service (Phase 12)
 *
 * Tracks websites/online businesses with expense (ad spend, hosting, etc.)
 * and revenue ledger entries. Computes profit + ROI.
 *
 * Ledger flow:
 *   Expense  : DEBIT  <expense COA per type>  / CREDIT  bank/cash
 *   Revenue  : DEBIT  bank/cash               / CREDIT  4280 Website Revenue
 *   Refund   : DEBIT  4280                    / CREDIT  bank   (reduces revenue)
 *   Other inc: DEBIT  bank                    / CREDIT  4200 Other Income
 *
 * COA used (exact codes):
 *   Income : 4280 Website Revenue           (auto-seeded)
 *   Expense: 5500 Marketing / Ads           (existing, for ad_spend/marketing)
 *            5550 Hosting & Domain          (auto-seeded)
 *            5560 Web Development           (auto-seeded)
 *            5700 Misc Expenses             (existing, for other_expense)
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseBySource } = require('./reversal');
const { refreshCurrentBalance } = require('./bankAccounts');

const REVENUE_CODE     = '4280';
const OTHER_INCOME_COA = '4200';
const HOSTING_CODE     = '5550';
const WEBDEV_CODE      = '5560';
const MARKETING_CODE   = '5500';
const MISC_EXP_CODE    = '5700';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function ensureExactCoa({ code, name, type, subType }) {
  const { data: existing, error } = await supabase
    .from('fino_chart_of_accounts').select('id, code, name').eq('code', code).maybeSingle();
  if (error) throw error;
  if (existing) return existing;
  const { data, error: insErr } = await supabase
    .from('fino_chart_of_accounts').insert({
      code, name, type, sub_type: subType,
      is_system: true, is_active: true,
      description: 'Auto-seeded for Website Investments (Phase 12)',
    }).select('id, code, name').single();
  if (insErr) throw insErr;
  return data;
}

async function seedWebsiteCoa() {
  await ensureExactCoa({ code: REVENUE_CODE, name: 'Website Revenue',  type: 'income',  subType: 'operating_income' });
  await ensureExactCoa({ code: HOSTING_CODE, name: 'Hosting & Domain', type: 'expense', subType: 'indirect_expense' });
  await ensureExactCoa({ code: WEBDEV_CODE,  name: 'Web Development',  type: 'expense', subType: 'indirect_expense' });
}

function _expenseCodeForType(txnType) {
  switch (txnType) {
    case 'ad_spend':      return MARKETING_CODE;
    case 'marketing':     return MARKETING_CODE;
    case 'hosting':       return HOSTING_CODE;
    case 'domain':        return HOSTING_CODE;
    case 'development':   return WEBDEV_CODE;
    case 'other_expense': return MISC_EXP_CODE;
    default:              return MISC_EXP_CODE;
  }
}

async function _accountCoaCode(accountId) {
  if (!accountId) return null;
  // Try bank account → linked COA
  const { data: ba } = await supabase
    .from('fino_bank_accounts').select('linked_account_id').eq('id', accountId).maybeSingle();
  if (ba?.linked_account_id) {
    const { data: c } = await supabase
      .from('fino_chart_of_accounts').select('code').eq('id', ba.linked_account_id).maybeSingle();
    return c?.code || null;
  }
  // Fall back: treat accountId as direct COA id
  const { data: c2 } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', accountId).maybeSingle();
  return c2?.code || null;
}

// ─── Websites CRUD ───────────────────────────────────────────────────────────

async function createWebsite({ name, url, platform, companyId, notes }) {
  if (!name?.trim()) throw new Error('name required');
  await seedWebsiteCoa();
  const { data, error } = await supabase
    .from('fino_websites').insert({
      name: name.trim(),
      url: url?.trim() || null,
      platform: platform?.trim() || null,
      company_id: companyId || null,
      notes: notes?.trim() || null,
      is_active: true,
    }).select().single();
  if (error) throw error;
  return data;
}

async function listWebsites({ includeDeleted = false, companyId = null } = {}) {
  let q = supabase.from('fino_websites').select('*').order('name');
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (companyId)       q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getWebsite(id) {
  const { data, error } = await supabase
    .from('fino_websites').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function deleteWebsite(id, reason = null) {
  const w = await getWebsite(id);
  if (!w) throw new Error('Website not found');
  if (w.is_deleted) throw new Error('Already deleted');

  // Reverse every transaction's ledger
  const { data: txns } = await supabase
    .from('fino_website_transactions').select('id').eq('website_id', id).eq('is_deleted', false);
  for (const t of (txns || [])) {
    try { await reverseBySource({ sourceModule: 'website_txn', sourceId: t.id, reason: reason || 'Website deleted' }); } catch (_) {}
  }
  await supabase.from('fino_website_transactions').update({ is_deleted: true }).eq('website_id', id);
  await supabase.from('fino_websites').update({ is_deleted: true, is_active: false }).eq('id', id);
  return { success: true };
}

// ─── Transactions ────────────────────────────────────────────────────────────

async function recordTransaction({
  websiteId, txnDate, txnType, description, amount, paidViaAccountId, notes,
}) {
  if (!websiteId) throw new Error('websiteId required');
  if (!txnDate)   throw new Error('txnDate required');
  if (!txnType)   throw new Error('txnType required');
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('amount must be > 0');
  if (!paidViaAccountId) throw new Error('paidViaAccountId required');

  await seedWebsiteCoa();
  const w = await getWebsite(websiteId);
  if (!w) throw new Error('Website not found');

  const bankCode = await _accountCoaCode(paidViaAccountId);
  if (!bankCode) throw new Error('paidViaAccountId does not resolve to a COA');

  // Determine ledger flow
  const expenseTypes = ['ad_spend', 'hosting', 'domain', 'development', 'marketing', 'other_expense'];
  const lines = [];
  let descPrefix = '';
  if (expenseTypes.includes(txnType)) {
    const expCode = _expenseCodeForType(txnType);
    lines.push({ accountCode: expCode,  direction: 'debit',  amount: amt });
    lines.push({ accountCode: bankCode, direction: 'credit', amount: amt });
    descPrefix = `${w.name} · ${txnType}`;
  } else if (txnType === 'revenue') {
    lines.push({ accountCode: bankCode,    direction: 'debit',  amount: amt });
    lines.push({ accountCode: REVENUE_CODE, direction: 'credit', amount: amt });
    descPrefix = `${w.name} · revenue`;
  } else if (txnType === 'refund') {
    // Refund issued back to customer → reduces revenue
    lines.push({ accountCode: REVENUE_CODE, direction: 'debit',  amount: amt });
    lines.push({ accountCode: bankCode,    direction: 'credit', amount: amt });
    descPrefix = `${w.name} · refund`;
  } else if (txnType === 'other_income') {
    lines.push({ accountCode: bankCode,        direction: 'debit',  amount: amt });
    lines.push({ accountCode: OTHER_INCOME_COA, direction: 'credit', amount: amt });
    descPrefix = `${w.name} · other income`;
  } else {
    throw new Error(`Unknown txnType: ${txnType}`);
  }

  // Insert row first
  const { data: row, error: insErr } = await supabase
    .from('fino_website_transactions').insert({
      website_id: websiteId,
      txn_date: txnDate,
      txn_type: txnType,
      description: description?.trim() || null,
      amount: amt,
      paid_via_account_id: paidViaAccountId,
      notes: notes?.trim() || null,
    }).select().single();
  if (insErr) throw insErr;

  const ledger = await createLedgerEntryGroup({
    txnDate,
    lines,
    description: description?.trim() || descPrefix,
    sourceModule: 'website_txn',
    sourceId: row.id,
    companyId: w.company_id,
  });

  await supabase
    .from('fino_website_transactions')
    .update({ ledger_txn_group_id: ledger.txn_group_id })
    .eq('id', row.id);

  // Refresh bank balance
  const { data: ba } = await supabase
    .from('fino_bank_accounts').select('id').eq('id', paidViaAccountId).maybeSingle();
  if (ba?.id) { try { await refreshCurrentBalance(ba.id); } catch (_) {} }

  return { transaction: row, ledger };
}

async function listTransactions({ websiteId, from = null, to = null } = {}) {
  let q = supabase
    .from('fino_website_transactions')
    .select('*')
    .eq('is_deleted', false)
    .order('txn_date', { ascending: false });
  if (websiteId) q = q.eq('website_id', websiteId);
  if (from) q = q.gte('txn_date', from);
  if (to)   q = q.lte('txn_date', to);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function deleteTransaction(id, reason = null) {
  const { data: row, error } = await supabase
    .from('fino_website_transactions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Transaction not found');
  if (row.is_deleted) throw new Error('Already deleted');

  if (row.ledger_txn_group_id) {
    const { reverseLedgerGroup } = require('./reversal');
    try { await reverseLedgerGroup({ txnGroupId: row.ledger_txn_group_id, reason: reason || 'Website txn deleted' }); }
    catch (_) { try { await reverseBySource({ sourceModule: 'website_txn', sourceId: id, reason: reason || 'Website txn deleted' }); } catch (_2) {} }
  }
  await supabase.from('fino_website_transactions').update({ is_deleted: true }).eq('id', id);

  if (row.paid_via_account_id) {
    try { await refreshCurrentBalance(row.paid_via_account_id); } catch (_) {}
  }
  return { success: true };
}

// ─── Summaries ──────────────────────────────────────────────────────────────

async function getWebsiteSummary(websiteId, { from = null, to = null } = {}) {
  const w = await getWebsite(websiteId);
  if (!w) throw new Error('Website not found');
  const txns = await listTransactions({ websiteId, from, to });

  const expenseTypes = new Set(['ad_spend', 'hosting', 'domain', 'development', 'marketing', 'other_expense']);
  let totalSpend = 0, totalRevenue = 0, totalRefunds = 0, totalOtherIncome = 0;
  const byType = {};
  const monthly = {}; // { 'YYYY-MM': { spend, revenue } }
  for (const t of txns) {
    const amt = Number(t.amount) || 0;
    const month = (t.txn_date || '').slice(0, 7);
    if (!monthly[month]) monthly[month] = { spend: 0, revenue: 0 };
    if (expenseTypes.has(t.txn_type)) {
      totalSpend += amt;
      monthly[month].spend += amt;
    } else if (t.txn_type === 'revenue') {
      totalRevenue += amt;
      monthly[month].revenue += amt;
    } else if (t.txn_type === 'refund') {
      totalRefunds += amt;
      monthly[month].revenue -= amt;
    } else if (t.txn_type === 'other_income') {
      totalOtherIncome += amt;
      monthly[month].revenue += amt;
    }
    byType[t.txn_type] = (byType[t.txn_type] || 0) + amt;
  }

  const netRevenue = round2(totalRevenue + totalOtherIncome - totalRefunds);
  const profit = round2(netRevenue - totalSpend);
  const roi = totalSpend > 0 ? round2((profit / totalSpend) * 100) : null;

  const monthlyArr = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, spend: round2(v.spend), revenue: round2(v.revenue) }));

  return {
    website: w,
    totalSpend: round2(totalSpend),
    totalRevenue: round2(totalRevenue),
    totalRefunds: round2(totalRefunds),
    totalOtherIncome: round2(totalOtherIncome),
    netRevenue,
    profit,
    roi,
    byType,
    monthly: monthlyArr,
    txnCount: txns.length,
  };
}

async function getOverallDashboard() {
  const websites = await listWebsites();
  const results = await Promise.all(websites.map(w => getWebsiteSummary(w.id)));
  const totalSpend = results.reduce((s, r) => s + r.totalSpend, 0);
  const totalRevenue = results.reduce((s, r) => s + r.netRevenue, 0);
  const totalProfit = results.reduce((s, r) => s + r.profit, 0);
  return {
    websiteCount: websites.length,
    totalSpend: round2(totalSpend),
    totalRevenue: round2(totalRevenue),
    totalProfit: round2(totalProfit),
    overallRoi: totalSpend > 0 ? round2((totalProfit / totalSpend) * 100) : null,
    perWebsite: results.map(r => ({
      id: r.website.id,
      name: r.website.name,
      url: r.website.url,
      platform: r.website.platform,
      totalSpend: r.totalSpend,
      netRevenue: r.netRevenue,
      profit: r.profit,
      roi: r.roi,
    })),
  };
}

module.exports = {
  createWebsite, listWebsites, getWebsite, deleteWebsite,
  recordTransaction, listTransactions, deleteTransaction,
  getWebsiteSummary, getOverallDashboard,
  seedWebsiteCoa,
};
