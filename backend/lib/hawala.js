/**
 * Fino · Hawala Transactions service (Phase 11)
 *
 * Ledger flow:
 *   Initiation: DEBIT  Amazon Cards (USD) (1610)   inr_amount
 *               CREDIT Bank (12XX)                  inr_amount
 *
 * Tracks two-stage delivery: INR paid → USD received.
 * Cancel reverses ledger + restores bank.
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseLedgerGroup, reverseBySource } = require('./reversal');
const { ensurePartyByName } = require('./parties');
const { refreshCurrentBalance } = require('./bankAccounts');

const AMAZON_USD_CODE = '1610';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today  = () => new Date().toISOString().slice(0, 10);

async function bankCoaCode(bankAccountId) {
  const { data } = await supabase
    .from('fino_bank_accounts').select('linked_account_id').eq('id', bankAccountId).maybeSingle();
  if (!data) return null;
  const { data: c } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', data.linked_account_id).maybeSingle();
  return c?.code || null;
}

async function getNextHawalaNumber() {
  const { data } = await supabase
    .from('fino_hawala_transactions').select('txn_number')
    .order('created_at', { ascending: false }).limit(1);
  const last = data?.[0]?.txn_number;
  if (!last) return 'HAW-0001';
  const m = /HAW-(\d+)/i.exec(last);
  if (!m) return 'HAW-0001';
  return `HAW-${String(parseInt(m[1], 10) + 1).padStart(4, '0')}`;
}

async function listHawalaTransactions({ agentId = null, status = null, includeDeleted = false } = {}) {
  let q = supabase
    .from('fino_hawala_transactions')
    .select('*, agent:fino_parties(id, name, reliability_score), bank:fino_bank_accounts(id, account_name, bank_name)')
    .order('txn_date', { ascending: false }).order('created_at', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (agentId) q = q.eq('agent_party_id', agentId);
  if (status)  q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getHawalaTransaction(id) {
  const { data, error } = await supabase
    .from('fino_hawala_transactions')
    .select('*, agent:fino_parties(id, name, reliability_score), bank:fino_bank_accounts(id, account_name, bank_name)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function createHawalaTransaction(payload) {
  let {
    txnNumber, txnDate,
    agentPartyId, agentName,
    inrAmount, usdAmount, exchangeRate,
    agentCommission = 0,
    paidViaBankId,
    receivedAs = 'amazon_gc',
    companyId, notes,
  } = payload;

  if (!txnDate)        throw new Error('txnDate required');
  if (!paidViaBankId)  throw new Error('paidViaBankId required');
  const inr = Number(inrAmount), usd = Number(usdAmount), rate = Number(exchangeRate);
  if (!(inr > 0)) throw new Error('inrAmount must be > 0');
  if (!(usd > 0)) throw new Error('usdAmount must be > 0');
  if (!(rate > 0)) throw new Error('exchangeRate must be > 0');

  if (!agentPartyId && agentName) {
    const party = await ensurePartyByName(agentName, { is_hawala_agent: true });
    agentPartyId = party.id;
  }
  if (!agentPartyId) throw new Error('agentPartyId or agentName required');

  // Confirm party + auto-set is_hawala_agent
  const { data: party, error: pErr } = await supabase
    .from('fino_parties').select('id, is_hawala_agent, is_deleted').eq('id', agentPartyId).maybeSingle();
  if (pErr) throw pErr;
  if (!party || party.is_deleted) throw new Error('Agent not found');
  if (!party.is_hawala_agent) {
    await supabase.from('fino_parties').update({ is_hawala_agent: true, updated_at: new Date().toISOString() }).eq('id', agentPartyId);
  }

  const bankCode = await bankCoaCode(paidViaBankId);
  if (!bankCode) throw new Error('Bank COA not resolvable');

  const number = (txnNumber?.trim?.()) || (await getNextHawalaNumber());

  const { data: txn, error } = await supabase
    .from('fino_hawala_transactions').insert({
      txn_number: number,
      txn_date: txnDate,
      agent_party_id: agentPartyId,
      inr_amount: round2(inr),
      usd_amount: round2(usd),
      exchange_rate: round2(rate),
      agent_commission: round2(agentCommission),
      paid_via_bank_id: paidViaBankId,
      received_as: receivedAs,
      inr_paid_status: 'pending',
      usd_received_status: 'pending',
      status: 'initiated',
      company_id: companyId || null,
      notes: notes?.trim?.() || null,
    }).select().single();
  if (error) {
    if (error.code === '23505') throw new Error(`Hawala number "${number}" already exists`);
    throw error;
  }

  // Ledger: DEBIT 1610 / CREDIT bank
  const ledger = await createLedgerEntryGroup({
    txnDate,
    lines: [
      { accountCode: AMAZON_USD_CODE, direction: 'debit',  amount: round2(inr), description: `Hawala ${number} ($${usd})` },
      { accountCode: bankCode,         direction: 'credit', amount: round2(inr), description: `Hawala ${number} ($${usd})` },
    ],
    sourceModule: 'hawala_transaction', sourceId: txn.id,
    partyId: agentPartyId, companyId: companyId || null,
    description: `Hawala ${number}: ₹${inr} → $${usd} @ ₹${rate}`,
  });
  await supabase.from('fino_hawala_transactions').update({
    ledger_txn_group_id: ledger.txn_group_id, updated_at: new Date().toISOString(),
  }).eq('id', txn.id);
  try { await refreshCurrentBalance(paidViaBankId); } catch (_) {}

  const { data: fresh } = await supabase.from('fino_hawala_transactions').select('*').eq('id', txn.id).maybeSingle();
  return { txn: fresh || txn, ledger };
}

async function markInrPaid(id, { paidDate } = {}) {
  const { data: t, error } = await supabase
    .from('fino_hawala_transactions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!t) throw new Error('Hawala not found');
  if (t.is_deleted || t.status === 'cancelled') throw new Error(`Cannot mark a ${t.status} hawala`);
  if (t.inr_paid_status === 'paid') throw new Error('INR already marked paid');

  const update = {
    inr_paid_status: 'paid',
    inr_paid_date: paidDate || today(),
    status: t.usd_received_status === 'received' ? 'completed' : 'inr_paid',
    updated_at: new Date().toISOString(),
  };
  const { data, error: uErr } = await supabase
    .from('fino_hawala_transactions').update(update).eq('id', id).select().single();
  if (uErr) throw uErr;
  return data;
}

async function markUsdReceived(id, { receivedDate, agentReliabilityScore } = {}) {
  const { data: t, error } = await supabase
    .from('fino_hawala_transactions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!t) throw new Error('Hawala not found');
  if (t.is_deleted || t.status === 'cancelled') throw new Error(`Cannot mark a ${t.status} hawala`);
  if (t.usd_received_status === 'received') throw new Error('USD already marked received');

  const update = {
    usd_received_status: 'received',
    usd_received_date: receivedDate || today(),
    status: t.inr_paid_status === 'paid' ? 'completed' : 'usd_received',
    updated_at: new Date().toISOString(),
  };
  if (agentReliabilityScore != null) {
    const score = Number(agentReliabilityScore);
    if (score >= 1 && score <= 5) {
      update.agent_reliability_score = score;
      // Also update the agent party's score
      try { await supabase.from('fino_parties').update({ reliability_score: score, updated_at: new Date().toISOString() }).eq('id', t.agent_party_id); } catch (_) {}
    }
  }
  const { data, error: uErr } = await supabase
    .from('fino_hawala_transactions').update(update).eq('id', id).select().single();
  if (uErr) throw uErr;
  return data;
}

async function cancelHawala(id, reason = null) {
  const { data: t, error } = await supabase
    .from('fino_hawala_transactions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!t) throw new Error('Hawala not found');
  if (t.is_deleted || t.status === 'cancelled') throw new Error('Already cancelled');

  if (t.ledger_txn_group_id) {
    try { await reverseLedgerGroup({ txnGroupId: t.ledger_txn_group_id, reason: reason || 'Hawala cancelled' }); } catch (_) {}
  }
  try { await reverseBySource({ sourceModule: 'hawala_transaction', sourceId: id, reason: reason || 'Hawala cancelled' }); } catch (_) {}

  await supabase.from('fino_hawala_transactions').update({
    status: 'cancelled', is_deleted: true,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (t.paid_via_bank_id) try { await refreshCurrentBalance(t.paid_via_bank_id); } catch (_) {}
  return { success: true };
}

async function getHawalaSummary() {
  const { data } = await supabase
    .from('fino_hawala_transactions').select('inr_amount, usd_amount, status, is_deleted');
  let total_inr = 0, total_usd = 0, count = 0;
  let pending = 0, completed = 0;
  for (const r of (data || [])) {
    if (r.is_deleted || r.status === 'cancelled') continue;
    count += 1;
    total_inr += Number(r.inr_amount || 0);
    total_usd += Number(r.usd_amount || 0);
    if (r.status === 'completed') completed += 1;
    else pending += 1;
  }
  return {
    count, total_inr: round2(total_inr), total_usd: round2(total_usd),
    pending, completed,
  };
}

module.exports = {
  getNextHawalaNumber,
  listHawalaTransactions, getHawalaTransaction,
  createHawalaTransaction, markInrPaid, markUsdReceived, cancelHawala,
  getHawalaSummary,
};
