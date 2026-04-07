/**
 * Upload Route
 * POST /api/upload
 * - Duplicate detection
 * - Backup + pending copies for unique entries
 * - Upload report generation
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { parseCSV } = require('../services/parsers/csvParser');
const { parseXLSXAsync } = require('../services/parsers/xlsxParser');
const { parsePDF } = require('../services/parsers/pdfParser');
const { detectBank, extractAccountNumber, extractAccountHolder } = require('../services/bankDetector');
const { normalizeRow } = require('../services/normalizer');
const { categorize } = require('../services/categorizer');
const supabase = require('../lib/supabase');
const { toDb } = require('../lib/mapper');

// ─── Load file passwords from DB (with hardcoded fallback) ───────────────────

// Loads file passwords from Supabase app_settings (key='file_passwords').
// Store as JSON array, e.g.:
//   INSERT INTO app_settings (key, value)
//   VALUES ('file_passwords', '["yourpassword1","yourpassword2"]');
async function getFilePasswords() {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'file_passwords')
      .single();
    if (data && data.value) {
      const parsed = JSON.parse(data.value);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

// ─── Ensure saved-files directory exists ──────────────────────────────────────

const SAVED_DIR = path.join(__dirname, '..', 'saved-files');
if (!fs.existsSync(SAVED_DIR)) fs.mkdirSync(SAVED_DIR, { recursive: true });

// ─── Multer Setup ──────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${base}_${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.csv', '.xlsx', '.xls', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  allowed.includes(ext) ? cb(null, true) : cb(new Error(`File type "${ext}" not supported.`), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Duplicate Check Helper ───────────────────────────────────────────────────

async function findDuplicate(txn) {
  // Look for existing transaction with same date + similar amount + similar description
  const dateStr = txn.date instanceof Date ? txn.date.toISOString() : txn.date;
  const dateOnly = dateStr.substring(0, 10); // YYYY-MM-DD

  let query = supabase
    .from('transactions')
    .select('id, description, date, debit, credit, status')
    .gte('date', dateOnly + 'T00:00:00')
    .lte('date', dateOnly + 'T23:59:59')
    .in('status', ['pending', 'verified', 'backup']);

  // Match on amount
  if (txn.debit > 0) {
    query = query.eq('debit', txn.debit);
  } else if (txn.credit > 0) {
    query = query.eq('credit', txn.credit);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) return null;

  // Check for similar description (first 20 chars match OR reference number)
  const txnDescPrefix = (txn.description || '').substring(0, 20).toLowerCase();

  for (const existing of data) {
    const existingPrefix = (existing.description || '').substring(0, 20).toLowerCase();
    if (txnDescPrefix === existingPrefix) {
      return existing.id;
    }
    // Reference number match
    if (txn.referenceNo && txn.referenceNo.length > 2) {
      if ((existing.description || '').includes(txn.referenceNo)) {
        return existing.id;
      }
    }
  }

  return null;
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

router.post('/', upload.array('files', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded.' });
  }

  const uploadId = `upload_${Date.now()}`;
  const fileReports = [];
  const globalErrors = [];

  // Load passwords from DB for protected files
  const filePasswords = await getFilePasswords();

  for (const file of req.files) {
    try {
      const report = await processFile(file, uploadId, filePasswords);
      fileReports.push(report);
    } catch (err) {
      globalErrors.push({ file: file.originalname, error: err.message });
      fileReports.push({
        fileName: file.originalname,
        bankName: 'Unknown',
        accountHolder: '',
        accountNumber: '',
        templateUsed: 'Unknown',
        totalRows: 0,
        uniqueEntries: 0,
        duplicates: 0,
        errors: 1,
        errorDetails: [err.message],
        duplicateDetails: [],
      });
    } finally {
      // Save a permanent copy then clean up temp
      try {
        const savedName = `${uploadId}_${file.originalname}`;
        const savedPath = path.join(SAVED_DIR, savedName);
        fs.copyFileSync(file.path, savedPath);
        // Add saved filename to the last report
        const lastReport = fileReports[fileReports.length - 1];
        if (lastReport) lastReport.savedFileName = savedName;
      } catch {}
      try { fs.unlinkSync(file.path); } catch {}
    }
  }

  // Build upload report
  const totalEntries = fileReports.reduce((s, r) => s + r.totalRows, 0);
  const totalUnique = fileReports.reduce((s, r) => s + r.uniqueEntries, 0);
  const totalDuplicates = fileReports.reduce((s, r) => s + r.duplicates, 0);
  const totalErrors = fileReports.reduce((s, r) => s + r.errors, 0);

  // Save upload report to Supabase
  const { error: reportError } = await supabase
    .from('upload_reports')
    .insert({
      upload_id: uploadId,
      total_files: req.files.length,
      total_entries: totalEntries,
      total_unique: totalUnique,
      total_duplicates: totalDuplicates,
      total_errors: totalErrors,
      files: fileReports,
    });

  if (reportError) {
    console.error('Failed to save upload report:', reportError.message);
  }

  res.json({
    success: true,
    uploadId,
    summary: {
      totalFiles: req.files.length,
      totalEntries,
      totalUnique,
      totalDuplicates,
      totalErrors,
    },
    files: fileReports,
    errors: globalErrors,
  });
});

// ─── File Processing ───────────────────────────────────────────────────────────

async function processFile(file, uploadId, filePasswords) {
  const ext = path.extname(file.originalname).toLowerCase();
  let rows = [], rawContent = '';

  if (ext === '.csv')                         ({ rows, rawContent } = parseCSV(file.path));
  else if (ext === '.xlsx' || ext === '.xls') ({ rows, rawContent } = await parseXLSXAsync(file.path, filePasswords));
  else if (ext === '.pdf')                    ({ rows, rawContent } = await parsePDF(file.path, filePasswords));
  else throw new Error(`Unsupported file type: ${ext}`);

  const contentForDetection = rawContent || rows.map(r => Object.values(r).join(' ')).join('\n');
  const bankInfo = detectBank(contentForDetection);
  const bankKey = bankInfo?.key || 'UNKNOWN';
  const bankName = bankInfo?.name || 'Unknown Bank';
  const columnMap = bankInfo?.columnMap || null;
  const amountType = bankInfo?.amountType || null;
  const accountNumber = extractAccountNumber(rawContent || '');
  const accountHolder = extractAccountHolder(rawContent || '');

  const report = {
    fileName: file.originalname,
    bankName,
    accountHolder,
    accountNumber,
    templateUsed: bankKey,
    totalRows: 0,
    uniqueEntries: 0,
    duplicates: 0,
    errors: 0,
    errorDetails: [],
    duplicateDetails: [],
  };

  const toInsert = [];

  for (const row of rows) {
    try {
      const normalized = normalizeRow(row, bankKey, columnMap, amountType);
      if (!normalized?.date) continue;
      if (normalized.debit === 0 && normalized.credit === 0) continue;

      report.totalRows++;

      const txn = {
        ...normalized,
        bankName,
        accountNumber,
        accountName: accountHolder,
        accountHolder,
        referenceNo: normalized.referenceNo || '',
        uploadId,
        uploadSessionId: uploadId,
        sourceFile: file.originalname,
        category: categorize(normalized.description),
        rawData: row,
      };

      // Check for duplicate
      const duplicateOfId = await findDuplicate(txn);

      if (duplicateOfId) {
        // Save as duplicate
        report.duplicates++;
        report.duplicateDetails.push({
          description: txn.description,
          amount: txn.debit || txn.credit,
          date: txn.date,
          matchedWith: duplicateOfId,
        });

        toInsert.push({
          ...txn,
          status: 'duplicate',
          duplicateOf: duplicateOfId,
        });
      } else {
        // Save backup (immutable)
        toInsert.push({
          ...txn,
          status: 'backup',
        });
        // Save pending (working copy)
        toInsert.push({
          ...txn,
          status: 'pending',
        });
        report.uniqueEntries++;
      }
    } catch (err) {
      report.errors++;
      report.errorDetails.push(`Row parse error: ${err.message}`);
    }
  }

  if (toInsert.length === 0) {
    throw new Error(`No transactions found in "${file.originalname}". The file may have zero transactions for this period, or the format is unsupported.`);
  }

  // Batch insert in chunks of 500
  const CHUNK_SIZE = 500;
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from('transactions')
      .insert(chunk.map(toDb));

    if (error) {
      report.errors++;
      report.errorDetails.push(`DB insert error: ${error.message}`);
      throw new Error(`DB insert failed: ${error.message}`);
    }
  }

  return report;
}

module.exports = router;
