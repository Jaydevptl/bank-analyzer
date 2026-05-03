/**
 * Fino · Document Archive (Phase 18A)
 *
 * Generic attachment store. file_url is a text field — for v1 the user pastes
 * a Google Drive / Dropbox / S3 link. Real Supabase Storage upload can come
 * later without changing this API.
 *
 * fino_attachments columns used: id, entity_type, entity_id, file_name,
 * file_url, file_size, uploaded_by, tags (text[] or text), notes,
 * is_deleted, created_at.
 */

const supabase = require('./supabase');

async function uploadDocument({
  entityType, entityId, fileName, fileUrl, fileSize, uploadedBy, tags, notes,
}) {
  if (!entityType?.trim()) throw new Error('entityType required');
  if (!fileName?.trim())   throw new Error('fileName required');
  if (!fileUrl?.trim())    throw new Error('fileUrl required');

  const row = {
    entity_type: entityType.trim(),
    entity_id:   entityId || null,
    file_name:   fileName.trim(),
    file_url:    fileUrl.trim(),
    file_size:   fileSize ? Number(fileSize) : null,
    uploaded_by: uploadedBy || null,
    tags:        Array.isArray(tags) ? tags : (tags ? [tags] : null),
    notes:       notes?.trim() || null,
  };
  const { data, error } = await supabase
    .from('fino_attachments').insert(row).select().single();
  if (error) throw error;
  return data;
}

async function listDocuments({ entityType = null, entityId = null, tags = null, includeDeleted = false } = {}) {
  let q = supabase.from('fino_attachments').select('*').order('created_at', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (entityType)      q = q.eq('entity_type', entityType);
  if (entityId)        q = q.eq('entity_id', entityId);
  if (tags) {
    const tagList = Array.isArray(tags) ? tags : [tags];
    q = q.overlaps('tags', tagList);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getDocument(id) {
  const { data, error } = await supabase
    .from('fino_attachments').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function deleteDocument(id) {
  const doc = await getDocument(id);
  if (!doc) throw new Error('Document not found');
  if (doc.is_deleted) throw new Error('Already deleted');
  await supabase.from('fino_attachments').update({ is_deleted: true }).eq('id', id);
  return { success: true };
}

async function searchDocuments({ query = null, tags = null } = {}) {
  let q = supabase.from('fino_attachments').select('*').eq('is_deleted', false).order('created_at', { ascending: false });
  if (query?.trim()) {
    const term = `%${query.trim()}%`;
    q = q.or(`file_name.ilike.${term},notes.ilike.${term},entity_type.ilike.${term}`);
  }
  if (tags) {
    const tagList = Array.isArray(tags) ? tags : [tags];
    q = q.overlaps('tags', tagList);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

module.exports = {
  uploadDocument, listDocuments, getDocument, deleteDocument, searchDocuments,
};
