/**
 * Bank Detector Service
 * Identifies the bank format from raw file content.
 * Returns a bank key, name, columnMap, and amountType.
 */

const BANK_SIGNATURES = [
  {
    key: 'INDUSIND',
    name: 'IndusInd Bank',
    markers: ['INDB0000', 'Current Choice Account', 'Transaction List', 'Sr.No.,Date,Type', 'INDUS PRIVILEGE', 'Account Information', 'Sr.no,Date'],
    columnMap: {
      date: 'Date',
      description: 'Description',
      debit: 'Debit',
      credit: 'Credit',
      balance: 'Balance',
      referenceNo: null,
      drCrIndicator: null,
      amountColumn: null,
    },
    amountType: 'separate',
  },
  {
    key: 'AXIS',
    name: 'Axis Bank',
    markers: ['UTIB0000', 'Tran Date,Value Date,CHQNO', 'DR|CR', 'Balance(INR)'],
    columnMap: {
      date: 'Tran Date',
      description: 'Transaction Particulars',
      debit: null,
      credit: null,
      balance: 'Balance(INR)',
      referenceNo: 'CHQNO',
      drCrIndicator: 'DR|CR',
      amountColumn: 'Amount(INR)',
    },
    amountType: 'combined_drcr',
  },
  {
    key: 'AXIS2',
    name: 'Axis Bank',
    markers: ['UTIB0000', 'Tran Date,CHQNO,PARTICULARS,DR,CR,BAL', 'Statement of Account No'],
    columnMap: {
      date: 'Tran Date',
      description: 'PARTICULARS',
      debit: 'DR',
      credit: 'CR',
      balance: 'BAL',
      referenceNo: 'CHQNO',
      drCrIndicator: null,
      amountColumn: null,
    },
    amountType: 'separate',
  },
  {
    key: 'KOTAK',
    name: 'Kotak Mahindra Bank',
    markers: ['KKBK0000', 'Sl. No.,Transaction Date,Value Date', 'Dr / Cr,Balance,Dr / Cr'],
    columnMap: {
      date: 'Transaction Date',
      description: 'Description',
      debit: null,
      credit: null,
      balance: 'Balance',
      referenceNo: 'Chq / Ref No.',
      drCrIndicator: 'Dr / Cr',
      amountColumn: 'Amount',
    },
    amountType: 'combined_drcr',
  },
  {
    key: 'HDFC',
    name: 'HDFC Bank',
    markers: ['HDFC0000', 'Date,Narration,Value Dat,Debit Amount,Credit Amount,Chq'],
    columnMap: {
      date: 'Date',
      description: 'Narration',
      debit: 'Debit Amount',
      credit: 'Credit Amount',
      balance: 'Closing Balance',
      referenceNo: 'Chq/Ref Number',
      drCrIndicator: null,
      amountColumn: null,
    },
    amountType: 'separate',
  },
  {
    key: 'SBI',
    name: 'State Bank of India',
    markers: ['SBIN0', 'Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance'],
    columnMap: {
      date: 'Txn Date',
      description: 'Description',
      debit: 'Debit',
      credit: 'Credit',
      balance: 'Balance',
      referenceNo: 'Ref No./Cheque No.',
      drCrIndicator: null,
      amountColumn: null,
    },
    amountType: 'separate',
  },
  {
    key: 'ICICI',
    name: 'ICICI Bank',
    markers: ['ICIC0', 'Transaction Date,Value Date,Transaction Remarks,Reference Number'],
    columnMap: {
      date: 'Transaction Date',
      description: 'Transaction Remarks',
      debit: 'Withdrawal Amount (INR )',
      credit: 'Deposit Amount (INR )',
      balance: 'Balance (INR )',
      referenceNo: 'Reference Number',
      drCrIndicator: null,
      amountColumn: null,
    },
    amountType: 'separate',
  },
];

/**
 * Detects the bank from raw text content.
 * @param {string} rawContent - File content as string
 * @returns {{ key, name, columnMap, amountType } | null}
 */
function detectBank(rawContent) {
  const header = rawContent.split('\n').slice(0, 50).join('\n');

  for (const bank of BANK_SIGNATURES) {
    const matchCount = bank.markers.filter((m) =>
      header.toLowerCase().includes(m.toLowerCase())
    ).length;

    if (matchCount >= 2) {
      return { key: bank.key, name: bank.name, columnMap: bank.columnMap, amountType: bank.amountType };
    }
  }

  for (const bank of BANK_SIGNATURES) {
    if (bank.markers.some((m) => header.toLowerCase().includes(m.toLowerCase()))) {
      return { key: bank.key, name: bank.name, columnMap: bank.columnMap, amountType: bank.amountType };
    }
  }

  return null;
}

/**
 * Returns the account number extracted from file header.
 */
function extractAccountNumber(rawContent) {
  const patterns = [
    /Account\s*No[.:,-]?\s*[,]?\s*(\d{6,20})/i,
    /Account\s*Number\s*[,:]?\s*,?\s*(\d{6,20})/i,
    /Statement of Account No\s*[-–]\s*(\d{6,20})/i,
    /A\/c\s*No[.:]?\s*(\d{6,20})/i,
  ];

  for (const pattern of patterns) {
    const match = rawContent.match(pattern);
    if (match) return match[1];
  }

  // XLSX format: scan for "Account Number,158369486680"
  const lines = rawContent.split('\n').slice(0, 20);
  for (const line of lines) {
    const cells = line.split(',').map(c => c.replace(/"/g, '').trim());
    const idx = cells.findIndex(c => /account\s*number/i.test(c));
    if (idx >= 0) {
      for (let i = idx + 1; i < cells.length; i++) {
        const val = cells[i].trim();
        if (/^\d{6,20}$/.test(val)) return val;
      }
    }
  }

  return '';
}

/**
 * Returns the account holder name extracted from file header.
 */
function extractAccountHolder(rawContent) {
  const lines = rawContent.split('\n').slice(0, 30);
  const header = lines.join('\n');

  // Pattern 1: "Name,ARAFAT KONDKARI" or "Name,,ARAFAT KONDKARI" (XLSX comma-joined)
  // Pattern 2: "Name : ARAFAT" or "Name :- ARAFAT" (CSV)
  // Line-by-line search for Name field
  for (const line of lines) {
    const lineClean = line.replace(/"/g, '').trim();
    // Match: "Name :- CHETAN KARMAN VAVIYA" or "Name , VELVET VISTA" or "Name,ARAFAT"
    const m = lineClean.match(/^Name\s*[:,-]+\s*(.+)/i);
    if (m) {
      let name = m[1].split(',').filter(s => s.trim())[0].trim();
      name = name.replace(/\d+$/, '').trim();
      // Skip if it's a metadata keyword
      if (name.length >= 3 && !/joint|holder|account|statement|bank/i.test(name)) return name;
    }
  }

  // Fallback patterns for other formats
  const patterns = [
    /Customer\s*Name\s*[,:\s]+([A-Z][A-Z0-9\s&.\/'\-]{2,60})/im,
    /Account\s*Holder\s*[,:\s]+([A-Z][A-Z0-9\s&.\/'\-]{2,60})/im,
  ];

  for (const pattern of patterns) {
    const match = header.match(pattern);
    if (match) {
      let name = match[1].split(',').filter(s => s.trim())[0].trim();
      name = name.replace(/\d+$/, '').trim();
      if (name.length >= 3) return name;
    }
  }

  // XLSX format: scan for rows like "Name,ARAFAT KONDKARI,,,,"
  for (const line of lines) {
    const cells = line.split(',').map(c => c.replace(/"/g, '').trim());
    const nameIdx = cells.findIndex(c => /^name$/i.test(c));
    if (nameIdx >= 0) {
      // Next non-empty cell after "Name"
      for (let i = nameIdx + 1; i < cells.length; i++) {
        const val = cells[i].trim();
        if (val && /^[A-Z][A-Z\s&.\/'\-]{2,60}$/i.test(val) && !/account|statement|information/i.test(val)) {
          return val;
        }
      }
    }
  }

  // Kotak format: name on second line (no label)
  for (const line of lines.slice(0, 10)) {
    const clean = line.replace(/"/g, '').replace(/,+/g, ',').replace(/^,|,$/g, '').trim();
    if (/^[A-Z][A-Z\s]{4,40}$/.test(clean) && !clean.match(/ACCOUNT|STATEMENT|BANK|REPORT|TRANSACTION/i)) {
      return clean.trim();
    }
  }

  return '';
}

// Keep backward compatibility
function extractAccountName(rawContent) {
  return extractAccountHolder(rawContent);
}

module.exports = { detectBank, extractAccountNumber, extractAccountHolder, extractAccountName };
