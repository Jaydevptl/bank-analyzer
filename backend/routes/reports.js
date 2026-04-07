/**
 * Reports Route
 * GET /api/reports                    - List all upload reports
 * GET /api/reports/:uploadId          - Get single report
 * GET /api/reports/download/:fileName - Download original uploaded file
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const supabase = require('../lib/supabase');
const { fromDbReport } = require('../lib/mapper');

const SAVED_DIR = path.join(__dirname, '..', 'saved-files');

// ─── List All Reports ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('upload_reports')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    res.json({ reports: (data || []).map(fromDbReport) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Download Original File ───────────────────────────────────────────────────

router.get('/download/:fileName', (req, res) => {
  try {
    const fileName = req.params.fileName;
    // Prevent directory traversal
    const safeName = path.basename(fileName);
    const filePath = path.join(SAVED_DIR, safeName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Extract original name (remove uploadId prefix)
    const originalName = safeName.replace(/^upload_\d+_/, '');

    res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete Report (move to recycle bin) ──────────────────────────────────────

router.delete('/:uploadId', async (req, res) => {
  try {
    const { data: report, error: fetchErr } = await supabase
      .from('upload_reports')
      .select('*')
      .eq('upload_id', req.params.uploadId)
      .single();

    if (fetchErr || !report) return res.status(404).json({ error: 'Report not found' });

    // Move to recycle bin
    await supabase.from('recycle_bin').insert({
      original_id: report.id,
      item_type: 'report',
      data: report,
    });

    // Delete from upload_reports
    await supabase.from('upload_reports').delete().eq('upload_id', req.params.uploadId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get Single Report ────────────────────────────────────────────────────────

router.get('/:uploadId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('upload_reports')
      .select('*')
      .eq('upload_id', req.params.uploadId)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Report not found' });

    res.json({ report: fromDbReport(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
