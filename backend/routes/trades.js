/**
 * Trades Route
 * POST   /api/trades/upload     - Upload broker statements
 * GET    /api/trades             - List trades with filters
 * GET    /api/trades/summary     - Period summary with KPIs
 * GET    /api/trades/pnl         - FIFO P&L per symbol
 * GET    /api/trades/charges     - Charges breakdown
 * GET    /api/trades/holdings    - Current holdings
 * GET    /api/trades/reports     - Upload reports
 * DELETE /api/trades/clear       - Clear all trades
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { parseTradeCSV } = require('../services/parsers/tradeCsvParser');
const { parseTradeXLSXAsync } = require('../services/parsers/tradeXlsxParser');
const { detectBroker, extractAccountHolder, extractAccountId } = require('../services/brokerDetector');
const { normalizeTradeRow } = require('../services/brokerNormalizer');
const { calculatePnL, calculateHoldings, getMonthlyPnL, getQuarterlyPnL, aggregatePnL } = require('../services/pnlCalculator');
const supabase = require('../lib/supabase');
const { fromDbTrade, toDbTrade, fromDbTradeReport, toDbTradeField } = require('../lib/tradeMapper');

// ─── Multer Setup ──────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${base}_${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.csv', '.xlsx', '.xls'];
  const ext = path.extname(file.originalname).toLowerCase();
  allowed.includes(ext) ? cb(null, true) : cb(new Error(`File type "${ext}" not supported.`), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Upload Trades ────────────────────────────────────────────────────────────

router.post('/upload', upload.array('files', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded.' });
  }

  const uploadId = `tradeup_${Date.now()}`;
  const fileReports = [];
  const globalErrors = [];
  let totalImported = 0;
  let totalBrokerage = 0;
  let totalSTT = 0;
  let totalCharges = 0;
  let totalBuyValue = 0;
  let totalSellValue = 0;

  for (const file of req.files) {
    const report = {
      fileName: file.originalname,
      broker: 'Unknown',
      accountHolder: '',
      accountId: '',
      totalTrades: 0,
      buyTrades: 0,
      sellTrades: 0,
      totalBrokerage: 0,
      totalSTT: 0,
      totalOtherCharges: 0,
      errors: 0,
      errorDetails: [],
    };

    try {
      const ext = path.extname(file.originalname).toLowerCase();
      let rows = [], rawContent = '';

      if (ext === '.csv') {
        ({ rows, rawContent } = parseTradeCSV(file.path));
      } else {
        ({ rows, rawContent } = await parseTradeXLSXAsync(file.path, []));
      }

      const brokerInfo = detectBroker(rawContent || rows.map(r => Object.values(r).join(',')).join('\n'));
      const brokerKey = brokerInfo?.key || 'UNKNOWN';
      const brokerName = brokerInfo?.name || 'Unknown';
      const columnMap = brokerInfo?.columnMap || null;
      const accountHolder = extractAccountHolder(rawContent || '');
      const accountId = extractAccountId(rawContent || '');

      report.broker = brokerName;
      report.accountHolder = accountHolder;
      report.accountId = accountId;

      const tradesToInsert = [];

      for (const row of rows) {
        try {
          const result = normalizeTradeRow(row, brokerKey, columnMap);
          if (!result) continue;

          // 5Paisa returns array, others return object
          const trades = Array.isArray(result) ? result : [result];

          for (const trade of trades) {
            tradesToInsert.push({
              ...trade,
              broker: brokerName,
              accountId,
              accountHolder,
              uploadId,
              sourceFile: file.originalname,
              rawData: row,
            });

            report.totalTrades++;
            if (trade.type === 'BUY') {
              report.buyTrades++;
              totalBuyValue += trade.amount;
            } else {
              report.sellTrades++;
              totalSellValue += trade.amount;
            }
            report.totalBrokerage += trade.brokerage;
            report.totalSTT += trade.stt;
            report.totalOtherCharges += (trade.gst + trade.sebiCharges + trade.stampDuty + trade.exchangeCharges);

            totalBrokerage += trade.brokerage;
            totalSTT += trade.stt;
            totalCharges += trade.totalCharges;
          }
        } catch (err) {
          report.errors++;
          report.errorDetails.push(`Row error: ${err.message}`);
        }
      }

      if (tradesToInsert.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < tradesToInsert.length; i += CHUNK) {
          const chunk = tradesToInsert.slice(i, i + CHUNK).map(toDbTrade);
          const { error } = await supabase.from('trades').insert(chunk);
          if (error) {
            report.errors++;
            report.errorDetails.push(`DB insert error: ${error.message}`);
            throw new Error(`DB insert failed: ${error.message}`);
          }
        }
        totalImported += tradesToInsert.length;
      } else {
        throw new Error(`No valid trades found in "${file.originalname}".`);
      }

      fileReports.push(report);
    } catch (err) {
      globalErrors.push({ file: file.originalname, error: err.message });
      report.errors++;
      report.errorDetails.push(err.message);
      fileReports.push(report);
    } finally {
      try { fs.unlinkSync(file.path); } catch {}
    }
  }

  const summary = {
    totalTrades: totalImported,
    totalBrokerage: +totalBrokerage.toFixed(2),
    totalSTT: +totalSTT.toFixed(2),
    totalCharges: +totalCharges.toFixed(2),
    totalBuyValue: +totalBuyValue.toFixed(2),
    totalSellValue: +totalSellValue.toFixed(2),
  };

  // Save report
  await supabase.from('trade_upload_reports').insert({
    upload_id: uploadId,
    files: fileReports,
    summary,
  });

  res.json({
    success: true,
    uploadId,
    summary,
    files: fileReports,
    errors: globalErrors,
  });
});

// ─── List Trades ──────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const {
      broker, symbol, segment, type, accountId,
      startDate, endDate,
      page = 1, limit = 100,
      sortBy = 'tradeDate', sortOrder = 'desc',
    } = req.query;

    let query = supabase.from('trades').select('*', { count: 'exact' });

    if (broker && broker !== 'all') query = query.eq('broker', broker);
    if (symbol) query = query.ilike('symbol', `%${symbol}%`);
    if (segment && segment !== 'all') query = query.eq('segment', segment);
    if (type && type !== 'all') query = query.eq('type', type);
    if (accountId) query = query.eq('account_id', accountId);
    if (startDate) query = query.gte('trade_date', new Date(startDate).toISOString());
    if (endDate) query = query.lte('trade_date', new Date(endDate + 'T23:59:59').toISOString());

    const dbField = toDbTradeField(sortBy);
    query = query.order(dbField, { ascending: sortOrder !== 'desc' });

    const pageNum = parseInt(page);
    const pageSize = parseInt(limit);
    const from = (pageNum - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      trades: data.map(fromDbTrade),
      pagination: {
        page: pageNum,
        limit: pageSize,
        total: count,
        pages: Math.ceil(count / pageSize),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Helper: fetch all trades with filters ──────────────────────────────────

async function fetchAllTrades(query) {
  const { startDate, endDate, broker, accountId } = query;
  let q = supabase.from('trades').select('*');
  if (startDate) q = q.gte('trade_date', new Date(startDate).toISOString());
  if (endDate) q = q.lte('trade_date', new Date(endDate + 'T23:59:59').toISOString());
  if (broker && broker !== 'all') q = q.eq('broker', broker);
  if (accountId) q = q.eq('account_id', accountId);
  q = q.order('trade_date', { ascending: true });

  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(fromDbTrade);
}

// ─── Summary (period KPIs) ────────────────────────────────────────────────────

router.get('/summary', async (req, res) => {
  try {
    const { period = 'all', date, broker, accountId } = req.query;

    // Determine date range based on period
    let startDate, endDate, label;
    const now = date ? new Date(date) : new Date();

    if (period === 'day') {
      startDate = new Date(now); startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now); endDate.setHours(23, 59, 59, 999);
      label = startDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      label = startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (period === 'quarter') {
      const m = now.getMonth();
      const qStart = m - (m % 3);
      startDate = new Date(now.getFullYear(), qStart, 1);
      endDate = new Date(now.getFullYear(), qStart + 3, 0, 23, 59, 59);
      label = `Q${Math.floor(qStart / 3) + 1} ${now.getFullYear()}`;
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      label = String(now.getFullYear());
    } else {
      startDate = null;
      endDate = null;
      label = 'All Time';
    }

    let q = supabase.from('trades').select('*');
    if (startDate) q = q.gte('trade_date', startDate.toISOString());
    if (endDate) q = q.lte('trade_date', endDate.toISOString());
    if (broker && broker !== 'all') q = q.eq('broker', broker);
    if (accountId) q = q.eq('account_id', accountId);

    const { data: rawTrades, error } = await q;
    if (error) throw error;
    const trades = (rawTrades || []).map(fromDbTrade);

    // For accurate P&L, calculate using ALL historical trades up to endDate (FIFO needs full history)
    let allHistoricalQ = supabase.from('trades').select('*');
    if (endDate) allHistoricalQ = allHistoricalQ.lte('trade_date', endDate.toISOString());
    if (broker && broker !== 'all') allHistoricalQ = allHistoricalQ.eq('broker', broker);
    if (accountId) allHistoricalQ = allHistoricalQ.eq('account_id', accountId);
    const { data: histRaw } = await allHistoricalQ;
    const histTrades = (histRaw || []).map(fromDbTrade);
    const allPnL = calculatePnL(histTrades);

    // Filter symbol-pnl to only show those with sells in the period
    const symbolsWithSellInPeriod = new Set(
      trades.filter(t => t.type === 'SELL').map(t => t.symbol)
    );
    const periodPnL = allPnL.filter(p => symbolsWithSellInPeriod.has(p.symbol));

    const totalBuyValue = trades.filter(t => t.type === 'BUY').reduce((s, t) => s + t.amount, 0);
    const totalSellValue = trades.filter(t => t.type === 'SELL').reduce((s, t) => s + t.amount, 0);
    const totalBrokerage = trades.reduce((s, t) => s + t.brokerage, 0);
    const totalSTT = trades.reduce((s, t) => s + t.stt, 0);
    const totalGST = trades.reduce((s, t) => s + t.gst, 0);
    const totalOtherCharges = trades.reduce((s, t) => s + t.sebiCharges + t.stampDuty + t.exchangeCharges + t.otherCharges, 0);
    const totalAllCharges = trades.reduce((s, t) => s + t.totalCharges, 0);
    const totalRealizedPnL = periodPnL.reduce((s, p) => s + p.realizedPnL, 0);
    const netPnL = totalRealizedPnL;

    const profitTrades = periodPnL.filter(p => p.realizedPnL > 0).length;
    const lossTrades = periodPnL.filter(p => p.realizedPnL < 0).length;

    const sortedByPnL = periodPnL.slice().sort((a, b) => b.realizedPnL - a.realizedPnL);
    const topGainers = sortedByPnL.slice(0, 5).map(p => ({ symbol: p.symbol, pnl: p.realizedPnL }));
    const topLosers = sortedByPnL.slice(-5).reverse().map(p => ({ symbol: p.symbol, pnl: p.realizedPnL }));

    // By Segment
    const segMap = {};
    trades.forEach(t => {
      if (!segMap[t.segment]) segMap[t.segment] = { segment: t.segment, pnl: 0, charges: 0, trades: 0 };
      segMap[t.segment].charges += t.totalCharges;
      segMap[t.segment].trades++;
    });
    periodPnL.forEach(p => {
      // Need segment info - skip for now or attribute by first trade
      const sample = trades.find(t => t.symbol === p.symbol);
      if (sample && segMap[sample.segment]) {
        segMap[sample.segment].pnl += p.realizedPnL;
      }
    });
    const bySegment = Object.values(segMap);

    // By Broker
    const brokerMap = {};
    trades.forEach(t => {
      if (!brokerMap[t.broker]) brokerMap[t.broker] = { broker: t.broker, trades: 0, totalValue: 0, charges: 0, pnl: 0 };
      brokerMap[t.broker].trades++;
      brokerMap[t.broker].totalValue += t.amount;
      brokerMap[t.broker].charges += t.totalCharges;
    });
    periodPnL.forEach(p => {
      const sample = trades.find(t => t.symbol === p.symbol);
      if (sample && brokerMap[sample.broker]) {
        brokerMap[sample.broker].pnl += p.realizedPnL;
      }
    });
    const byBroker = Object.values(brokerMap);

    res.json({
      period: label,
      totalBuyValue: +totalBuyValue.toFixed(2),
      totalSellValue: +totalSellValue.toFixed(2),
      totalRealizedPnL: +totalRealizedPnL.toFixed(2),
      totalBrokerage: +totalBrokerage.toFixed(2),
      totalSTT: +totalSTT.toFixed(2),
      totalGST: +totalGST.toFixed(2),
      totalOtherCharges: +totalOtherCharges.toFixed(2),
      totalAllCharges: +totalAllCharges.toFixed(2),
      netPnL: +netPnL.toFixed(2),
      totalTrades: trades.length,
      profitTrades,
      lossTrades,
      winRate: periodPnL.length > 0 ? +((profitTrades / periodPnL.length) * 100).toFixed(1) : 0,
      topGainers,
      topLosers,
      bySegment,
      byBroker,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Detailed P&L (per symbol with FIFO) ──────────────────────────────────────

router.get('/pnl', async (req, res) => {
  try {
    const { startDate, endDate, pnlType } = req.query;
    const trades = await fetchAllTrades(req.query);
    let pnl = calculatePnL(trades);

    if (pnlType === 'STCG') pnl = pnl.filter(p => p.stcgPnL !== 0);
    else if (pnlType === 'LTCG') pnl = pnl.filter(p => p.ltcgPnL !== 0);

    // Also generate monthly and quarterly views
    const monthly = [];
    const quarterly = [];
    const tradesByDate = trades.reduce((acc, t) => {
      const d = new Date(t.tradeDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    }, {});

    Object.keys(tradesByDate).sort().forEach(key => {
      const [year, month] = key.split('-').map(Number);
      monthly.push(getMonthlyPnL(trades, year, month));
    });

    // Quarterly (Indian FY)
    const fyMap = {};
    trades.forEach(t => {
      const d = new Date(t.tradeDate);
      const m = d.getMonth() + 1;
      const fy = m >= 4 ? d.getFullYear() : d.getFullYear() - 1;
      const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 && m <= 12 ? 3 : 4;
      const key = `${fy}-Q${q}`;
      if (!fyMap[key]) fyMap[key] = { fy, q };
    });
    Object.values(fyMap).forEach(({ fy, q }) => {
      quarterly.push(getQuarterlyPnL(trades, fy, q));
    });

    res.json({ symbolPnL: pnl, monthly, quarterly });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Charges Breakdown ────────────────────────────────────────────────────────

router.get('/charges', async (req, res) => {
  try {
    const trades = await fetchAllTrades(req.query);

    const totalBrokerage = trades.reduce((s, t) => s + t.brokerage, 0);
    const totalSTT = trades.reduce((s, t) => s + t.stt, 0);
    const totalGST = trades.reduce((s, t) => s + t.gst, 0);
    const totalStampDuty = trades.reduce((s, t) => s + t.stampDuty, 0);
    const totalSEBI = trades.reduce((s, t) => s + t.sebiCharges, 0);
    const totalExchange = trades.reduce((s, t) => s + t.exchangeCharges, 0);
    const totalOther = trades.reduce((s, t) => s + t.otherCharges, 0);
    const grandTotal = trades.reduce((s, t) => s + t.totalCharges, 0);

    // By Broker
    const brokerMap = {};
    trades.forEach(t => {
      if (!brokerMap[t.broker]) brokerMap[t.broker] = { broker: t.broker, brokerage: 0, stt: 0, gst: 0, stampDuty: 0, total: 0 };
      brokerMap[t.broker].brokerage += t.brokerage;
      brokerMap[t.broker].stt += t.stt;
      brokerMap[t.broker].gst += t.gst;
      brokerMap[t.broker].stampDuty += t.stampDuty;
      brokerMap[t.broker].total += t.totalCharges;
    });

    // By Month
    const monthMap = {};
    trades.forEach(t => {
      const d = new Date(t.tradeDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[key]) monthMap[key] = { month: key, brokerage: 0, stt: 0, gst: 0, total: 0 };
      monthMap[key].brokerage += t.brokerage;
      monthMap[key].stt += t.stt;
      monthMap[key].gst += t.gst;
      monthMap[key].total += t.totalCharges;
    });

    // By Segment
    const segMap = {};
    trades.forEach(t => {
      if (!segMap[t.segment]) segMap[t.segment] = { segment: t.segment, brokerage: 0, stt: 0, gst: 0, total: 0 };
      segMap[t.segment].brokerage += t.brokerage;
      segMap[t.segment].stt += t.stt;
      segMap[t.segment].gst += t.gst;
      segMap[t.segment].total += t.totalCharges;
    });

    res.json({
      totalBrokerage: +totalBrokerage.toFixed(2),
      totalSTT: +totalSTT.toFixed(2),
      totalGST: +totalGST.toFixed(2),
      totalStampDuty: +totalStampDuty.toFixed(2),
      totalSEBI: +totalSEBI.toFixed(2),
      totalExchange: +totalExchange.toFixed(2),
      totalOther: +totalOther.toFixed(2),
      grandTotal: +grandTotal.toFixed(2),
      byBroker: Object.values(brokerMap),
      byMonth: Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)),
      bySegment: Object.values(segMap),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Holdings ────────────────────────────────────────────────────────────────

router.get('/holdings', async (req, res) => {
  try {
    const trades = await fetchAllTrades(req.query);
    const holdings = calculateHoldings(trades);

    // Add broker and account from trade data
    const enriched = holdings.map(h => {
      const sample = trades.filter(t => t.symbol === h.symbol && t.type === 'BUY').slice(-1)[0];
      return {
        ...h,
        broker: sample?.broker || '',
        accountHolder: sample?.accountHolder || '',
        accountId: sample?.accountId || '',
      };
    });

    res.json({
      holdings: enriched,
      totalSymbols: enriched.length,
      totalInvested: +enriched.reduce((s, h) => s + h.totalInvested, 0).toFixed(2),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Reports ────────────────────────────────────────────────────────────────

router.get('/reports', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('trade_upload_reports')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    res.json({ reports: (data || []).map(fromDbTradeReport) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Distinct Brokers ────────────────────────────────────────────────────────

router.get('/brokers', async (req, res) => {
  try {
    const { data, error } = await supabase.from('trades').select('broker');
    if (error) throw error;
    const brokers = [...new Set((data || []).map(r => r.broker))].filter(Boolean);
    res.json({ brokers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Clear All Trades ────────────────────────────────────────────────────────

router.delete('/clear', async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('trades')
      .delete({ count: 'exact' })
      .gte('created_at', '1970-01-01');

    if (error) throw error;

    await supabase.from('trade_upload_reports').delete().gte('created_at', '1970-01-01');

    res.json({ deleted: count, message: 'All trades and reports cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
