const express = require('express');
const router = express.Router();
const c = require('../lib/companies');

router.get('/', async (req, res) => {
  try { res.json({ companies: await c.listCompanies({ includeAll: req.query.all === 'true' }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const company = await c.getCompany(req.params.id);
    if (!company) return res.status(404).json({ error: 'Not found' });
    res.json({ company });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json({ company: await c.createCompany(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try { res.json({ company: await c.updateCompany(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await c.deleteCompany(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
