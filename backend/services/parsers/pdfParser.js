/**
 * PDF Parser Service
 * Extracts text from PDF bank statements.
 * Tries multiple passwords for password-protected PDFs.
 */

const fs = require('fs');
const pdfParse = require('pdf-parse');

function parseTransactionLine(line) {
  const patterns = [
    /^(\d{2}[-/]\d{2}[-/]\d{4})\s+(.+?)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)$/,
    /^(\d{2}\s+\w{3}\s+\d{4})\s+(.+?)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)$/,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      return {
        date: match[1],
        description: match[2].trim(),
        debit: match[3],
        credit: match[4],
        balance: match[5],
      };
    }
  }
  return null;
}

async function parsePDF(filePath, passwords) {
  const dataBuffer = fs.readFileSync(filePath);
  const allPasswords = [null, ...(passwords || [])];

  let pdfData = null;
  let usedPassword = null;

  for (const password of allPasswords) {
    try {
      const opts = {};
      if (password) opts.password = password;
      pdfData = await pdfParse(dataBuffer, opts);
      if (pdfData && pdfData.text && pdfData.text.trim().length > 0) {
        usedPassword = password;
        break;
      }
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('password') || msg.includes('encrypt') || msg.includes('need a password')) {
        continue;
      }
      if (!password) throw err;
      continue;
    }
  }

  if (!pdfData || !pdfData.text) {
    throw new Error('Could not read PDF. It may be password-protected with an unknown password.');
  }

  const rawContent = pdfData.text;
  const lines = rawContent.split('\n').map((l) => l.trim()).filter(Boolean);

  const rows = [];
  for (const line of lines) {
    const row = parseTransactionLine(line);
    if (row) rows.push(row);
  }

  if (rows.length === 0) {
    throw new Error(
      'Could not extract transactions from PDF. ' +
      'This may be a scanned PDF requiring OCR. ' +
      'Please export as CSV/Excel from your bank for best results.'
    );
  }

  return { rows, rawContent, usedPassword };
}

module.exports = { parsePDF };
