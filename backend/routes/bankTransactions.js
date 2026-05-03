const express = require('express');
const router = express.Router();
const bt = require('../lib/bankTransactions');

router.post('/deposit', async (req, res) => {
  try { res.json(await bt.recordDeposit(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/withdraw', async (req, res) => {
  try { res.json(await bt.recordWithdrawal(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/transfer', async (req, res) => {
  try { res.json(await bt.recordTransfer(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/charge', async (req, res) => {
  try { res.json(await bt.recordBankCharge(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/interest', async (req, res) => {
  try { res.json(await bt.recordInterestEarned(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/:txnGroupId', async (req, res) => {
  try { res.json(await bt.updateBankTransactionMeta(req.params.txnGroupId, req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:txnGroupId', async (req, res) => {
  try { res.json(await bt.deleteBankTransaction(req.params.txnGroupId, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
