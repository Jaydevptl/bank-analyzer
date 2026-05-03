/**
 * Trade XLSX Parser - Flexible parser for Ledger & P&L Excel files
 * Auto-detects header row and maps columns flexibly.
 */

const XLSX = require('xlsx');
const XlsxPopulate = require('xlsx-populate');

// ─── Header Detection ────────────────────────────────────────────────────────

const LEDGER_KEYWORDS = ['date', 'particulars', 'description', 'narration', 'debit', 'credit', 'balance', 'dr', 'cr', 'amount'];
const PNL_KEYWORDS = ['script', 'symbol', 'buy', 'sell', 'profit', 'loss', 'qty', 'quantity', 'rate', 'p&l', 'pnl', 'gain', 'net'];

function detectHeaderRow(matrix, maxScan = 30) {
  for (let i = 0; i < Math.min(matrix.length, maxScan); i++) {
    const row = matrix[i];
    if (!row || !Array.isArray(row)) continue;
    const vals = row.map(c => String(c || '').toLowerCase().trim()).filter(Boolean);
    if (vals.length < 2) continue;

    const ledgerHits = vals.filter(v => LEDGER_KEYWORDS.some(k => v.includes(k))).length;
    const pnlHits = vals.filter(v => PNL_KEYWORDS.some(k => v.includes(k))).length;

    if (ledgerHits >= 3 || pnlHits >= 3) {
      return { headerIdx: i, type: ledgerHits >= pnlHits ? 'ledger' : 'pnl' };
    }
  }

  // Fallback: first row with 3+ non-empty cells
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const row = matrix[i];
    if (!row) continue;
    const nonEmpty = row.filter(c => String(c || '').trim()).length;
    if (nonEmpty >= 3) return { headerIdx: i, type: 'unknown' };
  }

  return null;
}

// ─── Read Excel ──────────────────────────────────────────────────────────────

function tryRegularRead(filePath) {
  try {
    const wb = XLSX.readFile(filePath, { type: 'file', cellDates: true });
    if (wb.SheetNames.length > 0) {
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const test = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (test.length > 0) return wb;
    }
  } catch {}
  return null;
}

async function tryPasswordRead(filePath, passwords) {
  for (const pw of passwords) {
    try {
      const wb = await XlsxPopulate.fromFileAsync(filePath, { password: pw });
      const sheet = wb.sheet(0);
      const range = sheet.usedRange();
      if (!range) continue;
      const raw = range.value();
      if (raw && raw.length > 0) return { rawMatrix: raw, usedPassword: pw };
    } catch { continue; }
  }
  return null;
}

function matrixToStrings(rawMatrix) {
  return rawMatrix.map(row =>
    (Array.isArray(row) ? row : [row]).map(cell => {
      if (cell === null || cell === undefined) return '';
      if (cell instanceof Date) {
        const dd = String(cell.getDate()).padStart(2, '0');
        const mm = String(cell.getMonth() + 1).padStart(2, '0');
        return `${cell.getFullYear()}-${mm}-${dd}`;
      }
      return String(cell);
    })
  );
}

// ─── Main Parse ──────────────────────────────────────────────────────────────

function processMatrix(rawMatrix) {
  const detection = detectHeaderRow(rawMatrix);
  if (!detection) {
    throw new Error('Could not find a header row in the Excel file. Make sure the file has column headers.');
  }

  const { headerIdx, type } = detection;
  const headers = rawMatrix[headerIdx].map(h => String(h || '').trim());
  const dataRows = rawMatrix.slice(headerIdx + 1);

  // Build rawContent for first 50 rows (for detection/debug)
  const rawContent = rawMatrix
    .slice(0, Math.min(rawMatrix.length, 50))
    .map(row => row.map(c => String(c || '')).join(','))
    .join('\n');

  const rows = dataRows
    .filter(row => row.some(cell => String(cell || '').trim()))
    .map(row => {
      const obj = {};
      headers.forEach((h, idx) => {
        if (h) obj[h] = row[idx] !== undefined ? String(row[idx]) : '';
      });
      return obj;
    });

  return { rows, headers, rawContent, detectedType: type };
}

async function parseExcel(filePath, passwords = []) {
  const wb = tryRegularRead(filePath);
  if (wb) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    return processMatrix(rawMatrix);
  }

  if (!passwords || passwords.length === 0) {
    throw new Error('Excel file could not be read. It may be password-protected.');
  }

  const result = await tryPasswordRead(filePath, passwords);
  if (!result) {
    throw new Error('Could not open Excel file with the provided passwords.');
  }

  const cleanMatrix = matrixToStrings(result.rawMatrix);
  return processMatrix(cleanMatrix);
}

module.exports = { parseExcel };
