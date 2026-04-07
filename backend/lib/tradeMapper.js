/**
 * Maps between Supabase (snake_case) and API (camelCase) for Trade.
 */

function fromDbTrade(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    tradeDate: row.trade_date,
    settleDate: row.settle_date,
    broker: row.broker || '',
    accountId: row.account_id || '',
    accountHolder: row.account_holder || '',
    segment: row.segment || 'Equity',
    type: row.type,
    symbol: row.symbol || '',
    isin: row.isin || '',
    quantity: Number(row.quantity) || 0,
    price: Number(row.price) || 0,
    amount: Number(row.amount) || 0,
    brokerage: Number(row.brokerage) || 0,
    stt: Number(row.stt) || 0,
    gst: Number(row.gst) || 0,
    sebiCharges: Number(row.sebi_charges) || 0,
    stampDuty: Number(row.stamp_duty) || 0,
    exchangeCharges: Number(row.exchange_charges) || 0,
    otherCharges: Number(row.other_charges) || 0,
    totalCharges: Number(row.total_charges) || 0,
    netAmount: Number(row.net_amount) || 0,
    exchange: row.exchange || '',
    uploadId: row.upload_id || '',
    sourceFile: row.source_file || '',
    rawData: row.raw_data || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDbTrade(t) {
  return {
    trade_date: t.tradeDate instanceof Date ? t.tradeDate.toISOString() : t.tradeDate,
    settle_date: t.settleDate instanceof Date ? t.settleDate.toISOString() : (t.settleDate || null),
    broker: t.broker || '',
    account_id: t.accountId || '',
    account_holder: t.accountHolder || '',
    segment: t.segment || 'Equity',
    type: t.type,
    symbol: t.symbol || '',
    isin: t.isin || '',
    quantity: t.quantity || 0,
    price: t.price || 0,
    amount: t.amount || 0,
    brokerage: t.brokerage || 0,
    stt: t.stt || 0,
    gst: t.gst || 0,
    sebi_charges: t.sebiCharges || 0,
    stamp_duty: t.stampDuty || 0,
    exchange_charges: t.exchangeCharges || 0,
    other_charges: t.otherCharges || 0,
    total_charges: t.totalCharges || 0,
    net_amount: t.netAmount || 0,
    exchange: t.exchange || '',
    upload_id: t.uploadId || '',
    source_file: t.sourceFile || '',
    raw_data: t.rawData || {},
  };
}

function fromDbTradeReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    uploadId: row.upload_id,
    uploadedAt: row.uploaded_at,
    files: row.files || [],
    summary: row.summary || {},
    createdAt: row.created_at,
  };
}

const SORT_FIELD_MAP = {
  tradeDate: 'trade_date',
  settleDate: 'settle_date',
  accountId: 'account_id',
  accountHolder: 'account_holder',
  totalCharges: 'total_charges',
  netAmount: 'net_amount',
  uploadId: 'upload_id',
  sourceFile: 'source_file',
  createdAt: 'created_at',
};

function toDbTradeField(field) {
  return SORT_FIELD_MAP[field] || field;
}

module.exports = { fromDbTrade, toDbTrade, fromDbTradeReport, toDbTradeField };
