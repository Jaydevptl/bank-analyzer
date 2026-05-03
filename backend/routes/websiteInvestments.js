const express = require('express');
const router = express.Router();
const w = require('../lib/websiteInvestments');

router.get('/dashboard', async (req, res) => {
  try { res.json(await w.getOverallDashboard()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try { res.json({ websites: await w.listWebsites({ companyId: req.query.company || null }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json({ website: await w.createWebsite(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const website = await w.getWebsite(req.params.id);
    if (!website) return res.status(404).json({ error: 'Not found' });
    res.json({ website });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await w.deleteWebsite(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id/summary', async (req, res) => {
  try { res.json(await w.getWebsiteSummary(req.params.id, { from: req.query.from || null, to: req.query.to || null })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id/transactions', async (req, res) => {
  try { res.json({ transactions: await w.listTransactions({ websiteId: req.params.id, from: req.query.from || null, to: req.query.to || null }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/transactions', async (req, res) => {
  try { res.json(await w.recordTransaction({ ...req.body, websiteId: req.params.id })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/transactions/:txnId', async (req, res) => {
  try { res.json(await w.deleteTransaction(req.params.txnId, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
