const express = require('express');
const router = express.Router();
const g = require('../lib/gst');

router.get('/summary', async (req, res) => {
  try { res.json(await g.getGstSummary({ financialYear: req.query.fy || null })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try { res.json({ records: await g.listGstRecords({
    companyId: req.query.company || null,
    returnType: req.query.type || null,
    financialYear: req.query.fy || null,
  }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json({ record: await g.recordGstReturn(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/file', async (req, res) => {
  try { res.json({ record: await g.fileGstReturn(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/pay', async (req, res) => {
  try { res.json(await g.payGst(req.params.id, req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await g.cancelGst(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
