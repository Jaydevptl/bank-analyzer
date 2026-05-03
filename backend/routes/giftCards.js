const express = require('express');
const router = express.Router();
const gc = require('../lib/giftCards');

// Platforms
router.get('/platforms', async (req, res) => {
  try { res.json({ platforms: await gc.listPlatforms() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/platforms', async (req, res) => {
  try { res.json({ platform: await gc.createPlatform(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Summary
router.get('/summary/platform-wise', async (req, res) => {
  try { res.json({ summary: await gc.getPlatformSummary() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Cards
router.get('/', async (req, res) => {
  try {
    const list = await gc.listGiftCards({
      platformId: req.query.platform || null,
      status:     req.query.status   || null,
      companyId:  req.query.company  || null,
      includeDeleted: req.query.includeDeleted === '1',
    });
    res.json({ cards: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Static-prefix sub-resources (must come before /:id)
router.delete('/usages/:usageId', async (req, res) => {
  try { res.json(await gc.deleteUsage(req.params.usageId, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/transfers', async (req, res) => {
  try { res.json(await gc.recordTransfer(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/transfers/:transferId', async (req, res) => {
  try { res.json(await gc.deleteTransfer(req.params.transferId, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const data = await gc.getGiftCard(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json(await gc.createGiftCard(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try { res.json({ card: await gc.updateGiftCardMeta(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await gc.deleteGiftCard(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/usages', async (req, res) => {
  try { res.json(await gc.recordUsage({ ...req.body, giftCardId: req.params.id })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
