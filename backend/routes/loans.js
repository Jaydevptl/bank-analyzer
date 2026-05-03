const express = require('express');
const router = express.Router();
const loans = require('../lib/loans');

router.get('/', async (req, res) => {
  try {
    const list = await loans.listLoans({
      borrowerPartyId: req.query.borrower || null,
      status:          req.query.status   || null,
      companyId:       req.query.company  || null,
    });
    res.json({ loans: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/summary/borrower-wise', async (req, res) => {
  try { res.json({ summary: await loans.getBorrowerSummary() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const loan = await loans.getLoan(req.params.id, req.query.as_of || null);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    res.json(loan);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/outstanding', async (req, res) => {
  try {
    const out = await loans.computeOutstanding(req.params.id, req.query.as_of || null);
    res.json({ outstanding: out });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id/repayments', async (req, res) => {
  try {
    const data = await loans.getLoan(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json({ repayments: data.repayments });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json(await loans.createLoan(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/repayments', async (req, res) => {
  try {
    const result = await loans.recordRepayment({ ...req.body, loanId: req.params.id });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/writeoff', async (req, res) => {
  try { res.json(await loans.writeOffLoan(req.params.id, req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/cancel', async (req, res) => {
  try { res.json(await loans.cancelDisbursement(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try { res.json({ loan: await loans.updateLoanMeta(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await loans.deleteLoan(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/repayments/:repaymentId', async (req, res) => {
  try { res.json(await loans.deleteRepayment(req.params.repaymentId, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ─── Phase 14: Schedules ─────────────────────────────────────────────────────
router.get('/summary/overview', async (req, res) => {
  try { res.json(await loans.getLoansOverview()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/generate-schedule', async (req, res) => {
  try { res.json(await loans.generateSchedule({ ...req.body, loanId: req.params.id })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id/schedule', async (req, res) => {
  try { res.json({ schedule: await loans.getSchedule(req.params.id) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/schedule/:scheduleId/pay', async (req, res) => {
  try { res.json({ installment: await loans.markInstallmentPaid(req.params.scheduleId, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
