const express = require('express');
const router = express.Router();
const r = require('../lib/recurringExpenses');

router.get('/summary', async (req, res) => {
  try { res.json(await r.getRecurringSummary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/generate-due', async (req, res) => {
  try { res.json(await r.generateDueExpenses(req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try { res.json({ items: await r.listRecurring({
    companyId: req.query.company || null,
    isActive: req.query.active === 'true' ? true : req.query.active === 'false' ? false : null,
  }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json({ item: await r.createRecurring(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try { res.json({ item: await r.updateRecurring(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await r.deleteRecurring(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
