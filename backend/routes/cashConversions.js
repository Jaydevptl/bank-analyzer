const express = require('express');
const router = express.Router();
const cc = require('../lib/cashConversions');

router.get('/summary', async (req, res) => {
  try { res.json({ summary: await cc.getConversionSummary() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/next-number', async (req, res) => {
  try { res.json({ conversion_number: await cc.getNextConversionNumber() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try {
    const list = await cc.listConversions({
      vendorId: req.query.vendor || null,
      status: req.query.status || null,
      companyId: req.query.company || null,
      from: req.query.from || null,
      to: req.query.to || null,
      includeDeleted: req.query.includeDeleted === '1',
    });
    res.json({ conversions: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json(await cc.createConversion(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const detail = await cc.getConversion(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Not found' });
    res.json(detail);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try { res.json({ conversion: await cc.updateConversionMeta(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await cc.cancelConversion(req.params.id, req.body?.reason || null);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/cash-received', async (req, res) => {
  try { res.json({ conversion: await cc.markCashReceived(req.params.id, req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/gst-invoice-received', async (req, res) => {
  try { res.json(await cc.markGstInvoiceReceived(req.params.id, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
