/**
 * Fino · Companies service helpers (Phase 2)
 * Pure CRUD on fino_companies. No Express routes.
 */

const supabase = require('./supabase');

async function listCompanies({ status = 'active', includeAll = false } = {}) {
  let q = supabase.from('fino_companies').select('*').order('name', { ascending: true });
  if (!includeAll) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getCompany(id) {
  const { data, error } = await supabase
    .from('fino_companies')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createCompany(payload) {
  const { name, type } = payload;
  if (!name?.trim()) throw new Error('name required');
  if (!['own', 'partnered', 'external', 'personal'].includes(type)) {
    throw new Error("type must be one of: own | partnered | external | personal");
  }
  const row = {
    name: name.trim(),
    type,
    ownership_percent: payload.ownershipPercent ?? 100,
    is_personal: payload.isPersonal ?? (type === 'personal'),
    currency: payload.currency || 'INR',
    start_date: payload.startDate || null,
    status: payload.status || 'active',
    notes: payload.notes || null,
  };
  const { data, error } = await supabase.from('fino_companies').insert(row).select().single();
  if (error) throw error;
  return data;
}

async function updateCompany(id, patch) {
  const update = { updated_at: new Date().toISOString() };
  if (patch.name != null)             update.name = patch.name.trim();
  if (patch.type != null)             update.type = patch.type;
  if (patch.ownershipPercent != null) update.ownership_percent = patch.ownershipPercent;
  if (patch.isPersonal !== undefined) update.is_personal = patch.isPersonal;
  if (patch.currency != null)         update.currency = patch.currency;
  if (patch.startDate !== undefined)  update.start_date = patch.startDate;
  if (patch.status != null)           update.status = patch.status;
  if (patch.notes !== undefined)      update.notes = patch.notes;

  const { data, error } = await supabase
    .from('fino_companies')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteCompany(id) {
  const { error } = await supabase.from('fino_companies').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}

module.exports = { listCompanies, getCompany, createCompany, updateCompany, deleteCompany };
