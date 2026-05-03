/**
 * Fino · Amazon Shipments service (Phase 11)
 *
 * No new ledger entries: import cost lives in inventory via the per-order ledger
 * created by amazonCards.recordOrder(). Shipping/customs are tracked here as
 * cost-allocation overlays — they update each order's allocated_shipping_inr /
 * allocated_customs_inr, and bump the linked item's stock value accordingly.
 *
 * Dead weight = billed - actual. Per-gram cost computed two ways:
 *   cost_per_gram_billed  = shipping_cost_inr / (billed_kg * 1000)
 *   cost_per_gram_actual  = shipping_cost_inr / (actual_kg * 1000)  ← used for allocation
 */

const supabase = require('./supabase');
const { adjustStock } = require('./items');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const today  = () => new Date().toISOString().slice(0, 10);

async function getNextShipmentNumber() {
  const { data } = await supabase
    .from('fino_amazon_shipments').select('shipment_number')
    .order('created_at', { ascending: false }).limit(1);
  const last = data?.[0]?.shipment_number;
  if (!last) return 'SHIP-0001';
  const m = /SHIP-(\d+)/i.exec(last);
  if (!m) return 'SHIP-0001';
  return `SHIP-${String(parseInt(m[1], 10) + 1).padStart(4, '0')}`;
}

function _computeWeightDerivatives(s) {
  const billed = Number(s.billed_weight_kg || 0);
  const actual = Number(s.actual_weight_kg || 0);
  const cost   = Number(s.shipping_cost_inr || 0);
  const dead   = round2(billed - actual);
  const total  = round2(cost + Number(s.customs_duty_inr || 0) + Number(s.other_charges_inr || 0));
  const cpgB   = billed > 0 ? round4(cost / (billed * 1000)) : 0;
  const cpgA   = actual > 0 ? round4(cost / (actual * 1000)) : 0;
  const dwLoss = round2((billed - actual) * 1000 * cpgB);
  return { dead_weight_kg: dead, total_landed_cost_inr: total, cost_per_gram_billed: cpgB, cost_per_gram_actual: cpgA, dead_weight_loss_inr: dwLoss };
}

async function listShipments({ status = null, includeDeleted = false } = {}) {
  let q = supabase.from('fino_amazon_shipments').select('*').order('ship_date', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (status) q = q.eq('received_status', status);
  const { data, error } = await q;
  if (error) throw error;
  // Annotate with derived metrics in case DB doesn't have GENERATED columns
  return (data || []).map(s => ({ ...s, ..._computeWeightDerivatives(s) }));
}

async function getShipment(id) {
  const { data: s, error } = await supabase
    .from('fino_amazon_shipments').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!s) return null;
  const { data: orders } = await supabase
    .from('fino_amazon_us_orders')
    .select('*, item:fino_items(id, name, weight_grams)')
    .eq('shipment_id', id).eq('is_deleted', false);
  return { shipment: { ...s, ..._computeWeightDerivatives(s) }, orders: orders || [] };
}

async function createShipment(payload) {
  const {
    shipmentNumber, shipDate,
    billedWeightKg, actualWeightKg,
    shippingCostInr, customsDutyInr = 0, otherChargesInr = 0,
    companyId, notes,
  } = payload;
  if (!shipDate)              throw new Error('shipDate required');
  if (!(Number(billedWeightKg) > 0)) throw new Error('billedWeightKg must be > 0');
  if (!(Number(actualWeightKg) > 0)) throw new Error('actualWeightKg must be > 0');
  if (Number(actualWeightKg) > Number(billedWeightKg) + 0.001) {
    throw new Error('actualWeightKg cannot exceed billedWeightKg');
  }

  const number = (shipmentNumber?.trim?.()) || (await getNextShipmentNumber());
  const insert = {
    shipment_number: number,
    ship_date: shipDate,
    billed_weight_kg: round2(billedWeightKg),
    actual_weight_kg: round2(actualWeightKg),
    shipping_cost_inr: round2(shippingCostInr || 0),
    customs_duty_inr: round2(customsDutyInr),
    other_charges_inr: round2(otherChargesInr),
    received_status: 'in_transit',
    company_id: companyId || null,
    notes: notes?.trim() || null,
  };
  const { data, error } = await supabase
    .from('fino_amazon_shipments').insert(insert).select().single();
  if (error) {
    if (error.code === '23505') throw new Error(`Shipment number "${number}" already exists`);
    throw error;
  }
  return { ...data, ..._computeWeightDerivatives(data) };
}

async function linkOrderToShipment(shipmentId, orderId) {
  const { data: s } = await supabase
    .from('fino_amazon_shipments').select('id, is_deleted, received_status').eq('id', shipmentId).maybeSingle();
  if (!s)            throw new Error('Shipment not found');
  if (s.is_deleted)  throw new Error('Shipment is deleted');
  const { data: o } = await supabase
    .from('fino_amazon_us_orders').select('id, is_deleted, shipment_id').eq('id', orderId).maybeSingle();
  if (!o)            throw new Error('Order not found');
  if (o.is_deleted)  throw new Error('Order is deleted');
  if (o.shipment_id && o.shipment_id !== shipmentId) {
    throw new Error('Order already linked to a different shipment');
  }
  await supabase.from('fino_amazon_us_orders').update({
    shipment_id: shipmentId,
    order_status: 'shipped',
  }).eq('id', orderId);
  return { success: true };
}

async function allocateCosts(shipmentId) {
  const detail = await getShipment(shipmentId);
  if (!detail) throw new Error('Shipment not found');
  const { shipment, orders } = detail;

  // Use cost_per_gram_actual for allocation (only what's really shipped)
  const cpg = Number(shipment.cost_per_gram_actual || 0);
  const customsTotal = Number(shipment.customs_duty_inr || 0);
  const othersTotal  = Number(shipment.other_charges_inr || 0);

  // Sum of weights to allocate customs + other charges proportionally
  const totalWeight = orders.reduce((a, o) => a + (Number(o.item_qty || 0) * Number(o.item?.weight_grams || 0)), 0);

  const allocations = [];
  for (const o of orders) {
    const itemWeight = Number(o.item?.weight_grams || 0);
    const totalGramsForOrder = Number(o.item_qty || 0) * itemWeight;

    const allocShip   = round2(totalGramsForOrder * cpg);
    const allocCustom = totalWeight > 0 ? round2(customsTotal * (totalGramsForOrder / totalWeight)) : 0;
    const allocOther  = totalWeight > 0 ? round2(othersTotal  * (totalGramsForOrder / totalWeight)) : 0;
    const additional  = round2(allocShip + allocCustom + allocOther);

    // Diff against any prior allocation, so re-running allocate doesn't double-count
    const prevAlloc = round2(Number(o.allocated_shipping_inr || 0) + Number(o.allocated_customs_inr || 0));
    const newAlloc  = round2(allocShip + allocCustom + allocOther);
    const delta     = round2(newAlloc - prevAlloc);

    await supabase.from('fino_amazon_us_orders').update({
      allocated_shipping_inr: allocShip,
      allocated_customs_inr:  round2(allocCustom + allocOther),
      landed_cost_inr: round2(Number(o.total_inr || 0) + newAlloc),
    }).eq('id', o.id);

    if (o.linked_item_id && Math.abs(delta) > 0.001) {
      try { await adjustStock(o.linked_item_id, 0, +delta); } catch (_) {}
    }
    allocations.push({ orderId: o.id, allocShip, allocCustom, allocOther, additional });
  }
  return { allocations, shipment };
}

async function markReceived(shipmentId, { receivedDate } = {}) {
  const { data: s } = await supabase
    .from('fino_amazon_shipments').select('*').eq('id', shipmentId).maybeSingle();
  if (!s) throw new Error('Shipment not found');
  if (s.is_deleted) throw new Error('Shipment is deleted');
  if (s.received_status === 'received') throw new Error('Already received');

  await supabase.from('fino_amazon_shipments').update({
    received_status: 'received',
    received_date: receivedDate || today(),
    updated_at: new Date().toISOString(),
  }).eq('id', shipmentId);

  await supabase.from('fino_amazon_us_orders').update({
    order_status: 'received',
  }).eq('shipment_id', shipmentId).eq('is_deleted', false);

  return { success: true };
}

async function cancelShipment(id, reason = null) {
  const { data: s } = await supabase
    .from('fino_amazon_shipments').select('*').eq('id', id).maybeSingle();
  if (!s) throw new Error('Shipment not found');
  if (s.is_deleted) throw new Error('Already deleted');

  // Unlink orders, undo allocations
  const { data: orders } = await supabase
    .from('fino_amazon_us_orders').select('*').eq('shipment_id', id).eq('is_deleted', false);
  for (const o of (orders || [])) {
    const prevAlloc = round2(Number(o.allocated_shipping_inr || 0) + Number(o.allocated_customs_inr || 0));
    if (o.linked_item_id && prevAlloc > 0) {
      try { await adjustStock(o.linked_item_id, 0, -prevAlloc); } catch (_) {}
    }
    await supabase.from('fino_amazon_us_orders').update({
      shipment_id: null,
      allocated_shipping_inr: 0,
      allocated_customs_inr: 0,
      landed_cost_inr: Number(o.total_inr || 0),
      order_status: 'ordered',
    }).eq('id', o.id);
  }
  await supabase.from('fino_amazon_shipments').update({
    is_deleted: true, received_status: 'cancelled',
    updated_at: new Date().toISOString(),
    notes: reason ? `${s.notes || ''} [cancelled: ${reason}]`.trim() : s.notes,
  }).eq('id', id);
  return { success: true };
}

async function getDashboardSummary() {
  const [hawalaR, cardsR, ordersR, shipR] = await Promise.all([
    supabase.from('fino_hawala_transactions').select('inr_amount, usd_amount, status, is_deleted'),
    supabase.from('fino_amazon_us_cards').select('current_balance_usd, total_loaded, total_used, status, is_deleted'),
    supabase.from('fino_amazon_us_orders').select('total_inr, landed_cost_inr, order_status, is_deleted'),
    supabase.from('fino_amazon_shipments').select('billed_weight_kg, actual_weight_kg, shipping_cost_inr, customs_duty_inr, other_charges_inr, received_status, is_deleted'),
  ]);

  let total_hawala_inr = 0, total_hawala_usd = 0;
  for (const r of (hawalaR.data || [])) {
    if (r.is_deleted || r.status === 'cancelled') continue;
    total_hawala_inr += Number(r.inr_amount || 0);
    total_hawala_usd += Number(r.usd_amount || 0);
  }
  let cards_count = 0, total_card_balance = 0;
  for (const c of (cardsR.data || [])) {
    if (c.is_deleted) continue;
    cards_count += 1;
    total_card_balance += Number(c.current_balance_usd || 0);
  }
  let orders_count = 0, in_transit = 0, total_landed_cost = 0;
  for (const o of (ordersR.data || [])) {
    if (o.is_deleted) continue;
    orders_count += 1;
    total_landed_cost += Number(o.landed_cost_inr || o.total_inr || 0);
    if (o.order_status === 'shipped') in_transit += 1;
  }
  let shipments_count = 0, in_transit_ships = 0, dead_weight_loss = 0;
  for (const s of (shipR.data || [])) {
    if (s.is_deleted) continue;
    shipments_count += 1;
    if (s.received_status === 'in_transit') in_transit_ships += 1;
    const billed = Number(s.billed_weight_kg || 0);
    const actual = Number(s.actual_weight_kg || 0);
    const cost   = Number(s.shipping_cost_inr || 0);
    const cpgB   = billed > 0 ? cost / (billed * 1000) : 0;
    dead_weight_loss += (billed - actual) * 1000 * cpgB;
  }
  return {
    total_hawala_inr: round2(total_hawala_inr),
    total_hawala_usd: round2(total_hawala_usd),
    cards_count, total_card_balance: round2(total_card_balance),
    orders_count, orders_in_transit: in_transit,
    total_landed_cost_inr: round2(total_landed_cost),
    shipments_count, shipments_in_transit: in_transit_ships,
    dead_weight_loss_inr: round2(dead_weight_loss),
  };
}

module.exports = {
  getNextShipmentNumber,
  listShipments, getShipment, createShipment,
  linkOrderToShipment, allocateCosts, markReceived, cancelShipment,
  getDashboardSummary,
};
