/**
 * CSV Parser Service
 * Reads a CSV file and returns raw row objects, skipping metadata/header junk.
 * Handles multiple bank formats with different header offsets and footer sections.
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');

const DATA_HEADER_MARKERS = [
  'sr.no.',
  'tran date',
  'sl. no.',
  'date,narration',
  'txn date',
  'transaction date',
];

const FOOTER_MARKERS = [
  'legend :',
  'legend:',
  'this is a system generated',
  'registered office',
  'unless the constituent',
  'the closing balance as shown',
  'we would like to reiterate',
  'deposit insurance',
  'you may call our 24',
  'write to us at customer',
];

function findHeaderRow(lines) {
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const lower = lines[i].trim().toLowerCase();
    if (lower.includes(',') && DATA_HEADER_MARKERS.some((m) => lower.startsWith(m))) {
      return i;
    }
  }
  return -1;
}

function findFooterRow(lines, headerIdx) {
  let blankRun = 0;
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const lower = trimmed.toLowerCase();
    if (trimmed === '') {
      blankRun++;
      // Blank followed by a long quoted disclaimer
      if (i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (next.startsWith('"') && next.length > 50) return i;
      }
      if (blankRun >= 2) return i - 1;
    } else {
      blankRun = 0;
      if (FOOTER_MARKERS.some((m) => lower.includes(m))) return i;
    }
  }
  return lines.length;
}

function parseCSV(filePath) {
  const rawContent = fs.readFileSync(filePath, 'utf-8');
  const normalised = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalised.split('\n');

  const headerIdx = findHeaderRow(lines);
  if (headerIdx === -1) {
    throw new Error(
      'Could not find data header row. File may be unsupported. ' +
      'Please export as CSV directly from your bank portal.'
    );
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

  const SKIP_PREFIXES = [
    'closing balance', 'opening balance', 'total', 'you may call', 'write to us',
  ];

  const validRows = rows.filter((row) => {
    const values = Object.values(row).join('').trim();
    if (!values) return false;
    const firstVal = (Object.values(row)[0] ?? '').toString().trim().toLowerCase();
    return !SKIP_PREFIXES.some((p) => firstVal.startsWith(p));
  });

  return { rows: validRows, rawContent };
}

module.exports = { parseCSV };
