/**
 * Backup Route
 * GET  /api/backup/export  - Download a ZIP with all data + files
 * POST /api/backup/import  - Restore from a ZIP file
 *
 * The backup ZIP contains:
 *   /credentials.json
 *   /transactions.json
 *   /trades.json
 *   /upload_reports.json
 *   /trade_upload_reports.json
 *   /app_settings.json
 *   /files/* (all original uploaded bank statements)
 *   /README.txt
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const multer = require('multer');
const unzipper = require('unzipper');
const supabase = require('../lib/supabase');

const SAVED_DIR = path.join(__dirname, '..', 'saved-files');
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(SAVED_DIR)) fs.mkdirSync(SAVED_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max for restore
});

// ─── Export Backup (ZIP everything) ───────────────────────────────────────────

router.get('/export', async (req, res) => {
  try {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const filename = `banklens_backup_${timestamp}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => { throw err; });
    archive.pipe(res);

    // Fetch all tables
    const fetchTable = async (name) => {
      const { data, error } = await supabase.from(name).select('*');
      if (error) {
        console.error(`Failed to fetch ${name}:`, error.message);
        return [];
      }
      return data || [];
    };

    const [
      transactions,
      trades,
      credentials,
      uploadReports,
      tradeUploadReports,
      appSettings,
      recycleBin,
    ] = await Promise.all([
      fetchTable('transactions'),
      fetchTable('trades'),
      fetchTable('credentials'),
      fetchTable('upload_reports'),
      fetchTable('trade_upload_reports'),
      fetchTable('app_settings'),
      fetchTable('recycle_bin'),
    ]);

    // Add JSON files to archive
    archive.append(JSON.stringify(transactions, null, 2), { name: 'transactions.json' });
    archive.append(JSON.stringify(trades, null, 2), { name: 'trades.json' });
    archive.append(JSON.stringify(credentials, null, 2), { name: 'credentials.json' });
    archive.append(JSON.stringify(uploadReports, null, 2), { name: 'upload_reports.json' });
    archive.append(JSON.stringify(tradeUploadReports, null, 2), { name: 'trade_upload_reports.json' });
    archive.append(JSON.stringify(appSettings, null, 2), { name: 'app_settings.json' });
    archive.append(JSON.stringify(recycleBin, null, 2), { name: 'recycle_bin.json' });

    // Add saved files
    if (fs.existsSync(SAVED_DIR)) {
      archive.directory(SAVED_DIR, 'files');
    }

    // Manifest
    const manifest = {
      backupVersion: '1.0',
      createdAt: new Date().toISOString(),
      counts: {
        transactions: transactions.length,
        trades: trades.length,
        credentials: credentials.length,
        uploadReports: uploadReports.length,
        tradeUploadReports: tradeUploadReports.length,
        appSettings: appSettings.length,
        recycleBin: recycleBin.length,
      },
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    // README
    const readme = `BankLens Backup
================

Created: ${new Date().toLocaleString()}

Contents:
  - transactions.json       All bank transactions (${transactions.length})
  - trades.json             All trades (${trades.length})
  - credentials.json        Bank login credentials (${credentials.length})
  - upload_reports.json     Bank upload reports (${uploadReports.length})
  - trade_upload_reports.json  Trade upload reports (${tradeUploadReports.length})
  - app_settings.json       App settings incl. file passwords
  - recycle_bin.json        Recycle bin items (${recycleBin.length})
  - manifest.json           Backup metadata
  - files/                  Original uploaded bank statement files

To restore:
  1. Open the BankLens app
  2. Go to Backup page
  3. Click "Restore from Backup"
  4. Select this ZIP file
  5. Confirm overwrite warning

WARNING: This file contains sensitive financial data and credentials.
         Store it in a secure location (encrypted folder, password-protected drive, etc.)
`;
    archive.append(readme, { name: 'README.txt' });

    await archive.finalize();
  } catch (err) {
    console.error('Backup export error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// ─── Import Backup (restore from ZIP) ─────────────────────────────────────────

router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const zipPath = req.file.path;
  const extractDir = path.join(UPLOAD_DIR, `restore_${Date.now()}`);

  try {
    // Extract ZIP
    fs.mkdirSync(extractDir, { recursive: true });
    await fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractDir }))
      .promise();

    // Load JSONs
    const loadJson = (name) => {
      const fp = path.join(extractDir, name);
      if (!fs.existsSync(fp)) return [];
      try {
        return JSON.parse(fs.readFileSync(fp, 'utf-8'));
      } catch {
        return [];
      }
    };

    const transactions = loadJson('transactions.json');
    const trades = loadJson('trades.json');
    const credentials = loadJson('credentials.json');
    const uploadReports = loadJson('upload_reports.json');
    const tradeUploadReports = loadJson('trade_upload_reports.json');
    const appSettings = loadJson('app_settings.json');
    const recycleBin = loadJson('recycle_bin.json');

    const counts = {
      transactions: 0,
      trades: 0,
      credentials: 0,
      uploadReports: 0,
      tradeUploadReports: 0,
      appSettings: 0,
      recycleBin: 0,
      files: 0,
    };

    const errors = [];

    // Restore tables (chunked inserts using upsert on id)
    const restoreTable = async (name, data, key = 'id') => {
      if (!Array.isArray(data) || data.length === 0) return 0;
      const CHUNK = 500;
      let restored = 0;
      for (let i = 0; i < data.length; i += CHUNK) {
        const chunk = data.slice(i, i + CHUNK);
        const { error } = await supabase.from(name).upsert(chunk, { onConflict: key });
        if (error) {
          errors.push(`${name}: ${error.message}`);
        } else {
          restored += chunk.length;
        }
      }
      return restored;
    };

    counts.transactions = await restoreTable('transactions', transactions);
    counts.trades = await restoreTable('trades', trades);
    counts.credentials = await restoreTable('credentials', credentials);
    counts.uploadReports = await restoreTable('upload_reports', uploadReports);
    counts.tradeUploadReports = await restoreTable('trade_upload_reports', tradeUploadReports);
    counts.appSettings = await restoreTable('app_settings', appSettings, 'key');
    counts.recycleBin = await restoreTable('recycle_bin', recycleBin);

    // Restore files
    const filesDir = path.join(extractDir, 'files');
    if (fs.existsSync(filesDir)) {
      const files = fs.readdirSync(filesDir);
      for (const f of files) {
        try {
          const src = path.join(filesDir, f);
          const dest = path.join(SAVED_DIR, f);
          fs.copyFileSync(src, dest);
          counts.files++;
        } catch (err) {
          errors.push(`File ${f}: ${err.message}`);
        }
      }
    }

    res.json({ success: true, counts, errors });
  } catch (err) {
    console.error('Backup import error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    // Cleanup
    try { fs.unlinkSync(zipPath); } catch {}
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
  }
});

// ─── Backup Stats (preview before download) ───────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const counts = {};
    const tables = ['transactions', 'trades', 'credentials', 'upload_reports', 'trade_upload_reports', 'recycle_bin'];
    for (const t of tables) {
      const { count } = await supabase.from(t).select('id', { count: 'exact', head: true });
      counts[t] = count || 0;
    }

    let fileCount = 0;
    let totalSize = 0;
    if (fs.existsSync(SAVED_DIR)) {
      const files = fs.readdirSync(SAVED_DIR);
      fileCount = files.length;
      for (const f of files) {
        try {
          const stat = fs.statSync(path.join(SAVED_DIR, f));
          totalSize += stat.size;
        } catch {}
      }
    }

    res.json({
      counts,
      files: { count: fileCount, totalSize },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
