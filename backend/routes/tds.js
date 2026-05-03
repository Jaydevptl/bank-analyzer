const express = require('express');
const router = express.Router();
const t = require('../lib/tds');

router.get('/summary', async (req, res) => {
  try { res.json(await t.getTdsSummary({ financialYear: req.query.fy || null })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try { res.json({ records: await t.listTdsRecords({
    tdsType: req.query.type || null,
    partyId: req.query.party || null,
    companyId: req.query.company || null,
    financialYear: req.query.fy || null,
    quarter: req.query.quarter || null,
  }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json(await t.recordTds(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/deposit', async (req, res) => {
  try { res.json(await t.depositTds(req.params.id, req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await t.cancelTds(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
