const express = require('express');
const router = express.Router();
const r = require('../lib/reports');

router.get('/profit-loss', async (req, res) => {
  try { res.json(await r.getProfitAndLoss({
    companyId: req.query.company || null,
    from: req.query.from || null,
    to: req.query.to || null,
  })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/balance-sheet', async (req, res) => {
  try { res.json(await r.getBalanceSheet({
    companyId: req.query.company || null,
    asOfDate: req.query.as_of || null,
  })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/cash-flow', async (req, res) => {
  try { res.json(await r.getCashFlow({
    companyId: req.query.company || null,
    from: req.query.from || null,
    to: req.query.to || null,
  })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/trial-balance', async (req, res) => {
  try { res.json(await r.getTrialBalance({
    companyId: req.query.company || null,
    asOfDate: req.query.as_of || null,
  })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/tax', async (req, res) => {
  try { res.json(await r.getTaxReport({
    companyId: req.query.company || null,
    financialYear: req.query.fy || null,
  })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/day-book', async (req, res) => {
  try { res.json(await r.getDayBook({
    companyId: req.query.company || null,
    date: req.query.date || null,
  })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/ledger', async (req, res) => {
  try { res.json(await r.getLedgerReport({
    accountCode: req.query.account || null,
    from: req.query.from || null,
    to: req.query.to || null,
  })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/receivables', async (req, res) => {
  try { res.json(await r.getReceivablesReport({ companyId: req.query.company || null })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/payables', async (req, res) => {
  try { res.json(await r.getPayablesReport({ companyId: req.query.company || null })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
