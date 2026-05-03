const express = require('express');
const router = express.Router();
const ba = require('../lib/bankAccounts');
const bt = require('../lib/bankTransactions');

router.get('/', async (req, res) => {
  try {
    const { companyId, includeInactive } = req.query;
    const list = await ba.listBankAccounts({
      companyId: companyId || null,
      activeOnly: includeInactive !== '1',
    });
    res.json({ accounts: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const acc = await ba.getBankAccount(req.params.id);
    if (!acc) return res.status(404).json({ error: 'Not found' });
    res.json({ account: acc });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const created = await ba.createBankAccount(req.body);
    res.json(created);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await ba.updateBankAccount(req.params.id, req.body);
    res.json({ account: updated });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const updated = await ba.updateBankAccount(req.params.id, req.body);
    res.json({ account: updated });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await ba.deleteBankAccount(req.params.id, req.body?.reason || null);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/deactivate', async (req, res) => {
  try {
    await ba.deactivateBankAccount(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id/ledger', async (req, res) => {
  try {
    const { from, to, limit = 100, offset = 0 } = req.query;
    const result = await bt.getBankLedger(req.params.id, {
      from, to, limit: Number(limit), offset: Number(offset),
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
