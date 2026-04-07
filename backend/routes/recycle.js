/**
 * Recycle Bin Route
 * GET    /api/recycle          - List recycled items
 * POST   /api/recycle/:id/restore - Restore item
 * DELETE /api/recycle/:id      - Permanently delete
 * DELETE /api/recycle/empty    - Empty recycle bin
 */

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { fromDb } = require('../lib/mapper');

// ─── List Recycled Items ──────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { type } = req.query; // 'transaction' or 'report'
    let query = supabase.from('recycle_bin').select('*').order('deleted_at', { ascending: false });
    if (type) query = query.eq('item_type', type);

    const { data, error } = await query;
    if (error) throw error;

    const items = (data || []).map(item => ({
      id: item.id,
      originalId: item.original_id,
      itemType: item.item_type,
      data: item.item_type === 'transaction' ? fromDb(item.data) : item.data,
      deletedAt: item.deleted_at,
    }));

    res.json({ items, total: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Restore Item ─────────────────────────────────────────────────────────────

router.post('/:id/restore', async (req, res) => {
  try {
    // Fetch from recycle bin
    const { data: item, error: fetchErr } = await supabase
      .from('recycle_bin')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !item) return res.status(404).json({ error: 'Item not found in recycle bin' });

    if (item.item_type === 'transaction') {
      // Restore transaction - remove id so Supabase generates new one, or use original
      const txnData = { ...item.data };
      delete txnData.id; // Let supabase generate if original ID conflicts
      delete txnData.updated_at;
      delete txnData.created_at;

      // Try with original ID first
      const { error: insertErr } = await supabase
        .from('transactions')
        .insert({ ...txnData, id: item.original_id });

      if (insertErr) {
        // If original ID conflicts, insert without ID
        const { error: insertErr2 } = await supabase
          .from('transactions')
          .insert(txnData);
        if (insertErr2) throw insertErr2;
      }
    } else if (item.item_type === 'report') {
      const reportData = { ...item.data };
      delete reportData.id;
      delete reportData.created_at;
      await supabase.from('upload_reports').insert(reportData);
    }

    // Remove from recycle bin
    await supabase.from('recycle_bin').delete().eq('id', req.params.id);

    res.json({ success: true, message: 'Item restored' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Restore All ──────────────────────────────────────────────────────────────

router.post('/restore-all', async (req, res) => {
  try {
    const { data: items, error: fetchErr } = await supabase
      .from('recycle_bin')
      .select('*');

    if (fetchErr) throw fetchErr;
    if (!items || items.length === 0) return res.json({ success: true, restored: 0 });

    let restored = 0;
    for (const item of items) {
      try {
        if (item.item_type === 'transaction') {
          const txnData = { ...item.data };
          delete txnData.updated_at;
          delete txnData.created_at;
          await supabase.from('transactions').insert(txnData);
        } else if (item.item_type === 'report') {
          const rData = { ...item.data };
          delete rData.created_at;
          await supabase.from('upload_reports').insert(rData);
        }
        await supabase.from('recycle_bin').delete().eq('id', item.id);
        restored++;
      } catch {}
    }

    res.json({ success: true, restored });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Permanently Delete ───────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('recycle_bin').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Empty Recycle Bin ────────────────────────────────────────────────────────

router.delete('/', async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('recycle_bin')
      .delete({ count: 'exact' })
      .gte('deleted_at', '1970-01-01');
    if (error) throw error;
    res.json({ success: true, deleted: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
