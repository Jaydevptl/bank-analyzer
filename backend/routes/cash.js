const express = require('express');
const router = express.Router();
const cash = require('../lib/cash');

router.get('/balance', async (req, res) => {
  try {
    const balance = await cash.getCashBalance(req.query.asOfDate || null);
    res.json({ balance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/ledger', async (req, res) => {
  try {
    const { from, to, limit = 100, offset = 0 } = req.query;
    const result = await cash.getCashLedger({ from, to, limit: Number(limit), offset: Number(offset) });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/deposit', async (req, res) => {
  try { res.json(await cash.recordCashDeposit(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/withdrawal', async (req, res) => {
  try { res.json(await cash.recordCashWithdrawal(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/adjustment', async (req, res) => {
  try { res.json(await cash.recordCashAdjustment(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Reverse a cash ledger group (deposit/withdrawal)
router.delete('/transaction/:txnGroupId', async (req, res) => {
  try { res.json(await cash.deleteCashTransaction(req.params.txnGroupId, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/transaction/:txnGroupId', async (req, res) => {
  try { res.json(await cash.updateCashTransaction(req.params.txnGroupId, req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/adjustment/:id', async (req, res) => {
  try { res.json(await cash.updateCashAdjustment(req.params.id, req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/adjustment/:id', async (req, res) => {
  try { res.json(await cash.deleteCashAdjustment(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
