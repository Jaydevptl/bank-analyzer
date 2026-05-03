const express = require('express');
const router = express.Router();
const parties = require('../lib/parties');

router.get('/', async (req, res) => {
  try {
    const list = await parties.listParties({
      role: req.query.role || null,
      search: req.query.search || null,
      companyId: req.query.company || null,
      includeAll: req.query.includeAll === '1',
      includeDeleted: req.query.includeDeleted === '1',
    });
    res.json({ parties: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const p = await parties.getParty(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json({ party: p });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/ledger', async (req, res) => {
  try {
    const { from, to, limit = 200, offset = 0 } = req.query;
    res.json(await parties.getPartyLedger(req.params.id, { from, to, limit: Number(limit), offset: Number(offset) }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/summary', async (req, res) => {
  try { res.json({ summary: await parties.getPartyTransactionsSummary(req.params.id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json({ party: await parties.createParty(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try { res.json({ party: await parties.updateParty(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await parties.deleteParty(req.params.id, req.body?.reason || null);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
