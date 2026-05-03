const express = require('express');
const router = express.Router();
const su = require('../lib/statementUpload');

router.get('/', async (req, res) => {
  try {
    const list = await su.listUploads({
      accountId:  req.query.account || null,
      status:     req.query.status || null,
      uploadType: req.query.uploadType || null,
      includeDeleted: req.query.includeDeleted === '1',
    });
    res.json({ uploads: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Frontend reads file as text (FileReader) then POSTs JSON: { uploadType, accountId, fileName, csvContent, companyId? }
router.post('/', async (req, res) => {
  try {
    const { uploadType, accountId, fileName, csvContent, companyId } = req.body || {};
    if (!csvContent) return res.status(400).json({ error: 'csvContent required' });
    res.json(await su.parseCSV({ uploadType, accountId, fileName, csvContent, companyId }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/transactions/:txnId', async (req, res) => {
  try { res.json({ transaction: await su.updateTransaction(req.params.txnId, req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const detail = await su.getUploadDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Not found' });
    res.json(detail);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/import', async (req, res) => {
  try { res.json(await su.importTransactions(req.params.id, req.body?.transactionIds || [])); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/skip', async (req, res) => {
  try { res.json(await su.skipTransactions(req.params.id, req.body?.transactionIds || [])); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await su.deleteUpload(req.params.id, req.body?.reason || null);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
