/**
 * Fino · Items service helpers (Phase 2 + Phase 4 extensions)
 *
 * Phase 4 extensions:
 *   - Opening stock ledger entry (debit Inventory 1400, credit Owner's Capital 3100)
 *   - Soft-delete with stock-zero guard
 *   - getCategorySummary
 */

const supabase = require('./supabase');
const { createLedgerEntry } = require('./ledger');
const { reverseBySource } = require('./reversal');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function listItems({ type = null, category = null, status = 'active', search = null, includeAll = false, includeDeleted = false, companyId = null } = {}) {
  let q = supabase.from('fino_items').select('*').order('name', { ascending: true });
  if (!includeAll)     q = q.eq('status', status);
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (type && type !== 'all') q = q.eq('type', type);
  if (category) q = q.eq('category', category);
  if (companyId) q = q.eq('company_id', companyId);
  if (search) q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%,hsn_sac_code.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getItem(id) {
  const { data, error } = await supabase
    .from('fino_items').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function createItem(payload) {
  if (!payload.name?.trim()) throw new Error('name required');
  if (!['product', 'service'].includes(payload.type)) throw new Error("type must be 'product' or 'service'");

  const isProduct = payload.type === 'product';
  const openQty   = isProduct ? Number(payload.openingStockQty || 0) : 0;
  const openRate  = isProduct ? Number(payload.openingStockRate || 0) : 0;
  const openValue = round2(openQty * openRate);

  const row = {
    name: payload.name.trim(),
    type: payload.type,
    category: payload.category || null,
    unit: payload.unit || null,
    hsn_sac_code: payload.hsnSacCode || null,
    sku: payload.sku || null,
    barcode: payload.barcode || null,
    default_sale_price:     payload.defaultSalePrice     ?? null,
    default_purchase_price: payload.defaultPurchasePrice ?? null,
    current_stock_qty:      openQty,
    current_stock_value:    openValue,
    opening_stock_qty:      openQty,
    opening_stock_rate:     openRate,
    opening_stock_date:     payload.openingStockDate || null,
    gst_rate:               payload.gstRate              ?? null,
    weight_grams:           payload.weightGrams          ?? null,
    notes: payload.notes || null,
    status: payload.status || 'active',
    company_id: payload.companyId || null,
  };

  const { data, error } = await supabase.from('fino_items').insert(row).select().single();
  if (error) throw error;

  if (openValue > 0) {
    await createLedgerEntry({
      txnDate: row.opening_stock_date || new Date().toISOString().slice(0, 10),
      amount: openValue,
      debitAccountCode: '1400',  // Inventory
      creditAccountCode: '3100', // Owner's Capital
      description: `Opening stock: ${row.name} (${openQty} × ${openRate})`,
      sourceModule: 'item_opening', sourceId: data.id,
      companyId: row.company_id,
    });
  }
  return data;
}

async function updateItem(id, patch) {
  const item = await getItem(id);
  if (!item) throw new Error('Item not found');

  // If any non-opening-stock txn exists, lock opening stock fields
  const { count: txnCount } = await supabase
    .from('fino_ledger_entries')
    .select('id', { count: 'exact', head: true })
    .eq('source_module', 'item_movement')
    .eq('source_id', id);
  const hasMovement = (txnCount || 0) > 0;
  if (hasMovement && (patch.openingStockQty !== undefined || patch.openingStockRate !== undefined)) {
    throw new Error('Opening stock locked: item has movements. Reverse them first.');
  }

  const update = { updated_at: new Date().toISOString() };
  const map = {
    name: 'name', category: 'category', unit: 'unit',
    hsnSacCode: 'hsn_sac_code', sku: 'sku', barcode: 'barcode',
    defaultSalePrice: 'default_sale_price',
    defaultPurchasePrice: 'default_purchase_price',
    gstRate: 'gst_rate',
    weightGrams: 'weight_grams',
    notes: 'notes', status: 'status',
    companyId: 'company_id',
  };
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) update[col] = (typeof patch[k] === 'string') ? patch[k].trim() : patch[k];
  }
  if (Object.keys(update).length === 1) throw new Error('No editable fields supplied');

  const { data, error } = await supabase
    .from('fino_items').update(update).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function adjustStock(id, deltaQty, deltaValue = 0) {
  const item = await getItem(id);
  if (!item) throw new Error('Item not found');
  return supabase
    .from('fino_items')
    .update({
      current_stock_qty:   round2(Number(item.current_stock_qty)   + Number(deltaQty)),
      current_stock_value: round2(Number(item.current_stock_value) + Number(deltaValue)),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

async function deleteItem(id, reason = null) {
  const item = await getItem(id);
  if (!item) throw new Error('Item not found');
  if (item.is_deleted) throw new Error('Already deleted');

  if (Math.abs(Number(item.current_stock_qty || 0)) > 0.001) {
    throw new Error(`Cannot delete: current stock is ${item.current_stock_qty}. Adjust to 0 first.`);
  }

  // Reverse opening stock entry if any
  try { await reverseBySource({ sourceModule: 'item_opening', sourceId: id, reason: reason || 'Item deleted' }); } catch (_) {}

  await supabase.from('fino_items')
    .update({ is_deleted: true, status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', id);
  return { success: true };
}

// Stub — Phase 5/6 will populate
async function getItemTransactions(id) {
  return [];
}

async function getCategorySummary({ includeDeleted = false } = {}) {
  let q = supabase.from('fino_items').select('category, current_stock_qty, current_stock_value, type');
  if (!includeDeleted) q = q.eq('is_deleted', false);
  const { data, error } = await q;
  if (error) throw error;
  const map = new Map();
  for (const r of (data || [])) {
    const k = r.category || 'Uncategorized';
    const cur = map.get(k) || { category: k, item_count: 0, total_stock_value: 0, products: 0, services: 0 };
    cur.item_count += 1;
    cur.total_stock_value += Number(r.current_stock_value || 0);
    if (r.type === 'product') cur.products += 1;
    else if (r.type === 'service') cur.services += 1;
    map.set(k, cur);
  }
  return [...map.values()].map(c => ({
    ...c,
    total_stock_value: round2(c.total_stock_value),
  })).sort((a, b) => b.total_stock_value - a.total_stock_value);
}

module.exports = {
  listItems, getItem, createItem, updateItem,
  adjustStock, deleteItem,
  getItemTransactions, getCategorySummary,
};
