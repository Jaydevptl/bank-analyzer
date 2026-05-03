const express = require('express');
const router = express.Router();
const ic = require('../lib/intercompany');

router.get('/dashboard', async (req, res) => {
  try { res.json(await ic.getIntercompanyDashboard()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Transfers
router.get('/transfers/next-number', async (req, res) => {
  try { res.json({ transfer_number: await ic.nextTransferNumber() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/transfers', async (req, res) => {
  try { res.json({ transfers: await ic.listTransfers({
    companyId: req.query.company || null,
    fromCompany: req.query.from || null,
    toCompany: req.query.to || null,
  }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/transfers', async (req, res) => {
  try { res.json(await ic.createTransfer(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/transfers/:id', async (req, res) => {
  try { res.json(await ic.cancelTransfer(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Drawings
router.get('/drawings/next-number', async (req, res) => {
  try { res.json({ drawing_number: await ic.nextDrawingNumber() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/drawings', async (req, res) => {
  try { res.json({ drawings: await ic.listDrawings({
    ownerPartyId: req.query.owner || null,
    companyId: req.query.company || null,
    drawingType: req.query.type || null,
  }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/drawings', async (req, res) => {
  try { res.json(await ic.recordDrawing(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/drawings/:id', async (req, res) => {
  try { res.json(await ic.cancelDrawing(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
