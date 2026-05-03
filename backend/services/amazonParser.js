/**
 * Amazon Business Order Report Parser + Processor
 *
 * Responsibilities:
 *  1. Parse the raw CSV (handles BOM + first-col "Order Date" without header name)
 *  2. For each row:
 *      - Upsert Order (with lifecycle lock on Closed orders)
 *      - Create Transaction ONLY when Payment Amount is present
 *      - Unique key = OrderID|PaymentAmount|PaymentDate  → idempotent re-uploads
 *  3. Map Payment Identifier (last 4) → card_id using amz_cards
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');
const supabase = require('../lib/supabase');

// ─── Date helpers ──────────────────────────────────────────────────────────────

function normalizeDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === 'N/A' || /^[-_.\s…]+$/.test(s)) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // MM/DD/YYYY, MM-DD-YYYY, DD/MM/YYYY ambiguity → Amazon US uses MM/DD/YYYY
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let yr = m[3];
    if (yr.length === 2) yr = (parseInt(yr, 10) > 50 ? '19' : '20') + yr;
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    return `${yr}-${mm}-${dd}`;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
}

function parseNum(v) {
  if (v == null) return null;
  const s = String(v).replace(/[,\s$₹]/g, '').trim();
  if (!s || s === 'N/A') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function isEmpty(v) {
  if (v == null) return true;
  const s = String(v).trim();
  return s === '' || s === 'N/A';
}

// ─── CSV Reading ───────────────────────────────────────────────────────────────

function readCSV(filePath) {
  let raw = fs.readFileSync(filePath, 'utf-8');
  // Strip UTF-8 BOM if present
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

  // Row 1 of Amazon's CSV has leading whitespace before "Order ID" for the
  // unnamed Order Date column. We need to give that column a stable name.
  const nl = raw.indexOf('\n');
  if (nl > 0) {
    let header = raw.slice(0, nl);
    // Replace the first column name (often empty/whitespace) with "Order Date"
    const firstComma = header.indexOf(',');
    if (firstComma >= 0) {
      const firstName = header.slice(0, firstComma).trim();
      if (!firstName || /^[ \t…\.ï»¿]*$/i.test(firstName)) {
        header = 'Order Date' + header.slice(firstComma);
        raw = header + raw.slice(nl);
      }
    }
  }

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
    cast: false,
  });

  return rows;
}

// ─── Order Status helpers ──────────────────────────────────────────────────────

const CLOSED_STATUSES = ['closed', 'cancelled'];

function isClosedStatus(status) {
  if (!status) return false;
  return CLOSED_STATUSES.includes(String(status).trim().toLowerCase());
}

// ─── Main Processor ────────────────────────────────────────────────────────────

/**
 * Processes rows from an Amazon CSV, upserts orders, creates transactions
 * idempotently. Returns a summary report.
 */
async function processAmazonCSV(filePath, fileName) {
  const rows = readCSV(filePath);

  // Preload cards map (last_4 → card)
  const { data: cards, error: cardErr } = await supabase
    .from('amz_cards')
    .select('id, last_4, card_name');
  if (cardErr) throw cardErr;

  const cardByLast4 = new Map();
  for (const c of cards || []) cardByLast4.set(String(c.last_4).trim(), c);

  // Preload existing orders and closed set
  const orderIds = [...new Set(rows.map(r => (r['Order ID'] || '').trim()).filter(Boolean))];
  const existingOrders = new Map();
  if (orderIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < orderIds.length; i += CHUNK) {
      const slice = orderIds.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('amz_orders')
        .select('order_id, latest_status, is_closed')
        .in('order_id', slice);
      if (error) throw error;
      for (const o of data || []) existingOrders.set(o.order_id, o);
    }
  }

  // Preload existing unique_keys to detect duplicates up front
  const existingKeys = new Set();
  {
    const { data, error } = await supabase
      .from('amz_transactions')
      .select('unique_key');
    if (error) throw error;
    for (const t of data || []) existingKeys.add(t.unique_key);
  }

  const report = {
    totalRows: rows.length,
    ordersCreated: 0,
    ordersUpdated: 0,
    ordersLocked: 0,       // rows skipped because order already Closed
    transactionsCreated: 0,
    transactionsDuplicate: 0,
    unmappedLast4: new Map(),   // last4 → {count, sampleTitle}
    errors: [],
  };

  // ─── Per-row processing ─────────────────────────────────────────────────────
  // We accumulate changes then flush in batches.

  const orderUpserts = new Map(); // order_id → row payload
  const txnInserts = [];
  const seenKeysThisUpload = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNo = i + 2;
    try {
      const orderId = (row['Order ID'] || '').trim();
      if (!orderId) continue;

      const orderStatus = (row['Order Status'] || '').trim();
      const orderDate   = normalizeDate(row['Order Date']);
      const orderTotal  = parseNum(row['Order Net Total']) || 0;
      const orderQty    = parseInt(row['Order Quantity'], 10) || 0;

      const existing = existingOrders.get(orderId);
      const wasClosed = existing?.is_closed === true;

      // ── Order lifecycle ─────────────────────────────────────────────────
      if (wasClosed) {
        report.ordersLocked++;
        // Closed orders do NOT get status updates, but payments from this row
        // may still be new to the ledger (e.g. shouldn't happen but guard)
      } else {
        const closingNow = isClosedStatus(orderStatus);
        orderUpserts.set(orderId, {
          order_id: orderId,
          order_date: orderDate,
          latest_status: orderStatus || existing?.latest_status || null,
          is_closed: closingNow,
          order_net_total: orderTotal,
          order_quantity: orderQty,
          account_group: (row['Account Group'] || '').trim() || null,
          account_user: (row['Account User'] || '').trim() || null,
          last_updated_at: new Date().toISOString(),
          raw_meta: {
            currency: row['Currency'],
            subtotal: parseNum(row['Order Subtotal']),
            tax: parseNum(row['Order Tax']),
            promotion: parseNum(row['Order Promotion']),
            shipping: parseNum(row['Order Shipping & Handling']),
          },
        });
      }

      // ── Transaction: ONLY when Payment Amount present ───────────────────
      const paymentAmount = parseNum(row['Payment Amount']);
      const paymentDate   = normalizeDate(row['Payment Date']);
      if (paymentAmount == null || paymentAmount <= 0 || !paymentDate) continue;
      if (isEmpty(row['Payment Reference ID']) && isEmpty(row['Payment Identifier'])) continue;

      const uniqueKey = `${orderId}|${paymentAmount.toFixed(2)}|${paymentDate}`;
      if (existingKeys.has(uniqueKey) || seenKeysThisUpload.has(uniqueKey)) {
        report.transactionsDuplicate++;
        continue;
      }
      seenKeysThisUpload.add(uniqueKey);

      // Card mapping
      const last4raw = (row['Payment Identifier'] || '').trim();
      const last4 = (last4raw && last4raw !== 'N/A') ? last4raw : null;
      const card = last4 ? cardByLast4.get(last4) : null;
      if (last4 && !card) {
        const entry = report.unmappedLast4.get(last4) || { count: 0, sampleTitle: '' };
        entry.count++;
        if (!entry.sampleTitle) entry.sampleTitle = (row['Title'] || '').slice(0, 60);
        report.unmappedLast4.set(last4, entry);
      }

      txnInserts.push({
        unique_key: uniqueKey,
        txn_type: 'Purchase',
        txn_date: paymentDate,
        amount: paymentAmount,
        card_id: card?.id || null,
        card_last4: last4,
        order_id: orderId,
        payment_reference_id: (row['Payment Reference ID'] || '').trim() || null,
        payment_instrument_type: (row['Payment Instrument Type'] || '').trim() || null,
        asin: (row['ASIN'] || '').trim() || null,
        title: (row['Title'] || '').trim() || null,
        raw_row: {
          orderNetTotal: orderTotal,
          itemNetTotal: parseNum(row['Item Net Total']),
          itemQuantity: parseInt(row['Item Quantity'], 10) || 0,
          seller: (row['Seller Name'] || '').trim(),
        },
      });
    } catch (err) {
      report.errors.push({ line: lineNo, error: err.message });
    }
  }

  // ─── Flush orders (upsert) ──────────────────────────────────────────────────
  const orderRows = [...orderUpserts.values()];
  for (let i = 0; i < orderRows.length; i += 500) {
    const slice = orderRows.slice(i, i + 500);
    const { error } = await supabase
      .from('amz_orders')
      .upsert(slice, { onConflict: 'order_id' });
    if (error) throw error;
  }
  // Count created vs updated
  for (const o of orderRows) {
    if (existingOrders.has(o.order_id)) report.ordersUpdated++;
    else report.ordersCreated++;
  }

  // ─── Flush transactions (insert, unique_key conflict = duplicate) ───────────
  for (let i = 0; i < txnInserts.length; i += 500) {
    const slice = txnInserts.slice(i, i + 500);
    const { data, error } = await supabase
      .from('amz_transactions')
      .insert(slice)
      .select('id');
    if (error) {
      // Fallback: insert one-by-one to catch conflict rows gracefully
      for (const row of slice) {
        const { error: e2 } = await supabase.from('amz_transactions').insert(row);
        if (e2 && /duplicate key|unique/i.test(e2.message)) {
          report.transactionsDuplicate++;
        } else if (e2) {
          report.errors.push({ line: 0, error: e2.message });
        } else {
          report.transactionsCreated++;
        }
      }
    } else {
      report.transactionsCreated += data?.length || 0;
    }
  }

  // ─── Save audit report ──────────────────────────────────────────────────────
  const uploadId = `amz_${Date.now()}`;
  const unmappedArr = [...report.unmappedLast4.entries()].map(([last4, v]) => ({
    last4, count: v.count, sampleTitle: v.sampleTitle,
  }));

  await supabase.from('amz_upload_reports').insert({
    upload_id: uploadId,
    file_name: fileName,
    total_rows: report.totalRows,
    orders_created: report.ordersCreated,
    orders_updated: report.ordersUpdated,
    orders_locked: report.ordersLocked,
    transactions_created: report.transactionsCreated,
    transactions_duplicate: report.transactionsDuplicate,
    unmapped_last4: unmappedArr,
    errors: report.errors.slice(0, 200),
  });

  return {
    uploadId,
    totalRows: report.totalRows,
    ordersCreated: report.ordersCreated,
    ordersUpdated: report.ordersUpdated,
    ordersLocked: report.ordersLocked,
    transactionsCreated: report.transactionsCreated,
    transactionsDuplicate: report.transactionsDuplicate,
    unmappedLast4: unmappedArr,
    errors: report.errors.slice(0, 50),
  };
}

module.exports = { processAmazonCSV, normalizeDate, parseNum };
