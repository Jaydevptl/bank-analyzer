const express = require('express');
const router = express.Router();
const sr = require('../lib/saleReturns');

router.get('/summary', async (req, res) => {
  try { res.json(await sr.getReturnsSummary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try { res.json({ returns: await sr.listReturns({
    customerId: req.query.customer || null,
    invoiceId: req.query.invoice || null,
    status: req.query.status || null,
  }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json(await sr.createReturn(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await sr.getReturn(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await sr.cancelReturn(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
