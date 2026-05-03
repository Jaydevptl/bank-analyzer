const express = require('express');
const router = express.Router();
const d = require('../lib/documents');

router.get('/search', async (req, res) => {
  try { res.json({ documents: await d.searchDocuments({
    query: req.query.q || null,
    tags: req.query.tags ? req.query.tags.split(',').map(t => t.trim()).filter(Boolean) : null,
  }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try { res.json({ documents: await d.listDocuments({
    entityType: req.query.entity_type || null,
    entityId:   req.query.entity_id   || null,
    tags: req.query.tags ? req.query.tags.split(',').map(t => t.trim()).filter(Boolean) : null,
  }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json({ document: await d.uploadDocument(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const doc = await d.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ document: doc });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await d.deleteDocument(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
