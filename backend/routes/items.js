const express = require('express');
const router = express.Router();
const items = require('../lib/items');

router.get('/', async (req, res) => {
  try {
    const list = await items.listItems({
      type: req.query.type || null,
      category: req.query.category || null,
      status: req.query.status || 'active',
      companyId: req.query.company || null,
      search: req.query.search || null,
      includeAll: req.query.includeAll === '1',
      includeDeleted: req.query.includeDeleted === '1',
    });
    res.json({ items: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/categories/summary', async (req, res) => {
  try { res.json({ categories: await items.getCategorySummary() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const it = await items.getItem(req.params.id);
    if (!it) return res.status(404).json({ error: 'Not found' });
    res.json({ item: it });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/transactions', async (req, res) => {
  try { res.json({ transactions: await items.getItemTransactions(req.params.id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json({ item: await items.createItem(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try { res.json({ item: await items.updateItem(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await items.deleteItem(req.params.id, req.body?.reason || null);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
