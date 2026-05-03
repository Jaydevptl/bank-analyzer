const express = require('express');
const router = express.Router();
const sm = require('../lib/shareMarket');

// Brokers
router.get('/brokers', async (req, res) => {
  try { res.json({ brokers: await sm.listBrokers() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/brokers', async (req, res) => {
  try { res.json({ broker: await sm.createBroker(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Dashboard (must come before /accounts/:id-style)
router.get('/dashboard', async (req, res) => {
  try { res.json(await sm.getOverallDashboard()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Holdings
router.post('/holdings/bulk-update-prices', async (req, res) => {
  try { res.json(await sm.bulkUpdatePrices(req.body?.updates || [])); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/holdings/:holdingId/update-price', async (req, res) => {
  try { res.json({ holding: await sm.updatePrice({ holdingId: req.params.holdingId, currentPrice: req.body?.currentPrice }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Transactions (deletion of arbitrary txn by id)
router.delete('/transactions/:txnId', async (req, res) => {
  try {
    await sm.deleteTransaction(req.params.txnId, req.body?.reason || null);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Accounts
router.get('/accounts', async (req, res) => {
  try {
    res.json({ accounts: await sm.listBrokerAccounts({
      brokerId: req.query.broker || null,
      includeDeleted: req.query.includeDeleted === '1',
    }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/accounts', async (req, res) => {
  try { res.json(await sm.createBrokerAccount(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/accounts/:id', async (req, res) => {
  try {
    const detail = await sm.getBrokerAccount(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Not found' });
    res.json(detail);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/accounts/:id', async (req, res) => {
  try {
    await sm.deleteBrokerAccount(req.params.id, req.body?.reason || null);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/accounts/:id/buy', async (req, res) => {
  try { res.json(await sm.recordBuy({ ...req.body, brokerAccountId: req.params.id })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/accounts/:id/sell', async (req, res) => {
  try { res.json(await sm.recordSell({ ...req.body, brokerAccountId: req.params.id })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/accounts/:id/dividend', async (req, res) => {
  try { res.json(await sm.recordDividend({ ...req.body, brokerAccountId: req.params.id })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/accounts/:id/transactions', async (req, res) => {
  try {
    const detail = await sm.getBrokerAccount(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Not found' });
    res.json({ transactions: detail.transactions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/accounts/:id/pnl', async (req, res) => {
  try {
    res.json(await sm.getRealizedPnL({
      brokerAccountId: req.params.id,
      from: req.query.from || null,
      to: req.query.to || null,
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
