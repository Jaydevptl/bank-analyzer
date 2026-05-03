/**
 * Fino · Gift Cards service (Phase 3c)
 *
 * - Purchase: 3-line ledger group when discount > 0, else 2-line
 * - Use: 2-line ledger pair (expense ↑ + platform GC COA ↓)
 * - Transfer: 2-line ledger pair (to-platform ↑ + from-platform ↓)
 * - All deletes: soft delete + cascade-reverse via Phase 3 Polish helpers
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseLedgerGroup, reverseBySource } = require('./reversal');
const { ensureChildCoa } = require('./coaHelpers');

const PARENT_GC_CODE = '1600';
const DISCOUNT_INCOME_CODE = '4240';
const DEFAULT_USAGE_EXPENSE = '5700';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

async function coaCodeById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', id).maybeSingle();
  if (error) throw error;
  return data?.code || null;
}

// If the COA id belongs to a credit card (code starts with 22), return that card row.
async function ccByLinkedCoa(coaId) {
  if (!coaId) return null;
  const { data, error } = await supabase
    .from('fino_credit_cards').select('id, current_outstanding, card_label')
    .eq('linked_account_id', coaId).eq('is_deleted', false).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function bumpCcOutstanding(ccId, delta) {
  const { data: c } = await supabase.from('fino_credit_cards')
    .select('current_outstanding').eq('id', ccId).maybeSingle();
  const newOut = round2(Number(c?.current_outstanding || 0) + Number(delta));
  await supabase.from('fino_credit_cards')
    .update({ current_outstanding: newOut, updated_at: new Date().toISOString() })
    .eq('id', ccId);
  return newOut;
}

async function platformCoaForCard(card) {
  // Resolve / lazily create the platform's COA child (e.g. 1601 Gift Cards: Amazon)
  const { data: plat, error } = await supabase
    .from('fino_gift_card_platforms').select('name').eq('id', card.platform_id).maybeSingle();
  if (error) throw error;
  if (!plat) throw new Error('Platform not found');
  return ensureChildCoa({
    parentCode: PARENT_GC_CODE,
    childName: `Gift Cards: ${plat.name}`,
    description: `Auto-created for gift card platform ${plat.name}`,
  });
}

// ─── Platforms ───────────────────────────────────────────────────────────────

async function listPlatforms({ activeOnly = true } = {}) {
  let q = supabase.from('fino_gift_card_platforms').select('*').order('name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function createPlatform({ name, displayColor }) {
  if (!name?.trim()) throw new Error('name required');
  const { data, error } = await supabase
    .from('fino_gift_card_platforms')
    .insert({ name: name.trim(), display_color: displayColor || null })
    .select().single();
  if (error) throw error;
  return data;
}

// ─── Cards ───────────────────────────────────────────────────────────────────

async function createGiftCard(payload) {
  const {
    platformId, cardLabel, cardNumberLast4,
    faceValue, paidAmount, purchaseDate,
    paidViaAccountId, expiryDate, companyId, notes,
  } = payload;

  if (!platformId)        throw new Error('platformId required');
  if (!purchaseDate)      throw new Error('purchaseDate required');
  if (!paidViaAccountId)  throw new Error('paidViaAccountId required');
  const face = Number(faceValue), paid = Number(paidAmount);
  if (!(face > 0)) throw new Error('faceValue must be > 0');
  if (!(paid > 0)) throw new Error('paidAmount must be > 0');
  if (paid > face) throw new Error('paidAmount cannot exceed faceValue');

  // Resolve / create platform COA child
  const { data: plat, error: pErr } = await supabase
    .from('fino_gift_card_platforms').select('name').eq('id', platformId).maybeSingle();
  if (pErr) throw pErr;
  if (!plat) throw new Error('Platform not found');
  const platformCoa = await ensureChildCoa({
    parentCode: PARENT_GC_CODE,
    childName: `Gift Cards: ${plat.name}`,
    description: `Auto-created for gift card platform ${plat.name}`,
  });

  // Resolve paid-via COA code
  const paidViaCode = await coaCodeById(paidViaAccountId);
  if (!paidViaCode) throw new Error('paidViaAccountId does not match any COA row');

  // Insert card
  const { data: card, error } = await supabase
    .from('fino_gift_cards')
    .insert({
      platform_id: platformId,
      card_label: cardLabel?.trim() || null,
      card_number_last4: cardNumberLast4?.trim() || null,
      face_value: face,
      paid_amount: paid,
      purchase_date: purchaseDate,
      paid_via_account_id: paidViaAccountId,
      expiry_date: expiryDate || null,
      current_balance: face,
      status: 'active',
      company_id: companyId || null,
      notes: notes?.trim() || null,
    })
    .select().single();
  if (error) throw error;

  // Build ledger lines
  const discount = round2(face - paid);
  const lines = [
    { accountCode: platformCoa.code, direction: 'debit',  amount: face },
    { accountCode: paidViaCode,      direction: 'credit', amount: paid },
  ];
  if (discount > 0.01) {
    lines.push({ accountCode: DISCOUNT_INCOME_CODE, direction: 'credit', amount: discount });
  }

  const ledger = await createLedgerEntryGroup({
    txnDate: purchaseDate,
    lines,
    description: `Gift card purchase: ${plat.name} ${cardLabel || ''}`.trim(),
    sourceModule: 'gift_card_purchase',
    sourceId: card.id,
    companyId: companyId || null,
  });

  // If paid via a credit card, bump CC outstanding + create a cc_transactions row
  // so the spend appears in the CC transaction history.
  if (paidViaCode?.startsWith('22')) {
    const ccRow = await ccByLinkedCoa(paidViaAccountId);
    if (ccRow) {
      await bumpCcOutstanding(ccRow.id, +paid);
      await supabase.from('fino_cc_transactions').insert({
        credit_card_id: ccRow.id,
        txn_date: purchaseDate,
        amount: paid,
        description: `Gift Card: ${plat.name} ${cardLabel || ''}`.trim(),
        txn_type: 'spend',
        linked_module: 'gift_card_purchase',
        linked_id: card.id,
        category: 'Gift Cards',
        ledger_txn_group_id: ledger.txn_group_id,
      });
    }
  }

  return { card, ledger };
}

async function listGiftCards({ platformId = null, status = null, companyId = null, includeDeleted = false } = {}) {
  let q = supabase
    .from('fino_gift_cards')
    .select('*, platform:fino_gift_card_platforms(name, display_color)')
    .order('purchase_date', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (platformId) q = q.eq('platform_id', platformId);
  if (status)     q = q.eq('status', status);
  if (companyId)  q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getGiftCard(id) {
  const { data: card, error } = await supabase
    .from('fino_gift_cards')
    .select('*, platform:fino_gift_card_platforms(name, display_color)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!card) return null;

  const { data: usages, error: uErr } = await supabase
    .from('fino_gift_card_usages')
    .select('*').eq('gift_card_id', id).eq('is_deleted', false)
    .order('usage_date', { ascending: false });
  if (uErr) throw uErr;

  const { data: transfersOut, error: toErr } = await supabase
    .from('fino_gift_card_transfers')
    .select('*').eq('from_card_id', id).eq('is_deleted', false);
  if (toErr) throw toErr;

  const { data: transfersIn, error: tiErr } = await supabase
    .from('fino_gift_card_transfers')
    .select('*').eq('to_card_id', id).eq('is_deleted', false);
  if (tiErr) throw tiErr;

  return { card, usages: usages || [], transfersOut: transfersOut || [], transfersIn: transfersIn || [] };
}

async function updateGiftCardMeta(id, patch) {
  const update = { updated_at: new Date().toISOString() };
  if (patch.cardLabel  !== undefined) update.card_label = patch.cardLabel?.trim() || null;
  if (patch.notes      !== undefined) update.notes = patch.notes?.trim() || null;
  if (patch.expiryDate !== undefined) update.expiry_date = patch.expiryDate || null;
  if (Object.keys(update).length === 1) throw new Error('No editable fields supplied');
  const { data, error } = await supabase
    .from('fino_gift_cards').update(update).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ─── Usage ───────────────────────────────────────────────────────────────────

async function recordUsage({ giftCardId, amountUsed, usageDate, description, expenseCategoryCode = DEFAULT_USAGE_EXPENSE, notes }) {
  const amt = Number(amountUsed);
  if (!(amt > 0)) throw new Error('amountUsed must be > 0');
  if (!usageDate) throw new Error('usageDate required');

  const { data: card, error } = await supabase
    .from('fino_gift_cards').select('*').eq('id', giftCardId).maybeSingle();
  if (error) throw error;
  if (!card) throw new Error('Gift card not found');
  if (card.is_deleted) throw new Error('Card is deleted');
  if (Number(card.current_balance) + 0.01 < amt) {
    throw new Error(`Available: ₹${Number(card.current_balance).toFixed(2)} — cannot use ${amt.toFixed(2)}`);
  }

  const platformCoa = await platformCoaForCard(card);

  const { data: usage, error: uErr } = await supabase
    .from('fino_gift_card_usages')
    .insert({
      gift_card_id: giftCardId,
      usage_date: usageDate,
      amount_used: amt,
      description: description?.trim() || null,
    })
    .select().single();
  if (uErr) throw uErr;

  const ledger = await createLedgerEntryGroup({
    txnDate: usageDate,
    lines: [
      { accountCode: expenseCategoryCode, direction: 'debit',  amount: amt },
      { accountCode: platformCoa.code,    direction: 'credit', amount: amt },
    ],
    description: description || `Gift card usage`,
    sourceModule: 'gift_card_usage',
    sourceId: usage.id,
    companyId: card.company_id,
    notes: notes || null,
  });
  await supabase.from('fino_gift_card_usages')
    .update({ ledger_txn_group_id: ledger.txn_group_id }).eq('id', usage.id);

  // Update denormalized balance + status
  const newBalance = round2(Number(card.current_balance) - amt);
  const newStatus = newBalance <= 0.01 ? 'exhausted' : 'active';
  await supabase.from('fino_gift_cards').update({
    current_balance: newBalance,
    status: newStatus,
    updated_at: new Date().toISOString(),
  }).eq('id', giftCardId);

  return { usage, newBalance, status: newStatus };
}

async function deleteUsage(usageId, reason = null) {
  const { data: usage, error } = await supabase
    .from('fino_gift_card_usages').select('*').eq('id', usageId).maybeSingle();
  if (error) throw error;
  if (!usage) throw new Error('Usage not found');
  if (usage.is_deleted) throw new Error('Already deleted');

  if (usage.ledger_txn_group_id) {
    await reverseLedgerGroup({ txnGroupId: usage.ledger_txn_group_id, reason: reason || 'Usage deleted' });
  }
  await supabase.from('fino_gift_card_usages').update({ is_deleted: true }).eq('id', usageId);

  // Restore card balance + flip status if needed
  const { data: card } = await supabase
    .from('fino_gift_cards').select('*').eq('id', usage.gift_card_id).maybeSingle();
  if (card) {
    const newBalance = round2(Number(card.current_balance) + Number(usage.amount_used));
    const newStatus = card.status === 'exhausted' ? 'active' : card.status;
    await supabase.from('fino_gift_cards').update({
      current_balance: newBalance,
      status: newStatus === 'deleted' ? 'deleted' : newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', usage.gift_card_id);
  }
  return { success: true };
}

// ─── Transfer ────────────────────────────────────────────────────────────────

async function recordTransfer({ fromCardId, toCardId, amount, transferDate, reason, notes }) {
  if (!fromCardId || !toCardId) throw new Error('fromCardId + toCardId required');
  if (fromCardId === toCardId) throw new Error('From and To cards must differ');
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('amount must be > 0');
  if (!transferDate) throw new Error('transferDate required');

  const { data: cards, error } = await supabase
    .from('fino_gift_cards').select('*').in('id', [fromCardId, toCardId]);
  if (error) throw error;
  const fromCard = cards.find(c => c.id === fromCardId);
  const toCard   = cards.find(c => c.id === toCardId);
  if (!fromCard || !toCard) throw new Error('Card(s) not found');
  if (fromCard.is_deleted || toCard.is_deleted) throw new Error('Cannot transfer to/from a deleted card');
  if (Number(fromCard.current_balance) + 0.01 < amt) {
    throw new Error(`From-card balance ₹${Number(fromCard.current_balance).toFixed(2)} insufficient`);
  }

  const fromCoa = await platformCoaForCard(fromCard);
  const toCoa   = await platformCoaForCard(toCard);

  const { data: transfer, error: tErr } = await supabase
    .from('fino_gift_card_transfers')
    .insert({
      transfer_date: transferDate,
      from_card_id: fromCardId,
      to_card_id: toCardId,
      amount: amt,
      reason: reason || null,
    })
    .select().single();
  if (tErr) throw tErr;

  // Same-platform transfer: debit + credit on SAME account → net zero on COA but still
  // a balanced ledger entry for audit. Cross-platform: two different COAs.
  // createLedgerEntryGroup forbids two distinct lines on same account in some DBs but
  // not here — it just inserts both rows; sum-check passes.
  const lines = [
    { accountCode: toCoa.code,   direction: 'debit',  amount: amt },
    { accountCode: fromCoa.code, direction: 'credit', amount: amt },
  ];
  const ledger = await createLedgerEntryGroup({
    txnDate: transferDate,
    lines,
    description: `Gift card transfer (${reason || 'manual'})`,
    sourceModule: 'gift_card_transfer',
    sourceId: transfer.id,
    notes: notes || null,
  });
  await supabase.from('fino_gift_card_transfers')
    .update({ ledger_txn_group_id: ledger.txn_group_id }).eq('id', transfer.id);

  // Update both card balances + statuses
  const fromNew = round2(Number(fromCard.current_balance) - amt);
  const toNew   = round2(Number(toCard.current_balance) + amt);
  await supabase.from('fino_gift_cards').update({
    current_balance: fromNew,
    status: fromNew <= 0.01 ? 'exhausted' : 'active',
    updated_at: new Date().toISOString(),
  }).eq('id', fromCardId);
  await supabase.from('fino_gift_cards').update({
    current_balance: toNew,
    status: toCard.status === 'exhausted' ? 'active' : toCard.status,
    updated_at: new Date().toISOString(),
  }).eq('id', toCardId);

  return { transfer, fromBalance: fromNew, toBalance: toNew };
}

async function deleteTransfer(transferId, reason = null) {
  const { data: t, error } = await supabase
    .from('fino_gift_card_transfers').select('*').eq('id', transferId).maybeSingle();
  if (error) throw error;
  if (!t) throw new Error('Transfer not found');
  if (t.is_deleted) throw new Error('Already deleted');

  if (t.ledger_txn_group_id) {
    await reverseLedgerGroup({ txnGroupId: t.ledger_txn_group_id, reason: reason || 'Transfer deleted' });
  }
  await supabase.from('fino_gift_card_transfers').update({ is_deleted: true }).eq('id', transferId);

  // Restore both card balances
  const { data: cards } = await supabase
    .from('fino_gift_cards').select('*').in('id', [t.from_card_id, t.to_card_id]);
  if (cards) {
    for (const c of cards) {
      const sign = c.id === t.from_card_id ? +1 : -1;
      const newBal = round2(Number(c.current_balance) + sign * Number(t.amount));
      await supabase.from('fino_gift_cards').update({
        current_balance: newBal,
        status: newBal <= 0.01 ? 'exhausted' : (c.status === 'exhausted' ? 'active' : c.status),
        updated_at: new Date().toISOString(),
      }).eq('id', c.id);
    }
  }
  return { success: true };
}

// ─── Card delete (cascade) ───────────────────────────────────────────────────

async function deleteGiftCard(id, reason = null) {
  const { data: card, error } = await supabase
    .from('fino_gift_cards').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!card) throw new Error('Card not found');
  if (card.is_deleted) throw new Error('Already deleted');

  // Reverse purchase (also reverses the cc_transactions row's outstanding effect if any)
  try { await reverseBySource({ sourceModule: 'gift_card_purchase', sourceId: id, reason: reason || 'Card deleted' }); } catch (_) {}

  // If purchase was via CC, undo CC outstanding bump + soft-delete the cc_transactions row
  const { data: ccTxns } = await supabase
    .from('fino_cc_transactions').select('id, credit_card_id, amount')
    .eq('linked_module', 'gift_card_purchase').eq('linked_id', id).eq('is_deleted', false);
  for (const t of (ccTxns || [])) {
    try { await bumpCcOutstanding(t.credit_card_id, -Number(t.amount)); } catch (_) {}
    await supabase.from('fino_cc_transactions').update({ is_deleted: true }).eq('id', t.id);
  }

  // Reverse linked usages + transfers
  const { data: usages } = await supabase
    .from('fino_gift_card_usages').select('id').eq('gift_card_id', id).eq('is_deleted', false);
  for (const u of (usages || [])) {
    try { await reverseBySource({ sourceModule: 'gift_card_usage', sourceId: u.id, reason: reason || 'Card deleted' }); } catch (_) {}
  }
  const { data: transfers } = await supabase
    .from('fino_gift_card_transfers').select('id, from_card_id, to_card_id, amount')
    .or(`from_card_id.eq.${id},to_card_id.eq.${id}`)
    .eq('is_deleted', false);
  for (const t of (transfers || [])) {
    try { await reverseBySource({ sourceModule: 'gift_card_transfer', sourceId: t.id, reason: reason || 'Card deleted' }); } catch (_) {}
  }

  // Mark all rows deleted
  await supabase.from('fino_gift_card_usages').update({ is_deleted: true }).eq('gift_card_id', id);
  await supabase.from('fino_gift_card_transfers').update({ is_deleted: true })
    .or(`from_card_id.eq.${id},to_card_id.eq.${id}`);

  // Restore counterparty card balances for transfers we just reversed
  for (const t of (transfers || [])) {
    const otherId = t.from_card_id === id ? t.to_card_id : t.from_card_id;
    const sign    = t.from_card_id === id ? -1 : +1; // reverse: if 'from' was this card, the OTHER card had +amt → must -amt
    const { data: other } = await supabase.from('fino_gift_cards').select('*').eq('id', otherId).maybeSingle();
    if (other) {
      const newBal = round2(Number(other.current_balance) + sign * Number(t.amount));
      await supabase.from('fino_gift_cards').update({
        current_balance: newBal,
        status: newBal <= 0.01 ? 'exhausted' : (other.status === 'exhausted' ? 'active' : other.status),
        updated_at: new Date().toISOString(),
      }).eq('id', otherId);
    }
  }

  await supabase.from('fino_gift_cards').update({
    is_deleted: true, status: 'deleted', current_balance: 0,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  return { success: true };
}

// ─── Summary ─────────────────────────────────────────────────────────────────

async function getPlatformSummary() {
  const { data: cards, error } = await supabase
    .from('fino_gift_cards')
    .select('*, platform:fino_gift_card_platforms(name, display_color)')
    .eq('is_deleted', false);
  if (error) throw error;

  const map = new Map();
  for (const c of (cards || [])) {
    const pid = c.platform_id;
    if (!map.has(pid)) map.set(pid, {
      platform_id: pid,
      platform_name: c.platform?.name || 'Unknown',
      display_color: c.platform?.display_color || '#888',
      active_cards_count: 0,
      total_face_value: 0,
      total_paid: 0,
      total_balance: 0,
      total_used: 0,
    });
    const s = map.get(pid);
    if (c.status === 'active' || c.status === 'exhausted') s.active_cards_count += 1;
    s.total_face_value += Number(c.face_value || 0);
    s.total_paid       += Number(c.paid_amount || 0);
    s.total_balance    += Number(c.current_balance || 0);
    s.total_used       += Number(c.face_value || 0) - Number(c.current_balance || 0);
  }
  return [...map.values()].map(s => ({
    ...s,
    total_face_value: round2(s.total_face_value),
    total_paid:       round2(s.total_paid),
    total_balance:    round2(s.total_balance),
    total_used:       round2(s.total_used),
  })).sort((a, b) => b.total_balance - a.total_balance);
}

module.exports = {
  listPlatforms, createPlatform,
  createGiftCard, listGiftCards, getGiftCard,
  updateGiftCardMeta, deleteGiftCard,
  recordUsage, deleteUsage,
  recordTransfer, deleteTransfer,
  getPlatformSummary,
};
