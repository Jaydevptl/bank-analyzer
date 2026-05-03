/**
 * Fino · Simple CSV parser (Phase 9) — no external dependencies.
 *
 * Public API:
 *   parseCSVString(csvContent)            → string[][]
 *   detectColumnMapping(headers)          → { dateCol, descCol, refCol, debitCol, creditCol, balanceCol, valueDateCol }
 *   parseDate(dateStr)                    → 'YYYY-MM-DD' | null
 *   parseAmount(str)                      → number | null  (strips commas, currency symbols, parens for negative)
 */

// Splits a single CSV row, honouring double-quoted fields with embedded commas
// and escaped double-quotes ("" → ").
function splitRow(line, delimiter = ',') {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delimiter) { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map(c => c.trim());
}

function parseCSVString(csvContent) {
  if (!csvContent || typeof csvContent !== 'string') return [];

  // Strip BOM, normalise newlines
  const text = csvContent.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  // Pick a delimiter: comma if header has commas, else semicolon, else tab
  const firstLine = text.split('\n').find(l => l.trim().length > 0) || '';
  let delimiter = ',';
  const commaCount     = (firstLine.match(/,/g)  || []).length;
  const semicolonCount = (firstLine.match(/;/g)  || []).length;
  const tabCount       = (firstLine.match(/\t/g) || []).length;
  if (semicolonCount > commaCount && semicolonCount > tabCount) delimiter = ';';
  else if (tabCount > commaCount) delimiter = '\t';

  const rows = [];
  // Need to handle multi-line quoted fields too
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQuotes = !inQuotes; current += ch; continue; }
    if (ch === '\n' && !inQuotes) {
      if (current.trim().length > 0) rows.push(splitRow(current, delimiter));
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) rows.push(splitRow(current, delimiter));

  return rows;
}

// Map raw header names to our schema fields (case-insensitive, fuzzy)
function detectColumnMapping(headers) {
  const lc = headers.map(h => String(h || '').toLowerCase().trim());

  const find = (predicates, exclude = []) => {
    // Test predicates in priority order; return first index that matches none of `exclude`
    for (const pred of predicates) {
      for (let i = 0; i < lc.length; i++) {
        if (exclude.includes(i)) continue;
        if (pred.test(lc[i])) return i;
      }
    }
    return -1;
  };

  // Note ordering matters — narrower patterns first
  const dateCol      = find([/^txn\s*date$/, /^transaction\s*date$/, /^tran\s*date$/, /^date$/, /\bdate\b(?!.*value)/, /\bdt\b(?!.*value)/]);
  const valueDateCol = find([/value\s*dt|value\s*date/]);
  const refCol       = find([/^ref\s*no/, /\bref\b/, /\bchq\b|cheque|chk/]);
  const descCol      = find([/narration/, /description/, /particulars/, /\bremarks?\b/, /\bdetails?\b/]);
  const debitCol     = find([/withdrawal/, /^debit$/, /debit\s*amt/, /debit\s*amount/, /\bdr\b/]);
  const creditCol    = find([/deposit/, /^credit$/, /credit\s*amt/, /credit\s*amount/, /\bcr\b/]);
  const balanceCol   = find([/closing\s*balance/, /running\s*balance/, /\bbalance\b/, /\bbal\b/]);

  return {
    dateCol, valueDateCol, refCol, descCol, debitCol, creditCol, balanceCol,
    headers,
  };
}

// Parse Indian-style date strings into ISO 'YYYY-MM-DD'.
// Handles: DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY, DD MMM YYYY, YYYY-MM-DD
function parseDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (!str) return null;

  // ISO already
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;

  // DD MMM YYYY (e.g. "01 Apr 2026")
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  m = str.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})$/);
  if (m) {
    const mi = months.indexOf(m[2].slice(0,3).toLowerCase());
    if (mi >= 0) {
      const yr = m[3].length === 2 ? (Number(m[3]) > 70 ? '19'+m[3] : '20'+m[3]) : m[3];
      return `${yr}-${String(mi+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY (Indian default) — also DD/MM/YY
  m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let d = m[1], mo = m[2], y = m[3];
    // If first part > 12, definitely day-first; if second > 12, must be month-first (US)
    if (Number(d) > 12 && Number(mo) <= 12) {
      // OK: DD/MM
    } else if (Number(mo) > 12 && Number(d) <= 12) {
      [d, mo] = [mo, d];
    }
    if (y.length === 2) y = (Number(y) > 70 ? '19' : '20') + y;
    return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return null;
}

// Parse rupee amounts. Strips ₹/Rs, commas (incl. Indian lakh format 1,00,000),
// spaces, "CR"/"DR" suffixes, and treats parens as negative.
function parseAmount(s) {
  if (s === null || s === undefined) return null;
  let str = String(s).trim();
  if (!str || /^-+$/.test(str) || /^n\.?a\.?$/i.test(str)) return null;

  let sign = 1;
  if (/^\(.*\)$/.test(str)) { sign = -1; str = str.slice(1, -1); }
  str = str.replace(/[₹$€£]/g, '').replace(/Rs\.?/gi, '').replace(/INR/gi, '');
  str = str.replace(/[,\s]/g, '');
  if (/dr$/i.test(str)) { sign *= -1; str = str.replace(/dr$/i, ''); }
  if (/cr$/i.test(str)) { str = str.replace(/cr$/i, ''); }
  if (str === '' || str === '-') return null;
  const n = Number(str);
  if (Number.isNaN(n)) return null;
  return sign * n;
}

module.exports = { parseCSVString, detectColumnMapping, parseDate, parseAmount };
