const express = require('express');
const router = express.Router();
const fa = require('../lib/fixedAssets');

router.get('/', async (req, res) => {
  try {
    const list = await fa.listFixedAssets({
      status: req.query.status || 'active',
      companyId: req.query.companyId || null,
      includeAll: req.query.includeAll === '1',
    });
    res.json({ assets: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const asset = await fa.getFixedAsset(req.params.id);
    if (!asset) return res.status(404).json({ error: 'Not found' });
    res.json({ asset });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json(await fa.createFixedAsset(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/depreciate', async (req, res) => {
  try { res.json(await fa.depreciateAsset(req.params.id, req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/appreciate', async (req, res) => {
  try { res.json(await fa.appreciateAsset(req.params.id, req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id/history', async (req, res) => {
  try {
    const h = await fa.getAssetHistory(req.params.id);
    if (!h) return res.status(404).json({ error: 'Not found' });
    res.json(h);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try { res.json({ asset: await fa.updateFixedAsset(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await fa.deleteFixedAsset(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/adjustments/:adjustmentId', async (req, res) => {
  try { res.json(await fa.deleteAssetAdjustment(req.params.adjustmentId, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
