/**
 * Amazon Multi-Card Tracking Routes
 *
 *  Cards:
 *   GET    /api/amazon/cards
 *   POST   /api/amazon/cards
 *   PATCH  /api/amazon/cards/:id
 *   DELETE /api/amazon/cards/:id
 *   GET    /api/amazon/cards/balances  (balances view)
 *
 *  Upload:
 *   POST   /api/amazon/upload   (multipart CSV)
 *
 *  Orders:
 *   GET    /api/amazon/orders
 *   GET    /api/amazon/orders/summary  (order value vs payment total)
 *
 *  Transactions:
 *   GET    /api/amazon/transactions
 *   DELETE /api/amazon/transactions/:id
 *
 *  Reports:
 *   GET    /api/amazon/reports
 *   GET    /api/amazon/dashboard
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const supabase = require('../lib/supabase');
const { processAmazonCSV } = require('../services/amazonParser');

// ─── Upload config ─────────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `amazon_${base}_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv') return cb(null, true);
    cb(new Error('Only .csv files are supported for Amazon reports.'));
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// CARDS CRUD
// ═══════════════════════════════════════════════════════════════════════════

router.get('/cards', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('amz_cards')
      .select('*')
      .order('card_name', { ascending: true });
    if (error) throw error;
    res.json({ cards: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cards/balances', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('amz_card_balances')
      .select('*')
      .order('card_name', { ascending: true });
    if (error) throw error;
    res.json({ balances: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cards', async (req, res) => {
  try {
    const { cardName, last4, openingBalance, notes } = req.body;
    if (!cardName || !last4) {
      return res.status(400).json({ error: 'cardName and last4 required' });
    }
    const cleanLast4 = String(last4).trim();
    if (!/^\d{3,6}$/.test(cleanLast4)) {
      return res.status(400).json({ error: 'last4 must be 3-6 digits' });
    }
    const { data, error } = await supabase
      .from('amz_cards')
      .insert({
        card_name: cardName.trim(),
        last_4: cleanLast4,
        opening_balance: Number(openingBalance) || 0,
        notes: notes?.trim() || null,
      })
      .select()
      .single();
    if (error) {
      if (/duplicate key|unique/i.test(error.message)) {
        return res.status(400).json({ error: `A card with last-4 "${cleanLast4}" already exists.` });
      }
      throw error;
    }

    // Back-fill card_id on unmapped transactions for this last_4
    await supabase
      .from('amz_transactions')
      .update({ card_id: data.id })
      .eq('card_last4', cleanLast4)
      .is('card_id', null);

    res.json({ card: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/cards/:id', async (req, res) => {
  try {
    const { cardName, last4, openingBalance, notes } = req.body;
    const update = { updated_at: new Date().toISOString() };
    if (cardName != null)       update.card_name       = cardName.trim();
    if (last4 != null)          update.last_4          = String(last4).trim();
    if (openingBalance != null) update.opening_balance = Number(openingBalance) || 0;
    if (notes !== undefined)    update.notes           = notes?.trim() || null;

    const { data, error } = await supabase
      .from('amz_cards')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Card not found' });

    // Re-map unmapped txns if last4 changed
    if (update.last_4) {
      await supabase
        .from('amz_transactions')
        .update({ card_id: data.id })
        .eq('card_last4', update.last_4)
        .is('card_id', null);
    }

    res.json({ card: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/cards/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('amz_cards')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const report = await processAmazonCSV(req.file.path, req.file.originalname);
    res.json(report);
  } catch (err) {
    console.error('Amazon upload error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(req.file.path); } catch {}
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/orders', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    let query = supabase
      .from('amz_orders')
      .select('*', { count: 'exact' })
      .order('order_date', { ascending: false, nullsFirst: false });

    if (status && status !== 'all') query = query.eq('latest_status', status);
    if (search) query = query.ilike('order_id', `%${search}%`);

    const p = parseInt(page);
    const l = parseInt(limit);
    query = query.range((p - 1) * l, p * l - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      orders: data || [],
      pagination: { page: p, limit: l, total: count, pages: Math.ceil(count / l) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/orders/summary', async (req, res) => {
  try {
    // Pull orders with their payment totals — done as two small queries
    // and joined in JS for simplicity.
    const { data: orders, error: oErr } = await supabase
      .from('amz_orders')
      .select('order_id, latest_status, is_closed, order_net_total, order_date, order_quantity');
    if (oErr) throw oErr;

    const { data: txns, error: tErr } = await supabase
      .from('amz_transactions')
      .select('order_id, amount')
      .eq('txn_type', 'Purchase');
    if (tErr) throw tErr;

    const payMap = new Map();
    for (const t of txns || []) {
      payMap.set(t.order_id, (payMap.get(t.order_id) || 0) + Number(t.amount));
    }

    const summary = (orders || []).map(o => {
      const paid = payMap.get(o.order_id) || 0;
      const diff = Number(o.order_net_total || 0) - paid;
      const flags = [];
      if (paid === 0 && !['cancelled'].includes((o.latest_status || '').toLowerCase())) {
        flags.push('unpaid');
      }
      if (paid > 0 && Math.abs(diff) > 0.01 && !['cancelled'].includes((o.latest_status || '').toLowerCase())) {
        flags.push(diff > 0 ? 'partial' : 'overpaid');
      }
      return {
        orderId: o.order_id,
        status: o.latest_status,
        isClosed: o.is_closed,
        orderDate: o.order_date,
        quantity: o.order_quantity,
        orderTotal: Number(o.order_net_total || 0),
        paidTotal: paid,
        difference: diff,
        flags,
      };
    });

    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/transactions', async (req, res) => {
  try {
    const {
      cardId, txnType, search, startDate, endDate,
      page = 1, limit = 50,
    } = req.query;

    let query = supabase
      .from('amz_transactions')
      .select('*', { count: 'exact' })
      .order('txn_date', { ascending: false });

    if (cardId && cardId !== 'all') query = query.eq('card_id', cardId);
    if (txnType && txnType !== 'all') query = query.eq('txn_type', txnType);
    if (startDate) query = query.gte('txn_date', startDate);
    if (endDate)   query = query.lte('txn_date', endDate);
    if (search)    query = query.or(`order_id.ilike.%${search}%,title.ilike.%${search}%`);

    const p = parseInt(page);
    const l = parseInt(limit);
    query = query.range((p - 1) * l, p * l - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      transactions: data || [],
      pagination: { page: p, limit: l, total: count, pages: Math.ceil(count / l) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/transactions/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('amz_transactions')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual transaction entry: Add | Transfer | Refund
router.post('/transactions', async (req, res) => {
  try {
    const { txnType, txnDate, amount, cardId, fromCardId, toCardId, notes } = req.body;

    if (!['Add', 'Transfer', 'Refund'].includes(txnType)) {
      return res.status(400).json({ error: 'txnType must be Add, Transfer, or Refund' });
    }
    if (!txnDate) return res.status(400).json({ error: 'txnDate required' });
    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'amount must be > 0' });

    const row = {
      unique_key: `MANUAL|${txnType}|${Date.now()}|${Math.random().toString(36).slice(2, 8)}`,
      txn_type: txnType,
      txn_date: txnDate,
      amount: amt,
      notes: notes?.trim() || null,
    };

    if (txnType === 'Transfer') {
      if (!fromCardId || !toCardId) return res.status(400).json({ error: 'fromCardId and toCardId required for Transfer' });
      if (String(fromCardId) === String(toCardId)) return res.status(400).json({ error: 'fromCardId and toCardId must differ' });
      row.from_card_id = fromCardId;
      row.to_card_id = toCardId;
    } else {
      if (!cardId) return res.status(400).json({ error: 'cardId required' });
      row.card_id = cardId;
    }

    const { data, error } = await supabase
      .from('amz_transactions')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    res.json({ transaction: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS + DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

router.get('/reports', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('amz_upload_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ reports: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const [balancesRes, ordersRes, txnsRes] = await Promise.all([
      supabase.from('amz_card_balances').select('*'),
      supabase.from('amz_orders').select('latest_status, is_closed'),
      supabase.from('amz_transactions').select('txn_type, amount, card_last4, card_id'),
    ]);

    if (balancesRes.error) throw balancesRes.error;
    if (ordersRes.error)   throw ordersRes.error;
    if (txnsRes.error)     throw txnsRes.error;

    const balances = balancesRes.data || [];
    const orders   = ordersRes.data   || [];
    const txns     = txnsRes.data     || [];

    // Status breakdown
    const statusCounts = {};
    for (const o of orders) {
      const k = o.latest_status || 'Unknown';
      statusCounts[k] = (statusCounts[k] || 0) + 1;
    }

    // Unmapped transactions summary
    const unmapped = {};
    for (const t of txns) {
      if (!t.card_id && t.card_last4) {
        unmapped[t.card_last4] = (unmapped[t.card_last4] || 0) + Number(t.amount);
      }
    }

    const totalPurchases = txns
      .filter(t => t.txn_type === 'Purchase')
      .reduce((s, t) => s + Number(t.amount), 0);

    res.json({
      totals: {
        cards: balances.length,
        orders: orders.length,
        ordersClosed: orders.filter(o => o.is_closed).length,
        transactions: txns.length,
        totalPurchases,
      },
      statusCounts,
      balances,
      unmappedLast4: Object.entries(unmapped).map(([last4, total]) => ({ last4, total })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
