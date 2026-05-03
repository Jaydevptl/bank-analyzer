const express = require('express');
const router = express.Router();
const hawala = require('../lib/hawala');
const cards  = require('../lib/amazonCards');
const ships  = require('../lib/amazonShipments');

// Dashboard (must be before /:id-style routes)
router.get('/dashboard', async (req, res) => {
  try { res.json(await ships.getDashboardSummary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Hawala ──────────────────────────────────────────────────────────────────

router.get('/hawala', async (req, res) => {
  try {
    res.json({ transactions: await hawala.listHawalaTransactions({
      agentId: req.query.agent || null,
      status:  req.query.status || null,
      includeDeleted: req.query.includeDeleted === '1',
    })});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/hawala/next-number', async (req, res) => {
  try { res.json({ txn_number: await hawala.getNextHawalaNumber() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/hawala/summary', async (req, res) => {
  try { res.json({ summary: await hawala.getHawalaSummary() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/hawala', async (req, res) => {
  try { res.json(await hawala.createHawalaTransaction(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/hawala/:id', async (req, res) => {
  try {
    const t = await hawala.getHawalaTransaction(req.params.id);
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json({ transaction: t });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/hawala/:id/inr-paid', async (req, res) => {
  try { res.json({ transaction: await hawala.markInrPaid(req.params.id, req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/hawala/:id/usd-received', async (req, res) => {
  try { res.json({ transaction: await hawala.markUsdReceived(req.params.id, req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/hawala/:id', async (req, res) => {
  try { await hawala.cancelHawala(req.params.id, req.body?.reason || null); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ─── Cards ───────────────────────────────────────────────────────────────────

router.get('/cards', async (req, res) => {
  try { res.json({ cards: await cards.listCards({ includeDeleted: req.query.includeDeleted === '1' }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/cards', async (req, res) => {
  try { res.json({ card: await cards.createCard(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/cards/:id', async (req, res) => {
  try {
    const data = await cards.getCard(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/cards/:id/load', async (req, res) => {
  try { res.json(await cards.loadBalance({ ...req.body, cardId: req.params.id })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/cards/:id/transfer', async (req, res) => {
  try { res.json(await cards.transferBalance({ ...req.body, fromCardId: req.params.id })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/cards/:id', async (req, res) => {
  try { await cards.deleteCard(req.params.id, req.body?.reason || null); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ─── Orders ──────────────────────────────────────────────────────────────────

router.get('/orders', async (req, res) => {
  try {
    res.json({ orders: await cards.listOrders({
      cardId: req.query.card || null,
      status: req.query.status || null,
      shipmentId: req.query.shipment || null,
      includeDeleted: req.query.includeDeleted === '1',
    })});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/orders', async (req, res) => {
  try { res.json(await cards.recordOrder(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/orders/:id', async (req, res) => {
  try {
    const o = await cards.getOrder(req.params.id);
    if (!o) return res.status(404).json({ error: 'Not found' });
    res.json({ order: o });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/orders/:id', async (req, res) => {
  try { await cards.deleteOrder(req.params.id, req.body?.reason || null); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ─── Shipments ───────────────────────────────────────────────────────────────

router.get('/shipments', async (req, res) => {
  try {
    res.json({ shipments: await ships.listShipments({
      status: req.query.status || null,
      includeDeleted: req.query.includeDeleted === '1',
    })});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/shipments/next-number', async (req, res) => {
  try { res.json({ shipment_number: await ships.getNextShipmentNumber() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/shipments', async (req, res) => {
  try { res.json({ shipment: await ships.createShipment(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/shipments/:id', async (req, res) => {
  try {
    const data = await ships.getShipment(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/shipments/:id/link-order', async (req, res) => {
  try { res.json(await ships.linkOrderToShipment(req.params.id, req.body?.orderId)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/shipments/:id/allocate', async (req, res) => {
  try { res.json(await ships.allocateCosts(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/shipments/:id/received', async (req, res) => {
  try { res.json(await ships.markReceived(req.params.id, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/shipments/:id', async (req, res) => {
  try { await ships.cancelShipment(req.params.id, req.body?.reason || null); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
