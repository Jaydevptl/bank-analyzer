/**
 * Fino · Amazon US Cards + Orders service (Phase 11)
 *
 * Card load: no separate ledger (the upstream hawala already moved INR → 1610).
 *            Card balance only is updated.
 *
 * Order ledger: DEBIT  Inventory (1400)         total_inr
 *               CREDIT Amazon Cards USD (1610)  total_inr
 *
 * Card-to-card transfer: no ledger, just balance shuffle.
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseLedgerGroup, reverseBySource } = require('./reversal');
const { adjustStock } = require('./items');

const INVENTORY_CODE   = '1400';
const AMAZON_USD_CODE  = '1610';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today  = () => new Date().toISOString().slice(0, 10);

// ─── Cards ───────────────────────────────────────────────────────────────────

async function listCards({ includeDeleted = false } = {}) {
  let q = supabase.from('fino_amazon_us_cards').select('*').order('card_label');
  if (!includeDeleted) q = q.eq('is_deleted', false);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getCard(id) {
  const { data: card, error } = await supabase
    .from('fino_amazon_us_cards').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!card) return null;
  const { data: orders } = await supabase
    .from('fino_amazon_us_orders')
    .select('*').eq('card_id', id).eq('is_deleted', false)
    .order('order_date', { ascending: false });
  return { card, orders: orders || [] };
}

async function createCard(payload) {
  const { cardLabel, email, cardNumberLast4, expiryDate, companyId, notes } = payload;
  if (!cardLabel?.trim()) throw new Error('cardLabel required');
  const { data, error } = await supabase
    .from('fino_amazon_us_cards').insert({
      card_label: cardLabel.trim(),
      email: email?.trim() || null,
      card_number_last4: cardNumberLast4?.trim() || null,
      expiry_date: expiryDate || null,
      current_balance_usd: 0,
      total_loaded: 0,
      total_used: 0,
      status: 'active',
      company_id: companyId || null,
      notes: notes?.trim() || null,
    }).select().single();
  if (error) throw error;
  return data;
}

async function loadBalance({ cardId, amount, hawalaTransactionId = null, loadDate, notes }) {
  const usd = Number(amount);
  if (!(usd > 0)) throw new Error('amount must be > 0');
  const { data: card } = await supabase
    .from('fino_amazon_us_cards').select('*').eq('id', cardId).maybeSingle();
  if (!card)              throw new Error('Card not found');
  if (card.is_deleted)    throw new Error('Card is deleted');
  if (card.status !== 'active') throw new Error(`Card is ${card.status}`);

  const newBal = round2(Number(card.current_balance_usd) + usd);
  const newLoaded = round2(Number(card.total_loaded) + usd);
  await supabase.from('fino_amazon_us_cards').update({
    current_balance_usd: newBal, total_loaded: newLoaded,
    updated_at: new Date().toISOString(),
  }).eq('id', cardId);

  // Optional audit row
  await supabase.from('fino_amazon_us_orders').insert({
    card_id: cardId,
    order_number: null,
    order_date: loadDate || today(),
    item_name: 'CARD LOAD',
    item_qty: 0,
    item_price_usd: 0, shipping_usd: 0, tax_usd: 0,
    total_usd: 0,                  // load itself has no inventory impact
    exchange_rate_applied: 0,
    total_inr: 0,
    order_status: 'received',
    is_load: true,
    load_amount_usd: usd,
    linked_hawala_id: hawalaTransactionId || null,
    notes: notes || null,
  }).select().maybeSingle().then(() => {}).catch(() => {}); // table may not have is_load — silently skip if so

  return { card_id: cardId, newBalance: newBal };
}

async function transferBalance({ fromCardId, toCardId, amount, transferDate, notes }) {
  if (!fromCardId || !toCardId) throw new Error('fromCardId + toCardId required');
  if (fromCardId === toCardId)  throw new Error('Cards must differ');
  const usd = Number(amount);
  if (!(usd > 0)) throw new Error('amount must be > 0');

  const { data: cards } = await supabase
    .from('fino_amazon_us_cards').select('*').in('id', [fromCardId, toCardId]);
  const from = cards?.find(c => c.id === fromCardId);
  const to   = cards?.find(c => c.id === toCardId);
  if (!from || !to) throw new Error('Card(s) not found');
  if (from.is_deleted || to.is_deleted) throw new Error('Cannot transfer to/from deleted card');
  if (Number(from.current_balance_usd) + 0.001 < usd) {
    throw new Error(`From-card balance $${from.current_balance_usd} insufficient`);
  }

  const fromBal = round2(Number(from.current_balance_usd) - usd);
  const toBal   = round2(Number(to.current_balance_usd)   + usd);

  await supabase.from('fino_amazon_us_cards').update({
    current_balance_usd: fromBal, total_used: round2(Number(from.total_used) + usd),
    updated_at: new Date().toISOString(),
  }).eq('id', fromCardId);
  await supabase.from('fino_amazon_us_cards').update({
    current_balance_usd: toBal, total_loaded: round2(Number(to.total_loaded) + usd),
    updated_at: new Date().toISOString(),
  }).eq('id', toCardId);

  return { fromBalance: fromBal, toBalance: toBal };
}

async function deleteCard(id, reason = null) {
  const { data: card } = await supabase.from('fino_amazon_us_cards').select('*').eq('id', id).maybeSingle();
  if (!card) throw new Error('Card not found');
  if (card.is_deleted) throw new Error('Already deleted');

  // Reverse all order ledger groups for this card
  const { data: orders } = await supabase
    .from('fino_amazon_us_orders').select('id, ledger_txn_group_id')
    .eq('card_id', id).eq('is_deleted', false);
  for (const o of (orders || [])) {
    if (o.ledger_txn_group_id) {
      try { await reverseLedgerGroup({ txnGroupId: o.ledger_txn_group_id, reason: reason || 'Card deleted' }); } catch (_) {}
    }
  }
  try { await reverseBySource({ sourceModule: 'amazon_order', sourceId: id, reason: reason || 'Card deleted' }); } catch (_) {}
  await supabase.from('fino_amazon_us_orders').update({ is_deleted: true }).eq('card_id', id);
  await supabase.from('fino_amazon_us_cards').update({
    is_deleted: true, status: 'closed', current_balance_usd: 0,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  return { success: true };
}

// ─── Orders ──────────────────────────────────────────────────────────────────

async function listOrders({ cardId = null, status = null, shipmentId = null, includeDeleted = false } = {}) {
  let q = supabase
    .from('fino_amazon_us_orders')
    .select('*, card:fino_amazon_us_cards(card_label), item:fino_items(name, weight_grams)')
    .order('order_date', { ascending: false }).order('created_at', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (cardId)     q = q.eq('card_id', cardId);
  if (status)     q = q.eq('order_status', status);
  if (shipmentId) q = q.eq('shipment_id', shipmentId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getOrder(id) {
  const { data, error } = await supabase
    .from('fino_amazon_us_orders')
    .select('*, card:fino_amazon_us_cards(card_label), item:fino_items(id, name, weight_grams), shipment:fino_amazon_shipments(shipment_number, ship_date)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function recordOrder(payload) {
  const {
    cardId, orderNumber, orderDate,
    itemName, itemQty,
    itemPriceUsd, shippingUsd = 0, taxUsd = 0,
    exchangeRateApplied,
    linkedItemId = null,
    companyId, notes,
  } = payload;

  if (!cardId)         throw new Error('cardId required');
  if (!orderDate)      throw new Error('orderDate required');
  if (!itemName?.trim()) throw new Error('itemName required');
  const qty   = Number(itemQty);
  const price = Number(itemPriceUsd);
  const ship  = Number(shippingUsd) || 0;
  const tax   = Number(taxUsd) || 0;
  const rate  = Number(exchangeRateApplied);
  if (!(qty   > 0)) throw new Error('itemQty must be > 0');
  if (!(price >= 0)) throw new Error('itemPriceUsd must be >= 0');
  if (!(rate  > 0)) throw new Error('exchangeRateApplied must be > 0');

  const totalUsd = round2(qty * price + ship + tax);
  const totalInr = round2(totalUsd * rate);

  const { data: card } = await supabase
    .from('fino_amazon_us_cards').select('*').eq('id', cardId).maybeSingle();
  if (!card)           throw new Error('Card not found');
  if (card.is_deleted) throw new Error('Card is deleted');
  if (Number(card.current_balance_usd) + 0.001 < totalUsd) {
    throw new Error(`Card balance $${card.current_balance_usd} insufficient for order $${totalUsd}`);
  }

  const { data: order, error } = await supabase
    .from('fino_amazon_us_orders').insert({
      card_id: cardId,
      order_number: orderNumber?.trim() || null,
      order_date: orderDate,
      item_name: itemName.trim(),
      item_qty: qty,
      item_price_usd: round2(price),
      shipping_usd: round2(ship),
      tax_usd: round2(tax),
      total_usd: totalUsd,
      exchange_rate_applied: round2(rate),
      total_inr: totalInr,
      linked_item_id: linkedItemId || null,
      order_status: 'ordered',
      company_id: companyId || null,
      notes: notes?.trim() || null,
    }).select().single();
  if (error) throw error;

  // Ledger: DEBIT inventory (1400) / CREDIT Amazon USD (1610) — only if amount > 0
  let ledger = null;
  if (totalInr > 0) {
    ledger = await createLedgerEntryGroup({
      txnDate: orderDate,
      lines: [
        { accountCode: INVENTORY_CODE,  direction: 'debit',  amount: totalInr, description: `Amazon order ${orderNumber || itemName}` },
        { accountCode: AMAZON_USD_CODE, direction: 'credit', amount: totalInr, description: `Amazon order ${orderNumber || itemName}` },
      ],
      sourceModule: 'amazon_order', sourceId: order.id,
      companyId: companyId || null,
      description: `Amazon US order: ${itemName} x${qty}`,
    });
    await supabase.from('fino_amazon_us_orders')
      .update({ ledger_txn_group_id: ledger.txn_group_id }).eq('id', order.id);
  }

  // Update card balance
  await supabase.from('fino_amazon_us_cards').update({
    current_balance_usd: round2(Number(card.current_balance_usd) - totalUsd),
    total_used: round2(Number(card.total_used) + totalUsd),
    updated_at: new Date().toISOString(),
  }).eq('id', cardId);

  // Update inventory (qty + value) for linked product item
  if (linkedItemId) {
    try { await adjustStock(linkedItemId, +qty, +totalInr); } catch (_) {}
  }

  return { order, ledger };
}

async function deleteOrder(orderId, reason = null) {
  const { data: o } = await supabase
    .from('fino_amazon_us_orders').select('*').eq('id', orderId).maybeSingle();
  if (!o) throw new Error('Order not found');
  if (o.is_deleted) throw new Error('Already deleted');

  if (o.ledger_txn_group_id) {
    try { await reverseLedgerGroup({ txnGroupId: o.ledger_txn_group_id, reason: reason || 'Order deleted' }); } catch (_) {}
  }
  await supabase.from('fino_amazon_us_orders').update({ is_deleted: true }).eq('id', orderId);

  // Restore card balance
  if (Number(o.total_usd) > 0) {
    const { data: card } = await supabase.from('fino_amazon_us_cards').select('*').eq('id', o.card_id).maybeSingle();
    if (card) {
      await supabase.from('fino_amazon_us_cards').update({
        current_balance_usd: round2(Number(card.current_balance_usd) + Number(o.total_usd)),
        total_used: Math.max(0, round2(Number(card.total_used) - Number(o.total_usd))),
        updated_at: new Date().toISOString(),
      }).eq('id', o.card_id);
    }
  }
  // Restore inventory
  if (o.linked_item_id && Number(o.item_qty) > 0) {
    try { await adjustStock(o.linked_item_id, -Number(o.item_qty), -Number(o.total_inr || 0) - Number(o.allocated_shipping_inr || 0) - Number(o.allocated_customs_inr || 0)); } catch (_) {}
  }
  return { success: true };
}

module.exports = {
  // Cards
  listCards, getCard, createCard, loadBalance, transferBalance, deleteCard,
  // Orders
  listOrders, getOrder, recordOrder, deleteOrder,
};
