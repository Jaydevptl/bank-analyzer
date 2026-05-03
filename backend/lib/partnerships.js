/**
 * Fino · Partnerships + Profit Sharing service (Phase 13)
 *
 * Concepts:
 *   - Partnership: a profit-sharing arrangement between members.
 *   - Member: a fino_party (auto-tagged is_partner=true) with a share spec
 *     (percentage or fixed amount) and capital contributed.
 *   - Distribution: a snapshot for a period with gross profit + total expenses.
 *     net_distributable = gross - (deduct_expenses ? expenses : 0)
 *   - Distribution lines: per-member computed_amount + paid_via.
 *
 * Loss handling: if net_distributable < 0, only PERCENTAGE members share the
 * loss proportionally (by their percentage share). Fixed members get 0 (no payout)
 * but do not absorb any loss in this v1.
 *
 * Ledger flow on markDistributionPaid:
 *   For each line with computed_amount > 0:
 *     DEBIT  3400 Partner Drawings  / CREDIT bank
 *
 * COA used (exact codes):
 *   3400 Partner Drawings (auto-seeded if absent)
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseBySource } = require('./reversal');
const { ensurePartyByName } = require('./parties');

const PARTNER_DRAWINGS_CODE = '3400';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today  = () => new Date().toISOString().slice(0, 10);

async function ensureExactCoa({ code, name, type, subType }) {
  const { data: existing, error } = await supabase
    .from('fino_chart_of_accounts').select('id, code, name').eq('code', code).maybeSingle();
  if (error) throw error;
  if (existing) return existing;
  const { data, error: insErr } = await supabase
    .from('fino_chart_of_accounts').insert({
      code, name, type, sub_type: subType,
      is_system: true, is_active: true,
      description: 'Auto-seeded for Partnerships (Phase 13)',
    }).select('id, code, name').single();
  if (insErr) throw insErr;
  return data;
}

async function seedPartnershipCoa() {
  await ensureExactCoa({ code: PARTNER_DRAWINGS_CODE, name: 'Partner Drawings', type: 'equity', subType: 'equity' });
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

// ─── Partnerships ────────────────────────────────────────────────────────────

async function createPartnership({ name, companyId, distributionPeriod = 'monthly', deductExpenses = true, notes }) {
  if (!name?.trim()) throw new Error('name required');
  if (!['monthly','quarterly','yearly','per_txn'].includes(distributionPeriod)) {
    throw new Error('Invalid distributionPeriod');
  }
  await seedPartnershipCoa();
  const { data, error } = await supabase
    .from('fino_partnerships').insert({
      name: name.trim(),
      company_id: companyId || null,
      distribution_period: distributionPeriod,
      deduct_expenses: deductExpenses,
      notes: notes?.trim() || null,
      is_active: true,
    }).select().single();
  if (error) throw error;
  return data;
}

async function listPartnerships({ companyId = null, includeDeleted = false } = {}) {
  let q = supabase.from('fino_partnerships').select('*').order('name');
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (companyId)       q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getPartnership(id) {
  const { data, error } = await supabase
    .from('fino_partnerships').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function deletePartnership(id, reason = null) {
  const p = await getPartnership(id);
  if (!p) throw new Error('Partnership not found');
  if (p.is_deleted) throw new Error('Already deleted');

  // Reverse all distributions
  const { data: dists } = await supabase
    .from('fino_profit_distributions').select('id').eq('partnership_id', id).eq('is_deleted', false);
  for (const d of (dists || [])) {
    try { await reverseBySource({ sourceModule: 'partnership_distribution', sourceId: d.id, reason: reason || 'Partnership deleted' }); } catch (_) {}
  }
  await supabase.from('fino_profit_distributions').update({ is_deleted: true, status: 'cancelled' }).eq('partnership_id', id);
  await supabase.from('fino_partnership_members').update({ is_deleted: true, is_active: false }).eq('partnership_id', id);
  await supabase
    .from('fino_partnerships')
    .update({ is_deleted: true, is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { success: true };
}

// ─── Members ─────────────────────────────────────────────────────────────────

async function listMembers(partnershipId) {
  const { data, error } = await supabase
    .from('fino_partnership_members')
    .select('*, party:party_id(id, name)')
    .eq('partnership_id', partnershipId)
    .eq('is_deleted', false)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

async function addMember({
  partnershipId, partyId, partyName,
  role = 'capital', shareType, shareValue,
  capitalContributed = 0, notes,
}) {
  if (!partnershipId) throw new Error('partnershipId required');
  if (!['capital','working','both'].includes(role)) throw new Error('Invalid role');
  if (!['percentage','fixed'].includes(shareType))  throw new Error('Invalid shareType');
  const sv = Number(shareValue);
  if (!(sv > 0)) throw new Error('shareValue must be > 0');
  if (shareType === 'percentage' && sv > 100) throw new Error('percentage cannot exceed 100');

  // Resolve partyId; auto-tag is_partner
  if (!partyId && partyName) {
    const p = await ensurePartyByName(partyName, { is_partner: true });
    partyId = p.id;
  }
  if (!partyId) throw new Error('partyId or partyName required');
  // Ensure party has is_partner flag
  await supabase.from('fino_parties').update({ is_partner: true, updated_at: new Date().toISOString() }).eq('id', partyId).eq('is_partner', false);

  // Validate sum of percentage shares ≤ 100 (excluding any soft-deleted)
  if (shareType === 'percentage') {
    const existing = await listMembers(partnershipId);
    const sum = existing.filter(m => m.share_type === 'percentage' && m.is_active)
      .reduce((s, m) => s + Number(m.share_value || 0), 0);
    if (sum + sv > 100.01) throw new Error(`Total percentage shares would exceed 100 (current ${sum}, adding ${sv})`);
  }

  const { data, error } = await supabase
    .from('fino_partnership_members').insert({
      partnership_id: partnershipId,
      party_id: partyId,
      role,
      share_type: shareType,
      share_value: sv,
      capital_contributed: Number(capitalContributed) || 0,
      total_distributed: 0,
      is_active: true,
      notes: notes?.trim() || null,
    }).select().single();
  if (error) throw error;
  return data;
}

async function removeMember(memberId, reason = null) {
  await supabase.from('fino_partnership_members')
    .update({ is_deleted: true, is_active: false, notes: reason || null })
    .eq('id', memberId);
  return { success: true };
}

// ─── Distributions ───────────────────────────────────────────────────────────

function _computeLines(members, netDistributable) {
  // Returns lines: [{ memberId, partyId, shareType, shareValue, computedAmount }]
  const active = members.filter(m => m.is_active);
  const lines = [];
  if (netDistributable >= 0) {
    // First pay fixed members up to net_distributable
    let remaining = netDistributable;
    const fixed = active.filter(m => m.share_type === 'fixed');
    const pct   = active.filter(m => m.share_type === 'percentage');
    for (const m of fixed) {
      const amt = Math.min(Number(m.share_value) || 0, Math.max(0, remaining));
      remaining -= amt;
      lines.push({ memberId: m.id, partyId: m.party_id, shareType: 'fixed', shareValue: m.share_value, computedAmount: round2(amt) });
    }
    // Distribute remaining to percentage members in their declared ratio
    const pctSum = pct.reduce((s, m) => s + Number(m.share_value || 0), 0) || 1;
    for (const m of pct) {
      const amt = remaining * (Number(m.share_value) || 0) / pctSum;
      lines.push({ memberId: m.id, partyId: m.party_id, shareType: 'percentage', shareValue: m.share_value, computedAmount: round2(amt) });
    }
  } else {
    // Loss: only percentage members share, proportional to their share
    const pct = active.filter(m => m.share_type === 'percentage');
    const pctSum = pct.reduce((s, m) => s + Number(m.share_value || 0), 0) || 1;
    for (const m of active) {
      if (m.share_type === 'fixed') {
        lines.push({ memberId: m.id, partyId: m.party_id, shareType: 'fixed', shareValue: m.share_value, computedAmount: 0 });
      } else {
        const amt = netDistributable * (Number(m.share_value) || 0) / pctSum;
        lines.push({ memberId: m.id, partyId: m.party_id, shareType: 'percentage', shareValue: m.share_value, computedAmount: round2(amt) });
      }
    }
  }
  return lines;
}

async function createDistribution({
  partnershipId, periodLabel, periodFrom, periodTo,
  grossProfit, totalExpenses = 0, notes,
}) {
  if (!partnershipId) throw new Error('partnershipId required');
  if (!periodLabel?.trim()) throw new Error('periodLabel required');
  if (!periodFrom) throw new Error('periodFrom required');
  if (!periodTo)   throw new Error('periodTo required');
  if (periodTo < periodFrom) throw new Error('periodTo must be on/after periodFrom');
  const gp = Number(grossProfit);
  if (Number.isNaN(gp)) throw new Error('grossProfit required (number)');
  const exp = Number(totalExpenses) || 0;

  const p = await getPartnership(partnershipId);
  if (!p) throw new Error('Partnership not found');
  const members = await listMembers(partnershipId);
  if (members.length === 0) throw new Error('Add at least one member first');

  const net = round2(gp - (p.deduct_expenses ? exp : 0));
  const computedLines = _computeLines(members, net);

  // Insert distribution
  const { data: dist, error } = await supabase
    .from('fino_profit_distributions').insert({
      partnership_id: partnershipId,
      period_label: periodLabel.trim(),
      period_from: periodFrom,
      period_to:   periodTo,
      gross_profit: gp,
      total_expenses: exp,
      net_distributable: net,
      status: 'draft',
      notes: notes?.trim() || null,
    }).select().single();
  if (error) throw error;

  // Insert lines
  const lineRows = computedLines.map(l => ({
    distribution_id: dist.id,
    member_id:  l.memberId,
    party_id:   l.partyId,
    share_type: l.shareType,
    share_value: l.shareValue,
    computed_amount: l.computedAmount,
    is_paid: false,
  }));
  if (lineRows.length) {
    const { error: lErr } = await supabase.from('fino_distribution_lines').insert(lineRows);
    if (lErr) throw lErr;
  }

  return { distribution: dist, lines: lineRows };
}

async function listDistributions(partnershipId) {
  let q = supabase
    .from('fino_profit_distributions')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  if (partnershipId) q = q.eq('partnership_id', partnershipId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getDistribution(id) {
  const { data: dist, error } = await supabase
    .from('fino_profit_distributions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!dist) return null;
  const { data: lines, error: lErr } = await supabase
    .from('fino_distribution_lines')
    .select('*, party:party_id(id, name)')
    .eq('distribution_id', id);
  if (lErr) throw lErr;
  return { distribution: dist, lines: lines || [] };
}

async function markDistributionPaid(distributionId, { defaultBankAccountId = null } = {}) {
  const detail = await getDistribution(distributionId);
  if (!detail) throw new Error('Distribution not found');
  const { distribution: dist, lines } = detail;
  if (dist.status === 'distributed') throw new Error('Already distributed');
  if (dist.status === 'cancelled')   throw new Error('Cancelled distribution cannot be paid');
  if (dist.is_deleted)               throw new Error('Distribution deleted');

  await seedPartnershipCoa();

  // Build a single ledger group covering all positive payouts.
  // Each line: DEBIT 3400 Partner Drawings / CREDIT bank.
  // Lines with computed_amount <= 0 are skipped (loss-share members get no payout).
  const ledgerLines = [];
  let total = 0;
  const updates = [];

  for (const l of lines) {
    const amt = Number(l.computed_amount) || 0;
    if (amt <= 0) continue;
    const accountId = l.paid_via_account_id || defaultBankAccountId;
    if (!accountId) throw new Error(`Line for ${l.party?.name || l.party_id}: no paid_via_account_id and no defaultBankAccountId`);
    const code = await _accountCoaCode(accountId);
    if (!code) throw new Error(`Could not resolve COA for account ${accountId}`);
    ledgerLines.push({ accountCode: PARTNER_DRAWINGS_CODE, direction: 'debit',  amount: amt, partyId: l.party_id });
    ledgerLines.push({ accountCode: code,                  direction: 'credit', amount: amt });
    total += amt;
    updates.push({ id: l.id, paid_via_account_id: accountId, amount: amt });
  }

  if (ledgerLines.length === 0) throw new Error('Nothing to pay (all lines zero or negative)');

  const ledger = await createLedgerEntryGroup({
    txnDate: today(),
    lines: ledgerLines,
    description: `Partnership distribution · ${dist.period_label}`,
    sourceModule: 'partnership_distribution',
    sourceId: dist.id,
  });

  // Update lines with paid_via + is_paid and the distribution status
  const nowIso = new Date().toISOString();
  for (const u of updates) {
    await supabase.from('fino_distribution_lines').update({
      paid_via_account_id: u.paid_via_account_id,
      is_paid: true,
      paid_at: nowIso,
    }).eq('id', u.id);
  }
  await supabase.from('fino_profit_distributions').update({
    status: 'distributed',
    ledger_txn_group_id: ledger.txn_group_id,
  }).eq('id', dist.id);

  // Bump member.total_distributed
  for (const u of updates) {
    const { data: m } = await supabase
      .from('fino_partnership_members').select('total_distributed').eq('id', detail.lines.find(l => l.id === u.id).member_id).maybeSingle();
    const newTotal = (Number(m?.total_distributed) || 0) + u.amount;
    await supabase.from('fino_partnership_members').update({ total_distributed: round2(newTotal) }).eq('id', detail.lines.find(l => l.id === u.id).member_id);
  }

  // Refresh bank balances
  const uniqueAccounts = [...new Set(updates.map(u => u.paid_via_account_id))];
  for (const aid of uniqueAccounts) {
    try {
      const { refreshCurrentBalance } = require('./bankAccounts');
      const { data: ba } = await supabase.from('fino_bank_accounts').select('id').eq('id', aid).maybeSingle();
      if (ba?.id) await refreshCurrentBalance(ba.id);
    } catch (_) {}
  }

  return { success: true, ledger, totalPaid: round2(total) };
}

async function cancelDistribution(distributionId, reason = null) {
  const detail = await getDistribution(distributionId);
  if (!detail) throw new Error('Distribution not found');
  const { distribution: dist, lines } = detail;
  if (dist.is_deleted) throw new Error('Already deleted');

  if (dist.ledger_txn_group_id) {
    try { await reverseBySource({ sourceModule: 'partnership_distribution', sourceId: dist.id, reason: reason || 'Distribution cancelled' }); } catch (_) {}

    // Roll back member.total_distributed
    for (const l of lines) {
      const amt = Number(l.computed_amount) || 0;
      if (amt > 0 && l.is_paid) {
        const { data: m } = await supabase
          .from('fino_partnership_members').select('total_distributed').eq('id', l.member_id).maybeSingle();
        const newTotal = Math.max(0, (Number(m?.total_distributed) || 0) - amt);
        await supabase.from('fino_partnership_members').update({ total_distributed: round2(newTotal) }).eq('id', l.member_id);
      }
    }
  }
  await supabase.from('fino_profit_distributions').update({
    status: 'cancelled', is_deleted: true,
  }).eq('id', dist.id);

  // Refresh affected bank balances
  const uniqueAccounts = [...new Set(lines.filter(l => l.is_paid && l.paid_via_account_id).map(l => l.paid_via_account_id))];
  for (const aid of uniqueAccounts) {
    try {
      const { refreshCurrentBalance } = require('./bankAccounts');
      const { data: ba } = await supabase.from('fino_bank_accounts').select('id').eq('id', aid).maybeSingle();
      if (ba?.id) await refreshCurrentBalance(ba.id);
    } catch (_) {}
  }
  return { success: true };
}

async function getPartnershipDetail(id) {
  const partnership = await getPartnership(id);
  if (!partnership) return null;
  const members = await listMembers(id);
  const distributions = await listDistributions(id);
  const totalCapital = members.reduce((s, m) => s + Number(m.capital_contributed || 0), 0);
  const totalDistributed = members.reduce((s, m) => s + Number(m.total_distributed || 0), 0);
  return {
    partnership,
    members,
    distributions,
    totalCapital: round2(totalCapital),
    totalDistributed: round2(totalDistributed),
  };
}

async function getPartnerDashboard() {
  const partnerships = await listPartnerships();
  let totalCapital = 0, totalDistributed = 0, pending = 0;
  for (const p of partnerships) {
    const d = await getPartnershipDetail(p.id);
    totalCapital += d.totalCapital;
    totalDistributed += d.totalDistributed;
    pending += d.distributions.filter(x => x.status === 'draft').length;
  }
  return {
    partnershipCount: partnerships.length,
    totalCapital: round2(totalCapital),
    totalDistributed: round2(totalDistributed),
    pendingDistributions: pending,
    partnerships,
  };
}

module.exports = {
  createPartnership, listPartnerships, getPartnership, deletePartnership,
  addMember, listMembers, removeMember,
  createDistribution, listDistributions, getDistribution,
  markDistributionPaid, cancelDistribution,
  getPartnershipDetail, getPartnerDashboard,
  seedPartnershipCoa,
  _computeLines,
};
