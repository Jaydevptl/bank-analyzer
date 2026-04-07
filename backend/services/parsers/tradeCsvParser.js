/**
 * Trade CSV Parser Service
 * Parses CSV files for share market broker statements.
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');

const TRADE_HEADER_PATTERNS = [
  // Match by starting tokens or substring
  'trade_date,tradingsymbol',
  'trade date,exchange,segment,symbol',
  'trade date,symbol,isin',
  'instrument name,quantity',
  'trade date,symbol name,net qty',
  'symbol name,exchange,buy/sell',
  'scrip name,buy qty',
  'trade date,scrip name,action',
  'trade date,symbol',
  'symbol,trade type',
];

function findHeaderRow(lines) {
  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const lower = lines[i].trim().toLowerCase();
    if (!lower.includes(',')) continue;
    if (TRADE_HEADER_PATTERNS.some(p => lower.startsWith(p) || lower.includes(p))) {
      return i;
    }
    // Generic check: contains trade date + symbol-like + qty/quantity
    if ((lower.includes('trade') && lower.includes('symbol')) ||
        (lower.includes('date') && lower.includes('quantity') && lower.includes('price')) ||
        (lower.includes('tradingsymbol'))) {
      return i;
    }
  }
  return -1;
}

function findFooterRow(lines, headerIdx) {
  let blankRun = 0;
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') {
      blankRun++;
      if (blankRun >= 3) return i - 2;
    } else {
      blankRun = 0;
      const lower = trimmed.toLowerCase();
      if (lower.startsWith('disclaimer') || lower.startsWith('note:') || lower.startsWith('total')) return i;
    }
  }
  return lines.length;
}

function parseTradeCSV(filePath) {
  const rawContent = fs.readFileSync(filePath, 'utf-8');
  const normalised = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalised.split('\n');

  const headerIdx = findHeaderRow(lines);
  if (headerIdx === -1) {
    throw new Error('Could not find trade data header row. File may be unsupported. Make sure this is a broker tradebook with columns like Trade Date, Symbol, Quantity, Price.');
  }

  const endIdx = findFooterRow(lines, headerIdx);
  const dataSection = lines.slice(headerIdx, endIdx).join('\n');

  const rows = parse(dataSection, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    cast: false,
  });

  const validRows = rows.filter(row => {
    const values = Object.values(row).join('').trim();
    return values.length > 0;
  });

  return { rows: validRows, rawContent };
}

module.exports = { parseTradeCSV };
