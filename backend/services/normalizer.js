/**
 * Normalizer Service
 * Converts raw parsed rows into the standard Transaction format.
 * Uses columnMap from bankDetector for dynamic column mapping.
 */

const { parse: parseDate, isValid } = require('date-fns');

// ─── Date Parsing ──────────────────────────────────────────────────────────────

const DATE_FORMATS = [
  'dd MMM yyyy',
  'dd-MM-yyyy',
  'dd/MM/yyyy',
  'dd-MM-yyyy HH:mm:ss',
  'MM/dd/yyyy',
  'yyyy-MM-dd',
  'dd.MM.yyyy',
  "dd MMM ''yy",
  'dd-MMM-yy',
  'dd-MMM-yyyy',
];

function parseFlexibleDate(str) {
  if (!str) return null;

  const cleaned = str
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(\d{2})-(\d{2})-(\d{4})\s.*/, '$1-$2-$3');

  const refDate = new Date();

  for (const fmt of DATE_FORMATS) {
    try {
      const parsed = parseDate(cleaned, fmt, refDate);
      if (isValid(parsed) && parsed.getFullYear() > 2000) {
        return parsed;
      }
    } catch {
      // try next format
    }
  }

  const nativeDate = new Date(cleaned);
  if (isValid(nativeDate) && nativeDate.getFullYear() > 2000) {
    return nativeDate;
  }

  return null;
}

// ─── Amount Parsing ────────────────────────────────────────────────────────────

function parseAmount(val) {
  if (val === null || val === undefined || val === '-' || val === '') return 0;
  if (typeof val === 'number') return Math.abs(val);

  const cleaned = val.toString().replace(/[₹$,\s]/g, '').trim();
  if (cleaned === '-' || cleaned === '') return 0;

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.abs(num);
}

// ─── Dynamic Column Finder ─────────────────────────────────────────────────────

/**
 * Finds a value in a row by trying the given column name case-insensitively,
 * also tries trimmed versions.
 */
function findCol(row, colName) {
  if (!colName) return undefined;
  // Direct match
  if (row[colName] !== undefined) return row[colName];
  // Case-insensitive match
  const lower = colName.toLowerCase().trim();
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().trim() === lower) return row[key];
  }
  // Partial match (for columns with leading/trailing spaces)
  for (const key of Object.keys(row)) {
    if (key.trim().toLowerCase() === lower) return row[key];
  }
  return undefined;
}

// ─── Main Normalizer with columnMap ─────────────────────────────────────────

/**
 * Normalizes a row using the bank's columnMap and amountType.
 * @param {object} row - Raw parsed row
 * @param {string} bankKey - Bank identifier
 * @param {object} columnMap - Column mapping from bankDetector
 * @param {string} amountType - 'separate' | 'combined_drcr' | 'combined_signed'
 * @returns {object|null}
 */
function normalizeWithMap(row, bankKey, columnMap, amountType) {
  if (!columnMap) return normalizeGeneric(row);

  const dateStr = findCol(row, columnMap.date);
  const date = parseFlexibleDate(dateStr);
  if (!date) return null;

  const description = (findCol(row, columnMap.description) || '').toString().trim();
  const balance = parseAmount(findCol(row, columnMap.balance));
  const referenceNo = (findCol(row, columnMap.referenceNo) || '').toString().trim();

  let debit = 0, credit = 0;

  if (amountType === 'separate') {
    debit = parseAmount(findCol(row, columnMap.debit));
    credit = parseAmount(findCol(row, columnMap.credit));
  } else if (amountType === 'combined_drcr') {
    const amount = parseAmount(findCol(row, columnMap.amountColumn));
    const dirRaw = (findCol(row, columnMap.drCrIndicator) || '').toString().trim().toUpperCase();
    const isDebit = dirRaw === 'DR';
    debit = isDebit ? amount : 0;
    credit = !isDebit ? amount : 0;
  } else if (amountType === 'combined_signed') {
    const rawVal = findCol(row, columnMap.amountColumn);
    const numVal = parseFloat((rawVal || '0').toString().replace(/[₹$,\s]/g, ''));
    if (!isNaN(numVal)) {
      debit = numVal < 0 ? Math.abs(numVal) : 0;
      credit = numVal > 0 ? numVal : 0;
    }
  }

  return { date, description, debit, credit, balance, referenceNo };
}

/**
 * Generic fallback normalizer for unknown formats.
 */
function normalizeGeneric(row) {
  const findVal = (...candidates) => {
    for (const c of candidates) {
      const found = Object.keys(row).find((k) => k.toLowerCase().trim() === c.toLowerCase());
      if (found && row[found] !== undefined) return row[found];
    }
    return '';
  };

  const dateStr = findVal('date', 'tran date', 'transaction date', 'txn date', 'value date');
  const date = parseFlexibleDate(dateStr);
  if (!date) return null;

  const desc = findVal('description', 'particulars', 'narration', 'transaction particulars', 'remarks');
  const debit = parseAmount(findVal('debit', 'debit amount', 'dr amount', 'withdrawal', 'withdrawal amount (inr )'));
  const credit = parseAmount(findVal('credit', 'credit amount', 'cr amount', 'deposit', 'deposit amount (inr )'));
  const balance = parseAmount(findVal('balance', 'closing balance', 'balance(inr)', 'balance (inr )'));
  const referenceNo = findVal('ref no.', 'reference number', 'chq / ref no.', 'chq/ref number', 'ref no./cheque no.').toString().trim();

  return { date, description: String(desc).trim(), debit, credit, balance, referenceNo: referenceNo || '' };
}

/**
 * Normalizes a single raw row into the standard transaction format.
 * @param {object} row - Raw parsed row object
 * @param {string} bankKey - Bank identifier from detectBank()
 * @param {object} [columnMap] - Column mapping from detectBank()
 * @param {string} [amountType] - Amount type from detectBank()
 * @returns {object|null}
 */
function normalizeRow(row, bankKey, columnMap, amountType) {
  if (columnMap && amountType) {
    return normalizeWithMap(row, bankKey, columnMap, amountType);
  }
  return normalizeGeneric(row);
}

module.exports = { normalizeRow, parseFlexibleDate, parseAmount };
