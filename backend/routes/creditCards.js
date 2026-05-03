const express = require('express');
const router = express.Router();
const cc = require('../lib/creditCards');

// ─── Static-prefix sub-resources first (so they don't collide with /:id) ─────

router.get('/summary/dashboard', async (req, res) => {
  try { res.json(await cc.getDashboardSummary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/transactions/:txnId', async (req, res) => {
  try { res.json(await cc.deleteCcTransaction(req.params.txnId, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/payments/:paymentId', async (req, res) => {
  try { res.json(await cc.deleteCcPayment(req.params.paymentId, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/statements/:statementId', async (req, res) => {
  try { res.json({ statement: await cc.updateStatement(req.params.statementId, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/statements/:statementId', async (req, res) => {
  try { res.json(await cc.deleteStatement(req.params.statementId, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ─── Cards collection ───────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const list = await cc.listCreditCards({
      holderId: req.query.holder || null,
      status:   req.query.status || null,
      companyId: req.query.company || null,
      includeDeleted: req.query.includeDeleted === '1',
    });
    res.json({ cards: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json(await cc.createCreditCard(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ─── Card-scoped sub-resources ──────────────────────────────────────────────

router.post('/:id/transactions', async (req, res) => {
  try {
    const { txnType = 'spend', ...rest } = req.body || {};
    const payload = { creditCardId: req.params.id, ...rest };
    let result;
    switch (txnType) {
      case 'spend':    result = await cc.recordSpend(payload); break;
      case 'refund':   result = await cc.recordRefund(payload); break;
      case 'cashback': result = await cc.recordCashback({ ...payload, earnDate: payload.txnDate }); break;
      case 'interest':
      case 'fee':      result = await cc.recordInterestOrFee({ ...payload, type: txnType }); break;
      default: throw new Error(`Unsupported txnType: ${txnType}`);
    }
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/rewards/points', async (req, res) => {
  try { res.json(await cc.recordRewardPoints({ ...req.body, creditCardId: req.params.id })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/payments', async (req, res) => {
  try { res.json(await cc.recordPayment({ ...req.body, creditCardId: req.params.id })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/statements', async (req, res) => {
  try { res.json({ statement: await cc.createStatement({ ...req.body, creditCardId: req.params.id }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ─── Card item ──────────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const data = await cc.getCreditCard(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try { res.json({ card: await cc.updateCardMeta(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await cc.deleteCreditCard(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
