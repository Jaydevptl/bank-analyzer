const express = require('express');
const router = express.Router();
const p = require('../lib/partnerships');

router.get('/dashboard', async (req, res) => {
  try { res.json(await p.getPartnerDashboard()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try { res.json({ partnerships: await p.listPartnerships({ companyId: req.query.company || null }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try { res.json({ partnership: await p.createPartnership(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const data = await p.getPartnershipDetail(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await p.deletePartnership(req.params.id, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/members', async (req, res) => {
  try { res.json({ member: await p.addMember({ ...req.body, partnershipId: req.params.id }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/members/:memberId', async (req, res) => {
  try { res.json(await p.removeMember(req.params.memberId, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/distribute', async (req, res) => {
  try { res.json(await p.createDistribution({ ...req.body, partnershipId: req.params.id })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/distributions/:distId', async (req, res) => {
  try {
    const d = await p.getDistribution(req.params.distId);
    if (!d) return res.status(404).json({ error: 'Not found' });
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/distributions/:distId/pay', async (req, res) => {
  try { res.json(await p.markDistributionPaid(req.params.distId, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/distributions/:distId', async (req, res) => {
  try { res.json(await p.cancelDistribution(req.params.distId, req.body?.reason || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
