/**
 * Maps between Supabase (snake_case) and API (camelCase) formats.
 */

function fromDb(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    date: row.date,
    description: row.description,
    debit: Number(row.debit) || 0,
    credit: Number(row.credit) || 0,
    balance: row.balance != null ? Number(row.balance) : null,
    bankName: row.bank_name,
    accountNumber: row.account_number || '',
    accountName: row.account_name || '',
    accountHolder: row.account_holder || '',
    referenceNo: row.reference_no || '',
    status: row.status || 'pending',
    duplicateOf: row.duplicate_of || null,
    uploadId: row.upload_id || '',
    uploadSessionId: row.upload_session_id || '',
    sourceFile: row.source_file || '',
    category: row.category || 'Uncategorized',
    rawData: row.raw_data || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    netFlow: (Number(row.credit) || 0) - (Number(row.debit) || 0),
  };
}

function toDb(t) {
  const obj = {
    date: t.date,
    description: t.description,
    debit: t.debit || 0,
    credit: t.credit || 0,
    balance: t.balance != null ? t.balance : null,
    bank_name: t.bankName,
    account_number: t.accountNumber || '',
    account_name: t.accountName || '',
    account_holder: t.accountHolder || '',
    reference_no: t.referenceNo || '',
    status: t.status || 'pending',
    upload_id: t.uploadId || '',
    upload_session_id: t.uploadSessionId || '',
    source_file: t.sourceFile || '',
    category: t.category || 'Uncategorized',
    raw_data: t.rawData || {},
  };
  if (t.duplicateOf) obj.duplicate_of = t.duplicateOf;
  return obj;
}

function fromDbReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    uploadId: row.upload_id,
    uploadedAt: row.uploaded_at,
    totalFiles: row.total_files,
    totalEntries: row.total_entries,
    totalUnique: row.total_unique,
    totalDuplicates: row.total_duplicates,
    totalErrors: row.total_errors,
    files: row.files || [],
    createdAt: row.created_at,
  };
}

// Maps camelCase sort field names to DB column names
const SORT_FIELD_MAP = {
  bankName: 'bank_name',
  accountNumber: 'account_number',
  accountHolder: 'account_holder',
  referenceNo: 'reference_no',
  uploadSessionId: 'upload_session_id',
  sourceFile: 'source_file',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  uploadId: 'upload_id',
};

function toDbField(field) {
  return SORT_FIELD_MAP[field] || field;
}

module.exports = { fromDb, toDb, toDbField, fromDbReport };
