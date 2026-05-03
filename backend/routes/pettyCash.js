const express = require('express');
const router = express.Router();
const p = require('../lib/pettyCash');

router.get('/summary', async (req, res) => {
  try { res.json(await p.getPettyCashSummary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/staff/:staffId/balance', async (req, res) => {
  try { res.json(await p.getStaffPettyCashBalance(req.params.staffId)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try { res.json({ records: await p.listPettyCash({
    staffId: req.query.staff || null,
    txnType: req.query.type || null,
    from: req.query.from || null,
    to: req.query.to || null,
  }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json(await p.recordPettyCash(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await p.deletePettyCash(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
