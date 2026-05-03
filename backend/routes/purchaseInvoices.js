const express = require('express');
const router = express.Router();
const pi = require('../lib/purchaseInvoices');

router.get('/summary', async (req, res) => {
  try { res.json({ summary: await pi.getPurchaseSummary() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/next-number', async (req, res) => {
  try { res.json({ bill_number: await pi.getNextBillNumber() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/supplier/:partyId/payable', async (req, res) => {
  try { res.json({ payable: await pi.getSupplierPayable(req.params.partyId) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/payments/:paymentId', async (req, res) => {
  try {
    await pi.deletePayment(req.params.paymentId, req.body?.reason || null);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try {
    const list = await pi.listPurchaseInvoices({
      supplierId: req.query.supplier || null,
      status: req.query.status || null,
      companyId: req.query.company || null,
      from: req.query.from || null,
      to: req.query.to || null,
      search: req.query.search || null,
      includeDeleted: req.query.includeDeleted === '1',
    });
    res.json({ invoices: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json(await pi.createPurchaseInvoice(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const detail = await pi.getPurchaseInvoice(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Not found' });
    res.json(detail);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try { res.json({ invoice: await pi.updatePurchaseInvoiceMeta(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pi.cancelPurchaseInvoice(req.params.id, req.body?.reason || null);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id/payments', async (req, res) => {
  try { res.json({ payments: await pi.listPayments(req.params.id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/payments', async (req, res) => {
  try { res.json(await pi.recordPayment({ ...req.body, invoiceId: req.params.id })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
