/**
 * Fino · Parties service helpers (Phase 2 + Phase 4 extensions)
 *
 * Extensions in Phase 4:
 *   - Opening balance ledger entry on create
 *   - Soft delete (is_deleted) with dependency checks
 *   - getPartyLedger / getPartyTransactionsSummary
 *   - ensurePartyByName (shared helper for borrower / cardholder autocreate)
 */

const supabase = require('./supabase');
const { createLedgerEntry } = require('./ledger');
const { reverseBySource } = require('./reversal');

const ROLE_FLAGS = {
  customer:           'is_customer',
  supplier:           'is_supplier',
  conversion_vendor:  'is_conversion_vendor',
  hawala_agent:       'is_hawala_agent',
  borrower:           'is_borrower',
  partner:            'is_partner',
  employee:           'is_employee',
  card_holder:        'is_card_holder',
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ─── List / get ──────────────────────────────────────────────────────────────

async function listParties({ role = null, status = 'active', search = null, includeAll = false, includeDeleted = false, companyId = null } = {}) {
  let q = supabase.from('fino_parties').select('*').order('name', { ascending: true });
  if (!includeAll)     q = q.eq('status', status);
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (companyId)       q = q.eq('company_id', companyId);
  if (role && role !== 'all') {
    const flag = ROLE_FLAGS[role];
    if (!flag) throw new Error(`Unknown role: ${role}. Valid: ${Object.keys(ROLE_FLAGS).join(', ')}`);
    q = q.eq(flag, true);
  }
  if (search) q = q.or(`name.ilike.%${search}%,contact_phone.ilike.%${search}%,contact_email.ilike.%${search}%,gstin.ilike.%${search}%,pan.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) throw error;

  // Live current_balance from ledger (asset-direction: receivable positive)
  const ids = (data || []).map(p => p.id);
  let balanceMap = new Map();
  let lastTxnMap = new Map();
  if (ids.length) {
    const { data: rows, error: lErr } = await supabase
      .from('fino_ledger_entries')
      .select('party_id, direction, amount, txn_date')
      .in('party_id', ids)
      .eq('is_reversed', false);
    if (lErr) throw lErr;
    for (const r of (rows || [])) {
      const cur = balanceMap.get(r.party_id) || 0;
      balanceMap.set(r.party_id, cur + (r.direction === 'debit' ? Number(r.amount) : -Number(r.amount)));
      const last = lastTxnMap.get(r.party_id);
      if (!last || r.txn_date > last) lastTxnMap.set(r.party_id, r.txn_date);
    }
  }

  return (data || []).map(p => ({
    ...p,
    current_balance: round2(balanceMap.get(p.id) || 0),
    last_txn_date:   lastTxnMap.get(p.id) || null,
  }));
}

async function getParty(id) {
  const { data, error } = await supabase
    .from('fino_parties').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: rows } = await supabase
    .from('fino_ledger_entries').select('direction, amount, txn_date')
    .eq('party_id', id).eq('is_reversed', false);
  let net = 0;
  let last = null;
  for (const r of (rows || [])) {
    net += r.direction === 'debit' ? Number(r.amount) : -Number(r.amount);
    if (!last || r.txn_date > last) last = r.txn_date;
  }
  return { ...data, current_balance: round2(net), last_txn_date: last };
}

// ─── Create / update / delete ────────────────────────────────────────────────

async function createParty(payload) {
  if (!payload.name?.trim()) throw new Error('name required');
  const row = {
    name: payload.name.trim(),
    contact_phone: payload.contactPhone || null,
    contact_email: payload.contactEmail || null,
    gstin: payload.gstin || null,
    pan: payload.pan || null,
    address: payload.address || null,
    is_customer:          payload.isCustomer          ?? false,
    is_supplier:          payload.isSupplier          ?? false,
    is_conversion_vendor: payload.isConversionVendor  ?? false,
    is_hawala_agent:      payload.isHawalaAgent       ?? false,
    is_borrower:          payload.isBorrower          ?? false,
    is_partner:           payload.isPartner           ?? false,
    is_employee:          payload.isEmployee          ?? false,
    is_card_holder:       payload.isCardHolder        ?? false,
    default_conversion_pct: payload.defaultConversionPct ?? null,
    default_inr_usd_rate:   payload.defaultInrUsdRate   ?? null,
    reliability_score:      payload.reliabilityScore    ?? null,
    notes: payload.notes || null,
    status: payload.status || 'active',
    opening_balance: Number(payload.openingBalance) || 0,
    opening_balance_date: payload.openingBalanceDate || null,
    company_id: payload.companyId || null,
  };
  const { data, error } = await supabase.from('fino_parties').insert(row).select().single();
  if (error) throw error;

  // Opening balance ledger entry
  const ob = Number(row.opening_balance) || 0;
  if (ob !== 0) {
    const date = row.opening_balance_date || new Date().toISOString().slice(0, 10);
    if (ob > 0) {
      // Receivable from this party
      await createLedgerEntry({
        txnDate: date, amount: ob,
        debitAccountCode: '1300', creditAccountCode: '3100',
        description: `Opening receivable: ${row.name}`,
        sourceModule: 'party_opening', sourceId: data.id,
        partyId: data.id, companyId: row.company_id,
      });
    } else {
      // Payable to this party
      await createLedgerEntry({
        txnDate: date, amount: Math.abs(ob),
        debitAccountCode: '3100', creditAccountCode: '2100',
        description: `Opening payable: ${row.name}`,
        sourceModule: 'party_opening', sourceId: data.id,
        partyId: data.id, companyId: row.company_id,
      });
    }
  }
  return data;
}

async function updateParty(id, patch) {
  const update = { updated_at: new Date().toISOString() };
  const map = {
    name: 'name', contactPhone: 'contact_phone', contactEmail: 'contact_email',
    gstin: 'gstin', pan: 'pan', address: 'address',
    isCustomer: 'is_customer', isSupplier: 'is_supplier',
    isConversionVendor: 'is_conversion_vendor', isHawalaAgent: 'is_hawala_agent',
    isBorrower: 'is_borrower', isPartner: 'is_partner', isEmployee: 'is_employee',
    isCardHolder: 'is_card_holder',
    defaultConversionPct: 'default_conversion_pct',
    defaultInrUsdRate:    'default_inr_usd_rate',
    reliabilityScore:     'reliability_score',
    notes: 'notes', status: 'status',
    companyId: 'company_id',
  };
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) update[col] = (typeof patch[k] === 'string') ? patch[k].trim() : patch[k];
  }

  // Block role-flag downgrade if active dependencies exist
  if (patch.isBorrower === false) {
    const hasActiveLoan = await _hasActiveLoan(id);
    if (hasActiveLoan) throw new Error('Cannot remove borrower role: active loans exist');
  }
  if (patch.isCardHolder === false) {
    const hasActiveCard = await _hasActiveCard(id);
    if (hasActiveCard) throw new Error('Cannot remove card-holder role: active credit cards exist');
  }

  const { data, error } = await supabase
    .from('fino_parties').update(update).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function _hasActiveLoan(partyId) {
  const { count, error } = await supabase
    .from('fino_loans_given')
    .select('id', { count: 'exact', head: true })
    .eq('borrower_party_id', partyId)
    .eq('is_deleted', false)
    .in('status', ['active', 'partially_repaid', 'defaulted']);
  if (error) throw error;
  return (count || 0) > 0;
}

async function _hasActiveCard(partyId) {
  const { count, error } = await supabase
    .from('fino_credit_cards')
    .select('id', { count: 'exact', head: true })
    .eq('card_holder_party_id', partyId)
    .eq('is_deleted', false);
  if (error) throw error;
  return (count || 0) > 0;
}

// Soft delete with dependency check
async function deleteParty(id, reason = null) {
  const party = await getParty(id);
  if (!party) throw new Error('Party not found');
  if (party.is_deleted) throw new Error('Already deleted');

  const blockers = [];
  if (await _hasActiveLoan(id))  blockers.push('active loans');
  if (await _hasActiveCard(id))  blockers.push('active credit cards');
  if (blockers.length) throw new Error(`Cannot delete: ${blockers.join(', ')}. Close those first.`);

  // Reverse opening balance ledger if any
  try { await reverseBySource({ sourceModule: 'party_opening', sourceId: id, reason: reason || 'Party deleted' }); } catch (_) {}

  await supabase.from('fino_parties')
    .update({ is_deleted: true, status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', id);
  return { success: true };
}

// ─── Per-party ledger + summary ──────────────────────────────────────────────

async function getPartyLedger(id, { from = null, to = null, limit = 200, offset = 0 } = {}) {
  let q = supabase
    .from('fino_ledger_entries')
    .select('*', { count: 'exact' })
    .eq('party_id', id)
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (from) q = q.gte('txn_date', from);
  if (to)   q = q.lte('txn_date', to);
  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw error;

  // Running balance (asc to compute, then keep as desc for UI)
  const asc = [...(data || [])].reverse();
  let running = 0;
  for (const r of asc) {
    running += r.direction === 'debit' ? Number(r.amount) : -Number(r.amount);
    r.running_balance = round2(running);
  }
  return { entries: asc.reverse(), total: count || 0, limit, offset };
}

async function getPartyTransactionsSummary(id) {
  const out = {
    loans_disbursed: 0, loans_repaid: 0, loans_outstanding: 0, loans_count: 0,
    cards_count: 0,
    other_received: 0, other_paid: 0,
  };

  const { data: loans } = await supabase
    .from('fino_loans_given').select('principal_amount, total_repaid, outstanding_principal')
    .eq('borrower_party_id', id).eq('is_deleted', false);
  for (const l of (loans || [])) {
    out.loans_count += 1;
    out.loans_disbursed += Number(l.principal_amount || 0);
    out.loans_repaid    += Number(l.total_repaid || 0);
    out.loans_outstanding += Number(l.outstanding_principal || 0);
  }

  const { count: ccCount } = await supabase
    .from('fino_credit_cards').select('id', { count: 'exact', head: true })
    .eq('card_holder_party_id', id).eq('is_deleted', false);
  out.cards_count = ccCount || 0;

  // Other receipts/payments via ledger (excluding loans/cards already counted)
  const { data: rows } = await supabase
    .from('fino_ledger_entries')
    .select('source_module, direction, amount')
    .eq('party_id', id).eq('is_reversed', false);
  for (const r of (rows || [])) {
    if (r.source_module && /^(loan_|cc_)/.test(r.source_module)) continue;
    if (r.direction === 'debit') out.other_received += Number(r.amount);
    else out.other_paid += Number(r.amount);
  }

  for (const k of Object.keys(out)) if (typeof out[k] === 'number') out[k] = round2(out[k]);
  return out;
}

// ─── Shared helper for module-driven autocreate ──────────────────────────────

async function ensurePartyByName(name, defaultRoleFlags = {}) {
  if (!name?.trim()) throw new Error('name required');
  const cleanName = name.trim();

  // Case-insensitive name match within active+non-deleted parties
  const { data: existing, error } = await supabase
    .from('fino_parties').select('*')
    .ilike('name', cleanName).eq('is_deleted', false).limit(1).maybeSingle();
  if (error) throw error;

  if (existing) {
    // Merge any role flags that aren't already set
    const update = {};
    for (const [field, want] of Object.entries(defaultRoleFlags)) {
      if (want && !existing[field]) update[field] = true;
    }
    if (Object.keys(update).length) {
      update.updated_at = new Date().toISOString();
      const { data: upd, error: uErr } = await supabase
        .from('fino_parties').update(update).eq('id', existing.id).select().single();
      if (uErr) throw uErr;
      return upd;
    }
    return existing;
  }

  // Create
  const row = {
    name: cleanName, status: 'active',
    is_customer: false, is_supplier: false, is_conversion_vendor: false,
    is_hawala_agent: false, is_borrower: false, is_partner: false,
    is_employee: false, is_card_holder: false,
    ...defaultRoleFlags,
  };
  const { data, error: cErr } = await supabase.from('fino_parties').insert(row).select().single();
  if (cErr) throw cErr;
  return data;
}

module.exports = {
  listParties, getParty, createParty, updateParty, deleteParty,
  getPartyLedger, getPartyTransactionsSummary,
  ensurePartyByName,
  ROLE_FLAGS,
};
