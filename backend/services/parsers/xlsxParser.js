/**
 * XLSX Parser Service
 * Reads Excel files and returns raw row objects.
 * Uses xlsx-populate for password-protected files, xlsx for regular files.
 */

const XLSX = require('xlsx');
const XlsxPopulate = require('xlsx-populate');
const fs = require('fs');
const path = require('path');
const os = require('os');

const KNOWN_HEADERS = [
  'date', 'tran date', 'transaction date', 'txn date', 'value date',
  'description', 'narration', 'particulars', 'transaction particulars',
  'debit', 'credit', 'amount', 'balance', 'sr.no', 'sl. no.',
];

function isHeaderRow(rowValues) {
  const normalized = rowValues.map((v) => String(v || '').toLowerCase().trim());
  const matchCount = normalized.filter((v) => KNOWN_HEADERS.includes(v)).length;
  return matchCount >= 2;
}

/**
 * Try opening with regular xlsx library (no password needed)
 */
function tryRegularRead(filePath) {
  try {
    const workbook = XLSX.readFile(filePath, { type: 'file', cellDates: true });
    if (workbook.SheetNames.length > 0) {
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const test = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (test.length > 0) return workbook;
    }
  } catch {}
  return null;
}

/**
 * Try opening with xlsx-populate using passwords, then convert to xlsx format
 */
async function tryPasswordRead(filePath, passwords) {
  for (const password of passwords) {
    try {
      const wb = await XlsxPopulate.fromFileAsync(filePath, { password });
      const sheet = wb.sheet(0);
      const range = sheet.usedRange();
      if (!range) continue;

      const rawMatrix = range.value();
      if (rawMatrix && rawMatrix.length > 0) {
        return { rawMatrix, usedPassword: password };
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Convert rawMatrix (2D array from xlsx-populate) to the same format as xlsx
 */
function matrixToRows(rawMatrix) {
  // Clean null values
  return rawMatrix.map(row =>
    (Array.isArray(row) ? row : [row]).map(cell => {
      if (cell === null || cell === undefined) return '';
      if (cell instanceof Date) {
        // Format date as string
        const d = cell;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${yyyy}-${mm}-${dd}`;
      }
      return String(cell);
    })
  );
}

function parseXLSX(filePath, passwords) {
  // This is the sync entry point - we need to handle the async xlsx-populate
  // So we return a promise-like approach. But the caller uses await, so let's make this async-compatible.
  // Actually the upload route doesn't await parseXLSX currently for xlsx. Let me make it work sync first with regular xlsx.

  const workbook = tryRegularRead(filePath);

  if (workbook) {
    // Regular non-protected file
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    return processMatrix(rawMatrix, null);
  }

  // File is protected - need async password attempt
  // Throw a special error that the caller catches
  const err = new Error('FILE_NEEDS_PASSWORD');
  err.needsPassword = true;
  throw err;
}

/**
 * Async version for password-protected files
 */
async function parseXLSXAsync(filePath, passwords) {
  // First try regular
  const workbook = tryRegularRead(filePath);
  if (workbook) {
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    return processMatrix(rawMatrix, null);
  }

  // Try with passwords
  if (!passwords || passwords.length === 0) {
    throw new Error('Excel file is password-protected but no passwords provided.');
  }

  const result = await tryPasswordRead(filePath, passwords);
  if (!result) {
    throw new Error('Could not open Excel file. It may be password-protected with an unknown password.');
  }

  const cleanMatrix = matrixToRows(result.rawMatrix);
  return processMatrix(cleanMatrix, result.usedPassword);
}

function processMatrix(rawMatrix, usedPassword) {
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rawMatrix.length, 30); i++) {
    if (isHeaderRow(rawMatrix[i])) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error('Could not find data header row in Excel file. Unsupported format.');
  }

  const rawContent = rawMatrix
    .slice(0, Math.min(rawMatrix.length, 50))
    .map(row => row.map(c => String(c || '')).join(','))
    .join('\n');

  const headers = rawMatrix[headerRowIdx].map((h) => String(h || '').trim());
  const dataRows = rawMatrix.slice(headerRowIdx + 1);

  const rows = dataRows
    .filter((row) => row.some((cell) => cell !== '' && cell !== null))
    .map((row) => {
      const obj = {};
      headers.forEach((header, idx) => {
        if (header) obj[header] = row[idx] !== undefined ? String(row[idx]) : '';
      });
      return obj;
    });

  return { rows, rawContent, usedPassword };
}

module.exports = { parseXLSX, parseXLSXAsync };
