const express = require('express');
const router = express.Router();
const s = require('../lib/salary');

router.get('/summary', async (req, res) => {
  try { res.json(await s.getSalarySummary({
    companyId: req.query.company || null,
    from: req.query.from || null,
    to: req.query.to || null,
  })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try { res.json({ records: await s.listSalaryRecords({
    employeeId: req.query.employee || null,
    month: req.query.month || null,
    companyId: req.query.company || null,
  }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json(await s.recordSalary(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await s.cancelSalary(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
