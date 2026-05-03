const express = require('express');
const router = express.Router();
const si = require('../lib/saleInvoices');

// Order matters: more specific paths before /:id
router.get('/summary', async (req, res) => {
  try { res.json({ summary: await si.getInvoiceSummary() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/next-number', async (req, res) => {
  try { res.json({ invoice_number: await si.getNextInvoiceNumber() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/customer/:partyId/outstanding', async (req, res) => {
  try { res.json({ outstanding: await si.getCustomerOutstanding(req.params.partyId) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/payments/:paymentId', async (req, res) => {
  try {
    await si.deletePayment(req.params.paymentId, req.body?.reason || null);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try {
    const list = await si.listInvoices({
      customerId: req.query.customer || null,
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
  try { res.json(await si.createInvoice(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const detail = await si.getInvoice(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Not found' });
    res.json(detail);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try { res.json({ invoice: await si.updateInvoiceMeta(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await si.cancelInvoice(req.params.id, req.body?.reason || null);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id/payments', async (req, res) => {
  try { res.json({ payments: await si.listPayments(req.params.id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/payments', async (req, res) => {
  try { res.json(await si.recordPayment({ ...req.body, invoiceId: req.params.id })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
