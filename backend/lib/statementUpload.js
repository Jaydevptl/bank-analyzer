/**
 * Fino · Statement Upload service (Phase 9)
 *
 * Flow:
 *   createUpload()       → row in fino_statement_uploads (status='uploaded')
 *   parseCSV()           → fills fino_uploaded_transactions, runs auto-detect + auto-match
 *   importTransactions() → bulk-creates ledger pairs for selected unmatched rows
 *   skipTransactions()   → marks rows skipped
 *   deleteUpload()       → reverses imported ledger groups + soft-delete
 *
 * Auto-match: same bank + same amount + date ±1 day → reuse existing ledger group.
 * Detection: regex rules over description; user can override category per row.
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseLedgerGroup } = require('./reversal');
const { parseCSVString, detectColumnMapping, parseDate, parseAmount } = require('./csvParser');
const { refreshCurrentBalance } = require('./bankAccounts');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ─── Detection rules ─────────────────────────────────────────────────────────

const DETECTION_RULES = [
  { pattern: /AMAZON|AMZN/i,                       type: 'gift_card_purchase', category: 'Gift Cards', party: 'Amazon' },
  { pattern: /FLIPKART|FLIPK/i,                    type: 'gift_card_purchase', category: 'Gift Cards', party: 'Flipkart' },
  { pattern: /MYNTRA/i,                            type: 'gift_card_purchase', category: 'Gift Cards', party: 'Myntra' },
  { pattern: /NYKAA/i,                             type: 'gift_card_purchase', category: 'Gift Cards', party: 'Nykaa' },

  { pattern: /CREDIT\s*CARD|CC\s*PYMT|CARD\s*BILL/i, type: 'cc_payment',         category: 'CC Payment' },

  { pattern: /SALARY|SAL\s*CR|PAYROLL/i,           type: 'salary',             category: 'Salary' },

  { pattern: /GOOGLE\s*(ADS|ADWORDS)|FACEBOOK\s*ADS|META\s*ADS|FB\s*ADS/i,
                                                    type: 'ad_spend',           category: 'Ads/Marketing' },

  { pattern: /NETFLIX|SPOTIFY|YOUTUBE|PRIME\s*VIDEO|HOTSTAR|DISNEY/i,
                                                    type: 'subscription',       category: 'Subscriptions' },

  { pattern: /ATM\s*(WDR|WDL|CASH)|CASH\s*WDR|NWD/i, type: 'atm_withdrawal',    category: 'Cash Withdrawal' },

  { pattern: /UPI[-\/]|BHIM|PHONEPE|GPAY|GOOGLEPAY|PAYTM/i,
                                                    type: 'upi',                category: 'UPI Payment' },

  { pattern: /NEFT|RTGS|IMPS/i,                    type: 'neft_rtgs_imps',     category: 'Bank Transfer' },

  { pattern: /POS\s|ECOM\s|CARD\s/i,               type: 'pos',                category: 'Card Payment' },

  { pattern: /EMI|INSTALMENT|INSTALLMENT/i,        type: 'emi',                category: 'EMI' },

  { pattern: /INT\.\s*CREDIT|INTEREST|INT\s*CR/i,  type: 'interest_credit',    category: 'Bank Interest' },

  { pattern: /CHARGES|CHG|SMS\s*ALERT|MAINT\s*CHG/i, type: 'charge',           category: 'Bank Charges' },

  { pattern: /LOAN/i,                              type: 'loan_repayment',     category: 'Loan' },

  { pattern: /TRANSFER|TRF|SELF/i,                 type: 'transfer',           category: 'Internal Transfer' },

  { pattern: /INSURANCE|LIC|POLICY/i,              type: 'insurance',          category: 'Insurance' },

  { pattern: /ELECTRICITY|WATER|GAS|BROADBAND|INTERNET|MOBILE.*RECHARGE|RECHARGE/i,
                                                    type: 'utility',            category: 'Utilities' },
];

function autoDetectType(description) {
  const desc = String(description || '');
  for (const rule of DETECTION_RULES) {
    if (rule.pattern.test(desc)) {
      return {
        type: rule.type, category: rule.category, party: rule.party || null,
        confidence: 0.85,
      };
    }
  }
  return { type: 'unknown', category: 'Other', party: null, confidence: 0 };
}

// Category → COA code mapping
const CATEGORY_TO_COA = {
  'UPI Payment':       '5700',
  'Bank Transfer':     '5700',
  'Cash Withdrawal':   '1100',  // Cash in Hand
  'Card Payment':      '5700',
  'Gift Cards':        '1600',  // Gift Cards parent
  'CC Payment':        '2200',  // Credit Cards parent (liability)
  'Salary':            '4200',  // Other Income
  'EMI':               '5700',
  'Bank Interest':     '4210',  // Interest Income
  'Bank Charges':      '5220',
  'Subscriptions':     '5700',
  'Insurance':         '5700',
  'Utilities':         '5700',
  'Ads/Marketing':     '5500',
  'Internal Transfer': '5700',
  'Loan':              '5700',
  'Other':             '5700',
};
const FALLBACK_EXPENSE = '5700';

function categoryToCoa(category) {
  return CATEGORY_TO_COA[category] || FALLBACK_EXPENSE;
}

// ─── COA helpers ─────────────────────────────────────────────────────────────

async function bankCoaCode(bankAccountId) {
  const { data, error } = await supabase
    .from('fino_bank_accounts').select('linked_account_id').eq('id', bankAccountId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: c } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', data.linked_account_id).maybeSingle();
  return c?.code || null;
}

async function ccCoaCode(creditCardId) {
  const { data, error } = await supabase
    .from('fino_credit_cards').select('linked_account_id').eq('id', creditCardId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: c } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', data.linked_account_id).maybeSingle();
  return c?.code || null;
}

async function bankAccountIdFromCoa(coaCode) {
  const { data: c } = await supabase
    .from('fino_chart_of_accounts').select('id').eq('code', coaCode).maybeSingle();
  if (!c) return null;
  const { data: b } = await supabase
    .from('fino_bank_accounts').select('id').eq('linked_account_id', c.id).maybeSingle();
  return b?.id || null;
}

// ─── Auto-match ──────────────────────────────────────────────────────────────

function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function autoMatch({ accountCoaCode, txnDate, amount }) {
  if (!accountCoaCode || !txnDate || !(amount > 0)) return null;
  const { data: coa } = await supabase
    .from('fino_chart_of_accounts').select('id').eq('code', accountCoaCode).maybeSingle();
  if (!coa) return null;

  const from = shiftDate(txnDate, -1);
  const to   = shiftDate(txnDate, +1);

  const { data, error } = await supabase
    .from('fino_ledger_entries')
    .select('txn_group_id, amount')
    .eq('account_id', coa.id)
    .eq('is_reversed', false)
    .gte('txn_date', from)
    .lte('txn_date', to);
  if (error) return null;

  const tol = 0.01;
  const hit = (data || []).find(r => Math.abs(Number(r.amount) - amount) < tol);
  return hit?.txn_group_id || null;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

async function createUpload({ uploadType, accountId, fileName, fileType, companyId }) {
  if (!['bank_statement', 'cc_statement'].includes(uploadType)) {
    throw new Error('uploadType must be bank_statement or cc_statement');
  }
  if (!accountId) throw new Error('accountId required');
  const { data, error } = await supabase
    .from('fino_statement_uploads').insert({
      upload_type: uploadType,
      account_id: accountId,
      file_name: fileName || null,
      file_type: fileType || 'csv',
      company_id: companyId || null,
      status: 'uploaded',
    }).select().single();
  if (error) throw error;
  return data;
}

async function parseCSV({ uploadType, accountId, fileName, csvContent, companyId }) {
  // Resolve which COA code this upload belongs to (for matching)
  let accountCoaCode = null;
  if (uploadType === 'bank_statement')   accountCoaCode = await bankCoaCode(accountId);
  else if (uploadType === 'cc_statement') accountCoaCode = await ccCoaCode(accountId);
  if (!accountCoaCode) throw new Error('Selected account has no linked COA — invalid account');

  const upload = await createUpload({ uploadType, accountId, fileName, fileType: 'csv', companyId });
  const rows = parseCSVString(csvContent);
  if (rows.length < 2) {
    await supabase.from('fino_statement_uploads').update({
      status: 'failed', total_rows: 0, parsed_rows: 0,
      error_message: 'No data rows found',
    }).eq('id', upload.id);
    throw new Error('CSV has no data rows');
  }

  const headers = rows[0];
  const mapping = detectColumnMapping(headers);
  if (mapping.dateCol < 0 || mapping.descCol < 0 || (mapping.debitCol < 0 && mapping.creditCol < 0)) {
    await supabase.from('fino_statement_uploads').update({
      status: 'failed', total_rows: rows.length - 1,
      error_message: `Could not auto-detect required columns. Headers: ${headers.join(' | ')}`,
    }).eq('id', upload.id);
    throw new Error(`Could not detect required columns (date, description, debit/credit). Headers: ${headers.join(' | ')}`);
  }

  const txnInserts = [];
  let parsed = 0, matched = 0;
  let periodFrom = null, periodTo = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !c || !c.trim())) continue; // skip blank rows

    const txnDate     = parseDate(row[mapping.dateCol]);
    const valueDate   = mapping.valueDateCol >= 0 ? parseDate(row[mapping.valueDateCol]) : null;
    const description = mapping.descCol >= 0 ? String(row[mapping.descCol] || '').trim() : '';
    const reference   = mapping.refCol  >= 0 ? String(row[mapping.refCol]  || '').trim() : '';

    let debit  = mapping.debitCol  >= 0 ? parseAmount(row[mapping.debitCol])  : null;
    let credit = mapping.creditCol >= 0 ? parseAmount(row[mapping.creditCol]) : null;
    const balance = mapping.balanceCol >= 0 ? parseAmount(row[mapping.balanceCol]) : null;

    // Negative debit → treat as credit (and vice versa)
    if (debit  != null && debit  < 0) { credit = (credit || 0) + Math.abs(debit);  debit = null; }
    if (credit != null && credit < 0) { debit  = (debit  || 0) + Math.abs(credit); credit = null; }

    const amount = Math.max(Math.abs(debit || 0), Math.abs(credit || 0));
    if (!txnDate || amount <= 0) continue;

    // Period tracking
    if (!periodFrom || txnDate < periodFrom) periodFrom = txnDate;
    if (!periodTo   || txnDate > periodTo)   periodTo   = txnDate;

    const detection = autoDetectType(description);
    const matchedGroup = await autoMatch({ accountCoaCode, txnDate, amount });
    if (matchedGroup) matched += 1;

    txnInserts.push({
      upload_id: upload.id,
      row_number: i,
      txn_date: txnDate,
      value_date: valueDate,
      description,
      reference_number: reference || null,
      debit_amount:  debit  != null ? round2(Math.abs(debit))  : null,
      credit_amount: credit != null ? round2(Math.abs(credit)) : null,
      balance:       balance != null ? round2(balance) : null,
      detected_type:       detection.type,
      detected_category:   detection.category,
      detected_party:      detection.party,
      detection_confidence: detection.confidence,
      match_status: matchedGroup ? 'matched' : 'unmatched',
      matched_ledger_group_id: matchedGroup,
    });
    parsed += 1;
  }

  if (txnInserts.length === 0) {
    await supabase.from('fino_statement_uploads').update({
      status: 'failed', total_rows: rows.length - 1, parsed_rows: 0,
      error_message: 'No valid transaction rows after parsing',
    }).eq('id', upload.id);
    throw new Error('No valid rows to import after parsing');
  }

  // Bulk insert
  const CHUNK = 500;
  for (let i = 0; i < txnInserts.length; i += CHUNK) {
    const slice = txnInserts.slice(i, i + CHUNK);
    const { error } = await supabase.from('fino_uploaded_transactions').insert(slice);
    if (error) {
      await supabase.from('fino_statement_uploads').update({
        status: 'failed', error_message: error.message,
      }).eq('id', upload.id);
      throw error;
    }
  }

  const { data: fresh } = await supabase
    .from('fino_statement_uploads').update({
      status: 'parsed',
      total_rows: rows.length - 1,
      parsed_rows: parsed,
      matched_rows: matched,
      period_from: periodFrom,
      period_to: periodTo,
      updated_at: new Date().toISOString(),
    }).eq('id', upload.id).select().single();

  return { upload: fresh || upload, parsed, matched };
}

// ─── Listing ─────────────────────────────────────────────────────────────────

async function listUploads({ accountId = null, status = null, uploadType = null, includeDeleted = false } = {}) {
  let q = supabase
    .from('fino_statement_uploads').select('*')
    .order('created_at', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (accountId)   q = q.eq('account_id', accountId);
  if (status)      q = q.eq('status', status);
  if (uploadType)  q = q.eq('upload_type', uploadType);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getUploadDetail(uploadId) {
  const { data: upload, error } = await supabase
    .from('fino_statement_uploads').select('*').eq('id', uploadId).maybeSingle();
  if (error) throw error;
  if (!upload) return null;
  const { data: txns, error: tErr } = await supabase
    .from('fino_uploaded_transactions').select('*')
    .eq('upload_id', uploadId)
    .order('row_number', { ascending: true });
  if (tErr) throw tErr;
  return { upload, transactions: txns || [] };
}

async function updateTransaction(txnId, fields) {
  const update = {};
  const map = {
    userCategory: 'user_category',
    userParty:    'user_party',
    userNotes:    'user_notes',
    matchStatus:  'match_status',
    detectedType: 'detected_type',
    detectedCategory: 'detected_category',
  };
  for (const [k, col] of Object.entries(map)) {
    if (fields[k] !== undefined) update[col] = fields[k];
  }
  if (!Object.keys(update).length) throw new Error('No editable fields supplied');

  const { data, error } = await supabase
    .from('fino_uploaded_transactions').update(update).eq('id', txnId).select().single();
  if (error) throw error;
  return data;
}

// ─── Import ──────────────────────────────────────────────────────────────────

async function importTransactions(uploadId, transactionIds) {
  if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
    throw new Error('transactionIds required');
  }
  const { data: upload, error } = await supabase
    .from('fino_statement_uploads').select('*').eq('id', uploadId).maybeSingle();
  if (error) throw error;
  if (!upload) throw new Error('Upload not found');
  if (upload.is_deleted) throw new Error('Upload is deleted');

  let accountCoaCode = null;
  if (upload.upload_type === 'bank_statement')   accountCoaCode = await bankCoaCode(upload.account_id);
  else if (upload.upload_type === 'cc_statement') accountCoaCode = await ccCoaCode(upload.account_id);
  if (!accountCoaCode) throw new Error('Account COA not resolvable');

  const { data: txns, error: tErr } = await supabase
    .from('fino_uploaded_transactions').select('*').in('id', transactionIds);
  if (tErr) throw tErr;

  let imported = 0;
  const ledgerGroups = [];

  for (const t of (txns || [])) {
    if (t.match_status === 'matched' || t.match_status === 'imported' || t.match_status === 'skipped') continue;

    const debit  = Number(t.debit_amount  || 0);
    const credit = Number(t.credit_amount || 0);
    if (!(debit > 0) && !(credit > 0)) continue;

    const cat = t.user_category || t.detected_category || 'Other';
    const counterCode = categoryToCoa(cat);
    const isDebit = debit > 0; // money OUT of bank
    const amount = isDebit ? debit : credit;

    // For bank statement:
    //   debit (money out)  → DEBIT counter (expense / cash etc) / CREDIT bank
    //   credit (money in)  → DEBIT bank / CREDIT counter (income)
    // For CC statement (liability — credit increases):
    //   debit on stmt (spend) → DEBIT counter / CREDIT cc
    //   credit on stmt (refund/cashback/payment) → DEBIT cc / CREDIT counter
    // The math is symmetric — same as bank since we just flip on isDebit.
    const lines = isDebit
      ? [
          { accountCode: counterCode,    direction: 'debit',  amount, description: t.description || cat },
          { accountCode: accountCoaCode, direction: 'credit', amount, description: t.description || cat },
        ]
      : [
          { accountCode: accountCoaCode, direction: 'debit',  amount, description: t.description || cat },
          { accountCode: counterCode,    direction: 'credit', amount, description: t.description || cat },
        ];

    let ledger;
    try {
      ledger = await createLedgerEntryGroup({
        txnDate: t.txn_date,
        lines,
        sourceModule: 'statement_import',
        sourceId: t.id,
        companyId: upload.company_id || null,
        description: t.description || `Imported ${cat}`,
      });
    } catch (e) {
      // Skip this row but record the error in user_notes
      await supabase.from('fino_uploaded_transactions').update({
        user_notes: `Import failed: ${e.message}`,
      }).eq('id', t.id);
      continue;
    }
    ledgerGroups.push(ledger);

    await supabase.from('fino_uploaded_transactions').update({
      match_status: 'imported',
      imported_ledger_group_id: ledger.txn_group_id,
    }).eq('id', t.id);
    imported += 1;
  }

  // Refresh bank balance if applicable
  if (upload.upload_type === 'bank_statement') {
    try { await refreshCurrentBalance(upload.account_id); } catch (_) {}
  }

  // Update upload counters
  const { data: updatedTxns } = await supabase
    .from('fino_uploaded_transactions').select('match_status').eq('upload_id', uploadId);
  const counts = (updatedTxns || []).reduce((a, x) => {
    a[x.match_status] = (a[x.match_status] || 0) + 1; return a;
  }, {});
  await supabase.from('fino_statement_uploads').update({
    matched_rows:  counts.matched  || 0,
    imported_rows: counts.imported || 0,
    skipped_rows:  counts.skipped  || 0,
    status: 'imported',
    updated_at: new Date().toISOString(),
  }).eq('id', uploadId);

  return { importedCount: imported, ledgerGroups };
}

async function skipTransactions(uploadId, transactionIds) {
  if (!Array.isArray(transactionIds) || transactionIds.length === 0) return { skipped: 0 };
  const { data, error } = await supabase
    .from('fino_uploaded_transactions').update({ match_status: 'skipped' })
    .in('id', transactionIds).eq('upload_id', uploadId).select('id');
  if (error) throw error;

  // Refresh counters on parent upload
  const { data: txns } = await supabase
    .from('fino_uploaded_transactions').select('match_status').eq('upload_id', uploadId);
  const counts = (txns || []).reduce((a, x) => { a[x.match_status] = (a[x.match_status] || 0) + 1; return a; }, {});
  await supabase.from('fino_statement_uploads').update({
    matched_rows:  counts.matched  || 0,
    imported_rows: counts.imported || 0,
    skipped_rows:  counts.skipped  || 0,
    updated_at: new Date().toISOString(),
  }).eq('id', uploadId);

  return { skipped: data?.length || 0 };
}

async function deleteUpload(uploadId, reason = null) {
  const { data: upload, error } = await supabase
    .from('fino_statement_uploads').select('*').eq('id', uploadId).maybeSingle();
  if (error) throw error;
  if (!upload) throw new Error('Upload not found');
  if (upload.is_deleted) throw new Error('Already deleted');

  // Reverse every imported ledger group
  const { data: txns } = await supabase
    .from('fino_uploaded_transactions').select('id, imported_ledger_group_id')
    .eq('upload_id', uploadId).eq('match_status', 'imported');
  for (const t of (txns || [])) {
    if (t.imported_ledger_group_id) {
      try { await reverseLedgerGroup({ txnGroupId: t.imported_ledger_group_id, reason: reason || 'Upload deleted' }); } catch (_) {}
    }
  }

  await supabase.from('fino_statement_uploads').update({
    is_deleted: true, status: 'deleted',
    updated_at: new Date().toISOString(),
  }).eq('id', uploadId);
  await supabase.from('fino_uploaded_transactions').update({ is_deleted: true }).eq('upload_id', uploadId);

  if (upload.upload_type === 'bank_statement') {
    try { await refreshCurrentBalance(upload.account_id); } catch (_) {}
  }
  return { success: true };
}

module.exports = {
  createUpload, parseCSV,
  autoDetectType, autoMatch,
  listUploads, getUploadDetail,
  updateTransaction,
  importTransactions, skipTransactions,
  deleteUpload,
  categoryToCoa, CATEGORY_TO_COA,
};
