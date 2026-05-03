/**
 * Fino · Chart-of-Accounts helpers
 *
 *   ensureChildCoa({ parentCode, childName, ... })
 *     → Returns { id, code, name } for an existing or newly-created child row
 *       under the given parent code. Used by Phase 3c (Gift Cards), Phase 3d
 *       (Credit Cards), Phase 11 (Amazon Cards), etc.
 *
 *   Code generation rule: next available NNNN within the parent's range.
 *   E.g. parent 1600 → child 1601, 1602, ... cap at 1699 (99 children max).
 */

const supabase = require('./supabase');

async function ensureChildCoa({
  parentCode,
  childName,
  childType = 'asset',
  subType = 'current_asset',
  description = null,
}) {
  if (!parentCode || !childName?.trim()) throw new Error('parentCode + childName required');
  childName = childName.trim();

  // 1. Resolve parent
  const { data: parent, error: pErr } = await supabase
    .from('fino_chart_of_accounts')
    .select('id, code')
    .eq('code', parentCode)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!parent) throw new Error(`Parent COA code ${parentCode} not found`);

  // 2. Already exists?
  const { data: existing, error: eErr } = await supabase
    .from('fino_chart_of_accounts')
    .select('id, code, name')
    .eq('parent_id', parent.id)
    .eq('name', childName)
    .maybeSingle();
  if (eErr) throw eErr;
  if (existing) return existing;

  // 3. Generate next code in range NN01..NN99
  const prefix = parentCode.slice(0, 2); // e.g. "16"
  const { data: rangeRows, error: rErr } = await supabase
    .from('fino_chart_of_accounts')
    .select('code')
    .like('code', `${prefix}%`);
  if (rErr) throw rErr;

  const used = new Set((rangeRows || []).map(r => r.code));
  let nextCode = null;
  for (let i = 1; i <= 99; i++) {
    const candidate = `${prefix}${String(i).padStart(2, '0')}`;
    if (!used.has(candidate)) { nextCode = candidate; break; }
  }
  if (!nextCode) throw new Error(`Code range ${prefix}XX exhausted; clean up unused codes first`);

  // 4. Insert child
  const { data, error: insErr } = await supabase
    .from('fino_chart_of_accounts')
    .insert({
      code: nextCode,
      name: childName,
      type: childType,
      sub_type: subType,
      parent_id: parent.id,
      is_system: false,
      is_active: true,
      description,
    })
    .select('id, code, name')
    .single();
  if (insErr) throw insErr;
  return data;
}

module.exports = { ensureChildCoa };
