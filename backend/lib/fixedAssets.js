/**
 * Fino · Fixed Assets service (Phase 3a)
 */

const supabase = require('./supabase');
const { createLedgerEntry } = require('./ledger');

// COA helper: id → code
async function coaCodeById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('fino_chart_of_accounts')
    .select('code')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data?.code || null;
}

async function listFixedAssets({ status = 'active', companyId = null, includeAll = false, includeDeleted = false } = {}) {
  let q = supabase.from('fino_fixed_assets').select('*').order('purchase_date', { ascending: false, nullsFirst: false });
  if (!includeAll) q = q.eq('status', status);
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (companyId)   q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getFixedAsset(id) {
  const { data, error } = await supabase
    .from('fino_fixed_assets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createFixedAsset(payload) {
  const {
    assetName, category, purchaseDate, purchasePrice = 0,
    quantity = 1, vendorPartyId, paymentStatus = 'unpaid', paidViaAccountId,
    depreciationMethod, depreciationRate, usefulLifeYears, companyId, notes,
  } = payload;

  if (!assetName?.trim()) throw new Error('assetName required');
  const price = Number(purchasePrice) || 0;

  const { data: asset, error } = await supabase
    .from('fino_fixed_assets')
    .insert({
      asset_name: assetName.trim(),
      category: category || null,
      purchase_date: purchaseDate || null,
      purchase_price: price,
      current_value: price,
      quantity, vendor_party_id: vendorPartyId || null,
      payment_status: paymentStatus,
      paid_via_account_id: paidViaAccountId || null,
      depreciation_method: depreciationMethod || null,
      depreciation_rate: depreciationRate ?? null,
      useful_life_years: usefulLifeYears ?? null,
      company_id: companyId || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;

  // Ledger entry: Fixed Assets (1950) ↑ + (paid_via OR Accounts Payable 2100) ↓/↑
  let purchaseTxn = null;
  if (price > 0) {
    let creditCode;
    if (paymentStatus === 'paid') {
      creditCode = await coaCodeById(paidViaAccountId);
      if (!creditCode) throw new Error('paidViaAccountId required when paymentStatus=paid');
    } else {
      creditCode = '2100'; // Accounts Payable
    }
    purchaseTxn = await createLedgerEntry({
      txnDate: purchaseDate || new Date().toISOString().slice(0, 10),
      amount: price,
      debitAccountCode:  '1950',     // Fixed Assets ↑
      creditAccountCode: creditCode, // payment source ↓ (or AP ↑)
      description: `Asset purchase: ${assetName.trim()}`,
      sourceModule: 'fixed_asset',
      sourceId: asset.id,
      partyId: vendorPartyId || null,
      companyId: companyId || null,
    });
  }

  return { asset, purchase_txn: purchaseTxn };
}

async function depreciateAsset(id, { amount, date, reason }) {
  const asset = await getFixedAsset(id);
  if (!asset) throw new Error('Asset not found');
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('amount must be > 0');

  const ledger = await createLedgerEntry({
    txnDate: date, amount: amt,
    debitAccountCode:  '5700',  // Misc Expense ↑
    creditAccountCode: '1950',  // Fixed Assets ↓
    description: `Depreciation: ${asset.asset_name}${reason ? ' — ' + reason : ''}`,
    sourceModule: 'fixed_asset',
    sourceId: id,
    companyId: asset.company_id,
  });

  const { error: updErr } = await supabase
    .from('fino_fixed_assets')
    .update({
      current_value: Number(asset.current_value || 0) - amt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (updErr) throw updErr;

  const { data: adj, error: adjErr } = await supabase
    .from('fino_fixed_asset_adjustments')
    .insert({
      fixed_asset_id: id, adjustment_date: date,
      type: 'depreciation', amount: amt, reason: reason || null,
      ledger_txn_group_id: ledger.txn_group_id,
    })
    .select()
    .single();
  if (adjErr) throw adjErr;

  return { adjustment: adj, ledger };
}

async function appreciateAsset(id, { amount, date, reason }) {
  const asset = await getFixedAsset(id);
  if (!asset) throw new Error('Asset not found');
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('amount must be > 0');

  const ledger = await createLedgerEntry({
    txnDate: date, amount: amt,
    debitAccountCode:  '1950',  // Fixed Assets ↑
    creditAccountCode: '4200',  // Other Income ↑
    description: `Appreciation: ${asset.asset_name}${reason ? ' — ' + reason : ''}`,
    sourceModule: 'fixed_asset',
    sourceId: id,
    companyId: asset.company_id,
  });

  const { error: updErr } = await supabase
    .from('fino_fixed_assets')
    .update({
      current_value: Number(asset.current_value || 0) + amt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (updErr) throw updErr;

  const { data: adj, error: adjErr } = await supabase
    .from('fino_fixed_asset_adjustments')
    .insert({
      fixed_asset_id: id, adjustment_date: date,
      type: 'appreciation', amount: amt, reason: reason || null,
      ledger_txn_group_id: ledger.txn_group_id,
    })
    .select()
    .single();
  if (adjErr) throw adjErr;

  return { adjustment: adj, ledger };
}

async function getAssetHistory(id) {
  const asset = await getFixedAsset(id);
  if (!asset) return null;

  const { data: adjustments, error: adjErr } = await supabase
    .from('fino_fixed_asset_adjustments')
    .select('*')
    .eq('fixed_asset_id', id)
    .order('adjustment_date', { ascending: false });
  if (adjErr) throw adjErr;

  const { data: ledger, error: ledErr } = await supabase
    .from('fino_ledger_entries')
    .select('*')
    .eq('source_module', 'fixed_asset')
    .eq('source_id', id)
    .order('txn_date', { ascending: false });
  if (ledErr) throw ledErr;

  return { asset, adjustments: adjustments || [], ledger: ledger || [] };
}

// Edit safe fields on an asset (name, category, useful_life, notes always; method/rate only if no adjustments exist).
async function updateFixedAsset(id, patch) {
  const asset = await getFixedAsset(id);
  if (!asset) throw new Error('Asset not found');

  const update = { updated_at: new Date().toISOString() };
  const alwaysOk = {
    assetName: 'asset_name', category: 'category', notes: 'notes',
    usefulLifeYears: 'useful_life_years',
  };
  const condOk = { depreciationMethod: 'depreciation_method', depreciationRate: 'depreciation_rate' };

  for (const [k, col] of Object.entries(alwaysOk)) {
    if (patch[k] !== undefined) update[col] = (typeof patch[k] === 'string') ? patch[k].trim() : patch[k];
  }
  if (Object.keys(condOk).some(k => patch[k] !== undefined)) {
    const { count, error: cErr } = await supabase
      .from('fino_fixed_asset_adjustments')
      .select('id', { count: 'exact', head: true })
      .eq('fixed_asset_id', id)
      .eq('is_deleted', false);
    if (cErr) throw cErr;
    if ((count || 0) > 0) throw new Error('Cannot change depreciation method/rate after adjustments exist. Reverse adjustments first.');
    for (const [k, col] of Object.entries(condOk)) {
      if (patch[k] !== undefined) update[col] = patch[k];
    }
  }

  if (Object.keys(update).length === 1) throw new Error('No editable fields supplied');

  const { data, error } = await supabase
    .from('fino_fixed_assets').update(update).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Delete entire asset: reverse purchase + all adjustments → mark deleted.
async function deleteFixedAsset(id, reason = null) {
  const { reverseBySource } = require('./reversal');
  const asset = await getFixedAsset(id);
  if (!asset) throw new Error('Asset not found');
  if (asset.is_deleted) throw new Error('Asset already deleted');

  await reverseBySource({ sourceModule: 'fixed_asset', sourceId: id, reason: reason || 'Asset deleted' });

  await supabase
    .from('fino_fixed_asset_adjustments')
    .update({ is_deleted: true })
    .eq('fixed_asset_id', id);

  await supabase
    .from('fino_fixed_assets')
    .update({ is_deleted: true, status: 'written_off', current_value: 0, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { success: true };
}

// Delete a single adjustment (depreciation/appreciation): reverse its ledger group, mark deleted, restore current_value.
async function deleteAssetAdjustment(adjustmentId, reason = null) {
  const { reverseLedgerGroup } = require('./reversal');
  const { data: adj, error } = await supabase
    .from('fino_fixed_asset_adjustments').select('*').eq('id', adjustmentId).maybeSingle();
  if (error) throw error;
  if (!adj) throw new Error('Adjustment not found');
  if (adj.is_deleted) throw new Error('Already deleted');

  if (adj.ledger_txn_group_id) {
    await reverseLedgerGroup({ txnGroupId: adj.ledger_txn_group_id, reason: reason || 'Adjustment deleted' });
  }

  // Restore current_value: if depreciation, add back; if appreciation, subtract.
  const asset = await getFixedAsset(adj.fixed_asset_id);
  if (asset) {
    const sign = adj.type === 'depreciation' ? 1 : (adj.type === 'appreciation' ? -1 : 0);
    const newVal = Number(asset.current_value || 0) + sign * Number(adj.amount);
    await supabase.from('fino_fixed_assets')
      .update({ current_value: newVal, updated_at: new Date().toISOString() })
      .eq('id', adj.fixed_asset_id);
  }

  await supabase
    .from('fino_fixed_asset_adjustments')
    .update({ is_deleted: true })
    .eq('id', adjustmentId);
  return { success: true };
}

module.exports = {
  listFixedAssets, getFixedAsset, createFixedAsset,
  depreciateAsset, appreciateAsset, getAssetHistory,
  updateFixedAsset, deleteFixedAsset, deleteAssetAdjustment,
};
