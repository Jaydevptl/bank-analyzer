/**
 * Trade XLSX Parser Service
 * Parses Excel files for share market broker statements.
 * Recognizes trade-specific headers (Zerodha, Groww, Upstox, etc.)
 */

const XLSX = require('xlsx');
const XlsxPopulate = require('xlsx-populate');

const TRADE_HEADERS = [
  // Zerodha
  'trade_date', 'tradingsymbol', 'trade_type', 'order_id',
  // Groww
  'trade date', 'symbol', 'isin', 'trade type',
  // Upstox
  'instrument name', 'buy/sell', 'trade price',
  // Angel One
  'symbol name', 'net qty', 'trade amount',
  // 5Paisa
  'scrip name', 'buy qty', 'buy rate', 'sell qty', 'sell rate',
  // ICICI
  'scrip name', 'action', 'trade value',
  // Marwadi/Geojit lowercase
  'trandate', 'scriptname', 'transtype', 'delivqty', 'transrate', 'segmenttype', 'shortname',
  // P&L report format
  'fullname', 'sellrate', 'buyrate', 'gainloss', 'shorttermgainloss', 'longtermgainloss',
  'buydate', 'selldate', 'sale_value', 'purchase_value',
  // Generic
  'symbol', 'quantity', 'price', 'amount', 'date', 'type', 'qty', 'rate',
  'exchange', 'segment', 'brokerage', 'stt',
];

function isTradeHeaderRow(rowValues) {
  const normalized = rowValues.map(v => String(v || '').toLowerCase().trim());
  const matchCount = normalized.filter(v => TRADE_HEADERS.includes(v)).length;
  return matchCount >= 3; // need at least 3 trade-related columns
}

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

function matrixToRows(rawMatrix) {
  return rawMatrix.map(row =>
    (Array.isArray(row) ? row : [row]).map(cell => {
      if (cell === null || cell === undefined) return '';
      if (cell instanceof Date) {
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

function processMatrix(rawMatrix, usedPassword) {
  // Find header row that matches trade headers
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rawMatrix.length, 50); i++) {
    if (isTradeHeaderRow(rawMatrix[i])) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error('Could not find trade data header row in Excel file. Make sure this is a broker statement with columns like Trade Date, Symbol, Quantity, Price.');
  }

  // Build rawContent for broker detection
  const rawContent = rawMatrix
    .slice(0, Math.min(rawMatrix.length, 50))
    .map(row => row.map(c => String(c || '')).join(','))
    .join('\n');

  const headers = rawMatrix[headerRowIdx].map(h => String(h || '').trim());
  const dataRows = rawMatrix.slice(headerRowIdx + 1);

  const rows = dataRows
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((header, idx) => {
        if (header) obj[header] = row[idx] !== undefined ? String(row[idx]) : '';
      });
      return obj;
    });

  return { rows, rawContent, usedPassword };
}

async function parseTradeXLSXAsync(filePath, passwords = []) {
  const workbook = tryRegularRead(filePath);
  if (workbook) {
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    return processMatrix(rawMatrix, null);
  }

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

module.exports = { parseTradeXLSXAsync };
