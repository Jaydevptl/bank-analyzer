/**
 * Transactions Route
 * GET    /api/transactions            - List with filters + pagination + status
 * GET    /api/transactions/stats      - Dashboard stats
 * GET    /api/transactions/banks      - Distinct bank names
 * PATCH  /api/transactions/:id        - Update category / description
 * PATCH  /api/transactions/:id/verify - Verify single transaction
 * PATCH  /api/transactions/:id/unverify - Unverify single transaction
 * PATCH  /api/transactions/verify-all - Verify all pending
 * DELETE /api/transactions/clear      - Delete all transactions
 */

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { fromDb, toDbField } = require('../lib/mapper');

// ─── List Transactions ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const {
      startDate, endDate, bank, accountHolder, minAmount, maxAmount,
      category, search, type, status,
      page = 1, limit = 100,
      sortBy = 'date', sortOrder = 'asc',
    } = req.query;

    let query = supabase.from('transactions').select('*', { count: 'exact' });

    // Status filter (default: pending)
    const statusFilter = status || 'pending';
    if (statusFilter === 'backup') {
      // Show both backup and backup-deleted
      query = query.in('status', ['backup', 'backup-deleted']);
    } else if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (startDate) query = query.gte('date', new Date(startDate).toISOString());
    if (endDate)   query = query.lte('date', new Date(endDate + 'T23:59:59').toISOString());
    if (bank && bank !== 'all') query = query.eq('bank_name', bank);
    if (accountHolder && accountHolder !== 'all') query = query.eq('account_holder', accountHolder);
    if (category && category !== 'all') query = query.eq('category', category);
    if (search) query = query.ilike('description', `%${search}%`);
    if (type === 'debit')  query = query.gt('debit', 0);
    if (type === 'credit') query = query.gt('credit', 0);

    if (minAmount || maxAmount) {
      const min = minAmount ? parseFloat(minAmount) : null;
      const max = maxAmount ? parseFloat(maxAmount) : null;
      const debitFilter  = min != null && max != null ? `and(debit.gte.${min},debit.lte.${max})`   : min != null ? `debit.gte.${min}`  : `debit.lte.${max}`;
      const creditFilter = min != null && max != null ? `and(credit.gte.${min},credit.lte.${max})` : min != null ? `credit.gte.${min}` : `credit.lte.${max}`;
      query = query.or(`${debitFilter},${creditFilter}`);
    }

    const dbSortField = toDbField(sortBy);
    query = query.order(dbSortField, { ascending: sortOrder !== 'desc' });

    const pageNum  = parseInt(page);
    const pageSize = parseInt(limit);
    const from = (pageNum - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      transactions: data.map(fromDb),
      pagination: {
        page: pageNum,
        limit: pageSize,
        total: count,
        pages: Math.ceil(count / pageSize),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stats (via Supabase RPC) ──────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate, bank } = req.query;

    const { data, error } = await supabase.rpc('get_transaction_stats', {
      p_start_date: startDate ? new Date(startDate).toISOString() : null,
      p_end_date:   endDate   ? new Date(endDate + 'T23:59:59').toISOString() : null,
      p_bank_name:  (bank && bank !== 'all') ? bank : null,
    });

    if (error) throw error;

    const stats   = data || {};
    const overall = stats.overall || { totalDebit: 0, totalCredit: 0, count: 0 };
    const MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    res.json({
      overall: {
        totalDebit:        overall.totalDebit  || 0,
        totalCredit:       overall.totalCredit || 0,
        netFlow:           (overall.totalCredit || 0) - (overall.totalDebit || 0),
        totalTransactions: overall.count || 0,
      },
      daily: (stats.daily || []).map(d => ({
        date:   d.date,
        debit:  d.debit,
        credit: d.credit,
        net:    d.credit - d.debit,
        count:  d.count,
      })),
      monthly: (stats.monthly || []).map(m => ({
        month:  `${MONTHS[m.month - 1]} ${m.year}`,
        debit:  m.debit,
        credit: m.credit,
        net:    m.credit - m.debit,
        count:  m.count,
      })),
      byCategory: (stats.byCategory || []).map(c => ({
        category: c.category || 'Uncategorized',
        debit:    c.debit,
        credit:   c.credit,
        count:    c.count,
      })),
      byBank: (stats.byBank || []).map(b => ({
        bank:   b.bank,
        debit:  b.debit,
        credit: b.credit,
        count:  b.count,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Distinct Banks ────────────────────────────────────────────────────────────

router.get('/banks', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('bank_name')
      .in('status', ['pending', 'verified']);
    if (error) throw error;

    const banks = [...new Set(data.map(r => r.bank_name))].filter(Boolean);
    res.json({ banks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Distinct Account Holders ─────────────────────────────────────────────────

router.get('/account-holders', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('account_holder')
      .in('status', ['pending', 'verified']);
    if (error) throw error;

    const holders = [...new Set(data.map(r => r.account_holder))].filter(Boolean);
    res.json({ accountHolders: holders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Duplicate Check Helper (mirrors upload pipeline) ────────────────────────

async function findDuplicate(txn) {
  const dateStr = typeof txn.date === 'string' ? txn.date : new Date(txn.date).toISOString();
  const dateOnly = dateStr.substring(0, 10);

  let query = supabase
    .from('transactions')
    .select('id, description, debit, credit, status')
    .gte('date', dateOnly + 'T00:00:00')
    .lte('date', dateOnly + 'T23:59:59')
    .in('status', ['pending', 'verified', 'backup']);

  if (txn.debit > 0)       query = query.eq('debit', txn.debit);
  else if (txn.credit > 0) query = query.eq('credit', txn.credit);

  const { data, error } = await query;
  if (error || !data || data.length === 0) return null;

  const prefix = (txn.description || '').substring(0, 20).toLowerCase();
  for (const ex of data) {
    if ((ex.description || '').substring(0, 20).toLowerCase() === prefix) return ex.id;
  }
  return null;
}

function buildManualRow(e, sessionId) {
  const isoDate = new Date(e.date).toISOString();
  return {
    date: isoDate,
    description: String(e.description).trim(),
    debit:  Number(e.debit)  || 0,
    credit: Number(e.credit) || 0,
    balance: null,
    bank_name: (e.bankName || 'Cash').trim(),
    account_number: '',
    account_name: '',
    account_holder: (e.accountHolder || '').trim(),
    reference_no: (e.referenceNo || '').trim(),
    upload_id: sessionId,
    upload_session_id: sessionId,
    source_file: sessionId === 'manual-bulk' ? 'Manual Bulk Upload' : 'Manual Entry',
    category: e.category || 'Uncategorized',
    raw_data: { manual: true, bulk: sessionId === 'manual-bulk' },
  };
}

// ─── Create Single Transaction (manual entry — same flow as bank upload) ─────

router.post('/', async (req, res) => {
  try {
    const { date, description, debit, credit } = req.body;
    if (!date || !description) {
      return res.status(400).json({ error: 'date and description are required' });
    }
    const debitNum  = Number(debit)  || 0;
    const creditNum = Number(credit) || 0;
    if (debitNum <= 0 && creditNum <= 0) {
      return res.status(400).json({ error: 'Either debit or credit must be greater than 0' });
    }

    const sessionId = `manual_${Date.now()}`;
    const base = buildManualRow(req.body, 'manual');
    base.upload_session_id = sessionId;

    // Duplicate check against existing pending/verified/backup
    const dupId = await findDuplicate({ ...base, debit: base.debit, credit: base.credit });

    if (dupId) {
      const { data, error } = await supabase
        .from('transactions')
        .insert({ ...base, status: 'duplicate', duplicate_of: dupId })
        .select().single();
      if (error) throw error;
      return res.json({ transaction: fromDb(data), status: 'duplicate', matchedWith: dupId });
    }

    // Single manual add → backup + pending dono insert (bulk flow ki tarah)
    const { error: bErr } = await supabase
      .from('transactions')
      .insert({ ...base, status: 'backup' });
    if (bErr) throw bErr;

    const { data: pending, error: pErr } = await supabase
      .from('transactions')
      .insert({ ...base, status: 'pending' })
      .select().single();
    if (pErr) throw pErr;

    res.json({ transaction: fromDb(pending), status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Bulk Insert (manual entries from template — same flow as bank upload) ───

router.post('/bulk', async (req, res) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries array required' });
    }
    if (entries.length > 5000) {
      return res.status(400).json({ error: 'Max 5000 entries per upload' });
    }

    const sessionId = `manual-bulk_${Date.now()}`;
    const errors = [];
    const toInsert = [];
    let unique = 0, duplicates = 0;

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const lineNo = i + 1;
      if (!e.date || !e.description) {
        errors.push({ line: lineNo, error: 'date and description required' }); continue;
      }
      const dt = new Date(e.date);
      if (isNaN(dt.getTime())) {
        errors.push({ line: lineNo, error: `invalid date: ${e.date}` }); continue;
      }
      const debit  = Number(e.debit)  || 0;
      const credit = Number(e.credit) || 0;
      if (debit <= 0 && credit <= 0) {
        errors.push({ line: lineNo, error: 'debit or credit must be > 0' }); continue;
      }

      const base = buildManualRow(e, 'manual-bulk');
      base.upload_session_id = sessionId;

      const dupId = await findDuplicate(base);
      if (dupId) {
        toInsert.push({ ...base, status: 'duplicate', duplicate_of: dupId });
        duplicates++;
      } else {
        toInsert.push({ ...base, status: 'backup' });
        toInsert.push({ ...base, status: 'pending' });
        unique++;
      }
    }

    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const slice = toInsert.slice(i, i + 500);
      const { data, error } = await supabase.from('transactions').insert(slice).select('id');
      if (error) throw error;
      inserted += (data?.length || 0);
    }

    res.json({
      total: entries.length,
      unique, duplicates,
      inserted,
      errors,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Verify All Pending ───────────────────────────────────────────────────────

router.patch('/verify-all', async (req, res) => {
  try {
    const { data, error, count } = await supabase
      .from('transactions')
      .update({ status: 'verified' })
      .eq('status', 'pending')
      .select('id');

    if (error) throw error;

    res.json({ verified: data ? data.length : 0, message: 'All pending transactions verified.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Verify Single Transaction ────────────────────────────────────────────────

router.patch('/:id/verify', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .update({ status: 'verified' })
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Transaction not found or already verified' });

    // Ensure a backup copy exists for this entry (manual single-add entries
    // don't have backup yet; bulk/file-uploaded entries already do).
    try {
      const dateStr = typeof data.date === 'string' ? data.date : new Date(data.date).toISOString();
      const dateOnly = dateStr.substring(0, 10);
      let bq = supabase.from('transactions').select('id, description').eq('status', 'backup')
        .gte('date', dateOnly + 'T00:00:00').lte('date', dateOnly + 'T23:59:59');
      if (data.debit > 0) bq = bq.eq('debit', data.debit);
      else bq = bq.eq('credit', data.credit);

      const { data: backups } = await bq;
      const prefix = (data.description || '').substring(0, 20).toLowerCase();
      const hasBackup = (backups || []).some(b => (b.description || '').substring(0, 20).toLowerCase() === prefix);

      if (!hasBackup) {
        const backupRow = { ...data };
        delete backupRow.id;
        delete backupRow.created_at;
        delete backupRow.updated_at;
        backupRow.status = 'backup';
        await supabase.from('transactions').insert(backupRow);
      }
    } catch (backupErr) {
      console.error('Backup creation on verify failed:', backupErr.message);
    }

    res.json({ transaction: fromDb(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Unverify Single Transaction ──────────────────────────────────────────────

router.patch('/:id/unverify', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .update({ status: 'pending' })
      .eq('id', req.params.id)
      .eq('status', 'verified')
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Transaction not found or not verified' });

    res.json({ transaction: fromDb(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Update Transaction ────────────────────────────────────────────────────────

router.patch('/:id', async (req, res) => {
  try {
    const { category, description, status } = req.body;
    const update = {};
    if (category)    update.category    = category;
    if (description) update.description = description;
    if (status)      update.status      = status;

    const { data, error } = await supabase
      .from('transactions')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Transaction not found' });

    res.json({ transaction: fromDb(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete All Duplicates (permanent) ────────────────────────────────────────

router.delete('/clear-duplicates', async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .eq('status', 'duplicate');

    if (error) throw error;
    res.json({ deleted: count, message: 'All duplicate transactions deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Clear All Transactions (move to recycle bin, keep reports) ───────────────
// IMPORTANT: This must be BEFORE /:id routes so Express doesn't match "clear" as :id

router.delete('/clear', async (req, res) => {
  try {
    // Only fetch pending/verified (not backup)
    const { data: allTxns, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .in('status', ['pending', 'verified']);

    if (fetchErr) throw fetchErr;

    if (allTxns && allTxns.length > 0) {
      const recycleEntries = allTxns.map(txn => ({
        original_id: txn.id,
        item_type: 'transaction',
        data: txn,
      }));

      for (let i = 0; i < recycleEntries.length; i += 500) {
        await supabase.from('recycle_bin').insert(recycleEntries.slice(i, i + 500));
      }

      // Tag matching backups as deleted
      for (const txn of allTxns) {
        if (txn.date && (txn.debit > 0 || txn.credit > 0)) {
          const dateStr = typeof txn.date === 'string' ? txn.date : new Date(txn.date).toISOString();
          const dateOnly = dateStr.substring(0, 10);
          const descPrefix = (txn.description || '').substring(0, 30);

          let bq = supabase.from('transactions').select('id, description').eq('status', 'backup')
            .gte('date', dateOnly + 'T00:00:00').lte('date', dateOnly + 'T23:59:59');
          if (txn.debit > 0) bq = bq.eq('debit', txn.debit);
          else bq = bq.eq('credit', txn.credit);

          const { data: backups } = await bq;
          if (backups && backups.length > 0) {
            const match = backups.find(b => (b.description || '').substring(0, 30) === descPrefix) || backups[0];
            await supabase.from('transactions').update({ status: 'backup-deleted' }).eq('id', match.id);
          }
        }
      }

      // Delete pending/verified
      await supabase.from('transactions').delete().in('status', ['pending', 'verified']);
    }

    res.json({ deleted: allTxns ? allTxns.length : 0, message: 'Transactions moved to recycle bin. Backups tagged. Reports preserved.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Restore from Backup (create pending copy from backup) ───────────────────

router.post('/:id/restore-from-backup', async (req, res) => {
  try {
    const { data: backup, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !backup) return res.status(404).json({ error: 'Backup not found' });
    if (backup.status !== 'backup-deleted') {
      return res.status(400).json({ error: 'This backup entry is not marked as deleted' });
    }

    const newTxn = { ...backup };
    delete newTxn.id;
    delete newTxn.created_at;
    delete newTxn.updated_at;
    newTxn.status = 'pending';

    const { data: inserted, error: insertErr } = await supabase
      .from('transactions')
      .insert(newTxn)
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Restore backup status back to 'backup'
    await supabase.from('transactions').update({ status: 'backup' }).eq('id', req.params.id);

    res.json({ success: true, transaction: fromDb(inserted) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Undo Last Action ────────────────────────────────────────────────────────

router.post('/:id/undo', async (req, res) => {
  try {
    const { previousState } = req.body;
    if (!previousState) return res.status(400).json({ error: 'No previous state provided' });

    const update = {};
    if (previousState.category)    update.category    = previousState.category;
    if (previousState.description) update.description = previousState.description;
    if (previousState.status)      update.status      = previousState.status;

    const { data, error } = await supabase
      .from('transactions')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ transaction: fromDb(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete Single Transaction (move to recycle bin + tag backup) ─────────────

router.delete('/:id', async (req, res) => {
  try {
    const { data: txn, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !txn) return res.status(404).json({ error: 'Transaction not found' });

    // Move to recycle bin
    await supabase.from('recycle_bin').insert({
      original_id: txn.id,
      item_type: 'transaction',
      data: txn,
    });

    // Tag the matching backup entry as 'backup-deleted'
    if (txn.status === 'pending' || txn.status === 'verified') {
      if (txn.date && (txn.debit > 0 || txn.credit > 0)) {
        const dateStr = typeof txn.date === 'string' ? txn.date : new Date(txn.date).toISOString();
        const dateOnly = dateStr.substring(0, 10);
        const descPrefix = (txn.description || '').substring(0, 30);

        let backupQuery = supabase.from('transactions').select('id, description').eq('status', 'backup')
          .gte('date', dateOnly + 'T00:00:00').lte('date', dateOnly + 'T23:59:59');

        if (txn.debit > 0) backupQuery = backupQuery.eq('debit', txn.debit);
        else backupQuery = backupQuery.eq('credit', txn.credit);

        const { data: backups } = await backupQuery;
        if (backups && backups.length > 0) {
          const match = backups.find(b => (b.description || '').substring(0, 30) === descPrefix) || backups[0];
          await supabase.from('transactions').update({ status: 'backup-deleted' }).eq('id', match.id);
        }
      }
    }

    // Delete from transactions
    await supabase.from('transactions').delete().eq('id', req.params.id);

    res.json({ success: true, transaction: fromDb(txn) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
