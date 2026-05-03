/**
 * Share Market Route - Upload, Overview, Accounts
 * Handles Ledger + P&L Excel file uploads with per-account tracking.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const supabase = require('../lib/supabase');
const { parseExcel } = require('../services/parsers/tradeXlsxParser');

// ─── Multer Setup ────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${base}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ['.csv', '.xlsx', '.xls'].includes(ext) ? cb(null, true) : cb(new Error(`Unsupported: ${ext}`), false);
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ─── Helper: flexible column getter ─────────────────────────────────────────

function getCol(row, names) {
  const keys = Object.keys(row);
  // Pass 1: exact match (lowercase)
  for (const n of names) {
    const key = keys.find(k => k.toLowerCase().trim() === n.toLowerCase());
    if (key && row[key] !== undefined && String(row[key]).trim() !== '') return row[key];
  }
  // Pass 2: substring match (e.g. "VoucherDate" contains "date")
  for (const n of names) {
    const key = keys.find(k => k.toLowerCase().includes(n.toLowerCase()));
    if (key && row[key] !== undefined && String(row[key]).trim() !== '') return row[key];
  }
  return null;
}

function parseNum(val) {
  if (!val) return 0;
  return parseFloat(String(val).replace(/[₹,\s()]/g, '')) || 0;
}

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Upload Files ────────────────────────────────────────────────────────────

router.post('/upload', upload.array('files', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded.' });
  }

  let fileMeta = {};
  try { fileMeta = JSON.parse(req.body.fileMeta || '{}'); } catch {}

  const results = [];

  for (const file of req.files) {
    const meta = fileMeta[file.originalname] || {};
    const accountName = (meta.accountName || '').trim();
    const fileType = meta.fileType || 'auto'; // 'ledger', 'pnl', 'auto'

    const report = {
      fileName: file.originalname,
      accountName,
      fileType,
      entries: 0,
      errors: [],
    };

    try {
      const { rows, headers, detectedType } = await parseExcel(file.path, []);

      // Resolve file type
      const resolvedType = fileType !== 'auto' ? fileType
        : detectedType === 'ledger' ? 'ledger'
        : detectedType === 'pnl' ? 'pnl'
        : /ledger/i.test(file.originalname) ? 'ledger' : 'pnl';

      report.fileType = resolvedType;
      report.headers = headers;

      // Ensure account exists
      if (accountName) {
        await supabase.from('stock_accounts').upsert(
          { account_name: accountName, updated_at: new Date().toISOString() },
          { onConflict: 'account_name', ignoreDuplicates: false }
        );
      }

      // Add debug info: headers + first 3 rows
      report.debug = {
        headers,
        detectedType,
        sampleRows: rows.slice(0, 3).map(r => {
          const obj = {};
          Object.keys(r).forEach(k => { obj[k] = r[k]; });
          return obj;
        }),
        totalRawRows: rows.length,
      };

      if (resolvedType === 'ledger') {
        // ─── LEDGER ──────────────────────────────────────────────────────
        const ledgerRows = [];
        for (const row of rows) {
          try {
            const dateVal = getCol(row, ['date', 'tran date', 'trade date', 'voucher date', 'value date', 'posting date', 'transaction date', 'entry date']);
            const descVal = getCol(row, ['particulars', 'description', 'narration', 'remarks', 'details', 'voucher narration', 'transaction']);
            const debitVal = getCol(row, ['debit', 'dr', 'debit amount']);
            const creditVal = getCol(row, ['credit', 'cr', 'credit amount']);
            const amtVal = getCol(row, ['amount', 'net amount', 'value']);
            const balVal = getCol(row, ['balance', 'closing balance', 'running balance', 'bal']);

            const parsedDate = parseDate(dateVal);
            if (!parsedDate) continue;

            const debit = parseNum(debitVal);
            const credit = parseNum(creditVal);
            let amount = 0;
            let isOutflow = false;

            if (debit > 0 || credit > 0) {
              // Separate debit/credit columns
              amount = debit > 0 ? debit : credit;
              isOutflow = debit > 0;
            } else {
              // Single amount column (Manthan style: negative = outflow, positive = inflow)
              const raw = parseFloat(String(amtVal || '0').replace(/[₹,\s]/g, '')) || 0;
              amount = Math.abs(raw);
              isOutflow = raw < 0;
            }

            const balance = parseNum(balVal);
            if (amount === 0 && balance === 0) continue;

            // Classify entry type from description + Manthan Category column
            const desc = String(descVal || '').toLowerCase();
            const category = String(getCol(row, ['category', 'type', 'vouchertype', 'voucher type']) || '').toLowerCase();
            let entryType = 'Other';

            if (/deposit|payin|pay.?in|fund.*in|received/i.test(desc)) entryType = 'Deposit';
            else if (/withdraw|payout|pay.?out|fund.*out/i.test(desc)) entryType = 'Withdrawal';
            else if (/dividend/i.test(desc)) entryType = 'Dividend';
            else if (/brokerage|commission|charge|fee|turnover/i.test(desc)) entryType = 'Charges';
            else if (/\bstt\b|tax|gst|tds|stamp/i.test(desc)) entryType = 'Tax';
            else if (/interest/i.test(desc)) entryType = 'Interest';
            else if (/trade.*bill|bill.*posted/i.test(desc) || category === 'trades') entryType = isOutflow ? 'Trade Loss' : 'Trade Profit';
            else if (/fund.*transfer|bank.*transfer|neft|rtgs|imps/i.test(desc)) entryType = isOutflow ? 'Withdrawal' : 'Deposit';
            else if (isOutflow) entryType = 'Withdrawal';
            else entryType = 'Deposit';

            ledgerRows.push({
              entry_date: parsedDate.toISOString(),
              account_name: accountName,
              entry_type: entryType,
              description: String(descVal || ''),
              amount,
              balance,
              source_file: file.originalname,
              raw_data: row,
            });
          } catch {}
        }

        if (ledgerRows.length > 0) {
          const CHUNK = 500;
          for (let i = 0; i < ledgerRows.length; i += CHUNK) {
            const { error } = await supabase.from('ledger_entries').insert(ledgerRows.slice(i, i + CHUNK));
            if (error) throw new Error(`Ledger insert failed: ${error.message}`);
          }
          report.entries = ledgerRows.length;
        } else {
          report.errors.push('No valid ledger entries found.');
        }

      } else {
        // ─── P&L (Transaction-wise) ──────────────────────────────────────
        const pnlRows = [];
        for (const row of rows) {
          try {
            // Flexible column mapping for P&L
            const symbol = getCol(row, ['script', 'script name', 'scriptname', 'symbol', 'symbol name', 'tradingsymbol', 'scrip', 'scrip name', 'stock', 'fullname', 'shortname', 'instrument']);
            const buyDate = getCol(row, ['buy date', 'buydate', 'purchase date', 'buy_date']);
            const sellDate = getCol(row, ['sell date', 'selldate', 'sale date', 'sell_date']);
            const buyRate = getCol(row, ['buy rate', 'buyrate', 'buy price', 'purchase price', 'buy_rate', 'purchase_rate', 'avg buy price']);
            const sellRate = getCol(row, ['sell rate', 'sellrate', 'sell price', 'sale price', 'sell_rate', 'sale_rate', 'avg sell price']);
            const qty = getCol(row, ['qty', 'quantity', 'delivqty', 'net qty', 'buy qty', 'sell qty', 'units']);
            const pnlVal = getCol(row, ['profit', 'loss', 'p&l', 'pnl', 'profit/loss', 'gainloss', 'gain/loss', 'net p&l', 'realized p&l', 'realised p&l', 'shorttermgainloss', 'longtermgainloss']);
            const buyValue = getCol(row, ['buy value', 'purchase value', 'purchase_value', 'buy amount', 'cost']);
            const sellValue = getCol(row, ['sell value', 'sale value', 'sale_value', 'sell amount', 'proceeds']);

            const parsedBuyDate = parseDate(buyDate);
            const parsedSellDate = parseDate(sellDate);
            const parsedPnL = parseFloat(String(pnlVal || '0').replace(/[₹,\s]/g, '')) || 0;

            // Need at least a P&L value or dates to be a valid row
            if (parsedPnL === 0 && !parsedBuyDate && !parsedSellDate) continue;

            const parsedQty = parseNum(qty);
            const parsedBuyRate = parseNum(buyRate);
            const parsedSellRate = parseNum(sellRate);
            const parsedBuyValue = parseNum(buyValue) || (parsedQty * parsedBuyRate);
            const parsedSellValue = parseNum(sellValue) || (parsedQty * parsedSellRate);

            pnlRows.push({
              account_name: accountName,
              symbol: symbol ? String(symbol).trim() : '-',
              buy_date: parsedBuyDate ? parsedBuyDate.toISOString() : null,
              sell_date: parsedSellDate ? parsedSellDate.toISOString() : null,
              quantity: parsedQty,
              buy_rate: parsedBuyRate,
              sell_rate: parsedSellRate,
              buy_value: +parsedBuyValue.toFixed(2),
              sell_value: +parsedSellValue.toFixed(2),
              pnl: +parsedPnL.toFixed(2),
              source_file: file.originalname,
              raw_data: row,
            });
          } catch {}
        }

        if (pnlRows.length > 0) {
          const CHUNK = 500;
          for (let i = 0; i < pnlRows.length; i += CHUNK) {
            const { error } = await supabase.from('trade_pnl').insert(pnlRows.slice(i, i + CHUNK));
            if (error) throw new Error(`P&L insert failed: ${error.message}`);
          }
          report.entries = pnlRows.length;
        } else {
          report.errors.push('No valid P&L entries found.');
        }
      }

      results.push(report);
    } catch (err) {
      report.errors.push(err.message);
      results.push(report);
    } finally {
      try { fs.unlinkSync(file.path); } catch {}
    }
  }

  res.json({ success: true, files: results });
});

// ─── Accounts List ───────────────────────────────────────────────────────────

router.get('/accounts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stock_accounts')
      .select('*')
      .order('account_name', { ascending: true });
    if (error) throw error;
    res.json({ accounts: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Overview: Per-account P&L + Ledger summary ─────────────────────────────

router.get('/overview', async (req, res) => {
  try {
    // Fetch all P&L entries (table may not exist yet — graceful fallback)
    let pnlData = [];
    try {
      const { data, error } = await supabase
        .from('trade_pnl')
        .select('account_name, symbol, pnl, buy_value, sell_value');
      if (!error) pnlData = data || [];
    } catch {}

    // Fetch all ledger entries
    const { data: ledgerData, error: ledgerErr } = await supabase
      .from('ledger_entries')
      .select('account_name, entry_type, amount, balance, entry_date');
    if (ledgerErr) throw ledgerErr;

    // Fetch accounts
    const { data: accounts, error: accErr } = await supabase
      .from('stock_accounts')
      .select('*')
      .order('account_name', { ascending: true });
    if (accErr) throw accErr;

    // Build per-account summary
    const accountSummaries = (accounts || []).map(acc => {
      const name = acc.account_name;

      // P&L summary
      const acPnl = (pnlData || []).filter(r => r.account_name === name);
      const totalProfit = acPnl.filter(r => r.pnl > 0).reduce((s, r) => s + r.pnl, 0);
      const totalLoss = acPnl.filter(r => r.pnl < 0).reduce((s, r) => s + r.pnl, 0);
      const netPnL = acPnl.reduce((s, r) => s + r.pnl, 0);
      const totalBuyValue = acPnl.reduce((s, r) => s + (r.buy_value || 0), 0);
      const totalSellValue = acPnl.reduce((s, r) => s + (r.sell_value || 0), 0);
      const totalTrades = acPnl.length;

      // Ledger summary
      const acLedger = (ledgerData || []).filter(r => r.account_name === name);
      const totalDeposits = acLedger.filter(r => r.entry_type === 'Deposit').reduce((s, r) => s + r.amount, 0);
      const totalWithdrawals = acLedger.filter(r => r.entry_type === 'Withdrawal').reduce((s, r) => s + r.amount, 0);
      const totalCharges = acLedger.filter(r => ['Charges', 'Tax'].includes(r.entry_type)).reduce((s, r) => s + r.amount, 0);
      const tradeProfit = acLedger.filter(r => r.entry_type === 'Trade Profit').reduce((s, r) => s + r.amount, 0);
      const tradeLoss = acLedger.filter(r => r.entry_type === 'Trade Loss').reduce((s, r) => s + r.amount, 0);

      // Current balance: latest ledger entry with non-zero balance
      const withBalance = acLedger.filter(r => r.balance > 0).sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date));
      const currentBalance = withBalance.length > 0 ? withBalance[0].balance : 0;

      // Combined P&L: from trade_pnl table + from ledger Trade Profit/Loss entries
      const combinedProfit = totalProfit + tradeProfit;
      const combinedLoss = totalLoss + tradeLoss;
      const combinedNetPnL = netPnL + tradeProfit - tradeLoss;

      return {
        accountName: name,
        broker: acc.broker || '-',
        // P&L (combined from pnl table + ledger trade entries)
        totalProfit: +combinedProfit.toFixed(2),
        totalLoss: +combinedLoss.toFixed(2),
        netPnL: +combinedNetPnL.toFixed(2),
        totalBuyValue: +totalBuyValue.toFixed(2),
        totalSellValue: +totalSellValue.toFixed(2),
        totalTrades,
        tradeProfit: +tradeProfit.toFixed(2),
        tradeLoss: +tradeLoss.toFixed(2),
        // Ledger
        totalDeposits: +totalDeposits.toFixed(2),
        totalWithdrawals: +totalWithdrawals.toFixed(2),
        totalCharges: +totalCharges.toFixed(2),
        currentBalance: +currentBalance.toFixed(2),
        netFund: +(totalDeposits - totalWithdrawals).toFixed(2),
        ledgerEntries: acLedger.length,
      };
    });

    // Overall totals
    const overall = {
      totalProfit: +accountSummaries.reduce((s, a) => s + a.totalProfit, 0).toFixed(2),
      totalLoss: +accountSummaries.reduce((s, a) => s + a.totalLoss, 0).toFixed(2),
      netPnL: +accountSummaries.reduce((s, a) => s + a.netPnL, 0).toFixed(2),
      totalDeposits: +accountSummaries.reduce((s, a) => s + a.totalDeposits, 0).toFixed(2),
      totalWithdrawals: +accountSummaries.reduce((s, a) => s + a.totalWithdrawals, 0).toFixed(2),
      totalAccounts: accountSummaries.length,
    };

    res.json({ accounts: accountSummaries, overall });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Day-wise P&L ────────────────────────────────────────────────────────────

router.get('/daywise-pnl', async (req, res) => {
  try {
    const { accountName } = req.query;

    // Fetch from trade_pnl table
    let pnlEntries = [];
    try {
      let q = supabase.from('trade_pnl').select('sell_date, pnl');
      if (accountName && accountName !== 'all') q = q.eq('account_name', accountName);
      const { data, error } = await q;
      if (!error) pnlEntries = data || [];
    } catch {}

    // Also include Trade Profit/Loss from ledger
    let ledgerTradeEntries = [];
    {
      let q = supabase.from('ledger_entries').select('entry_date, entry_type, amount');
      if (accountName && accountName !== 'all') q = q.eq('account_name', accountName);
      q = q.in('entry_type', ['Trade Profit', 'Trade Loss']);
      const { data, error } = await q;
      if (!error) ledgerTradeEntries = data || [];
    }

    // Group by date
    const dayMap = {};

    // From trade_pnl
    for (const entry of pnlEntries) {
      const dateKey = entry.sell_date ? new Date(entry.sell_date).toISOString().slice(0, 10) : 'unknown';
      if (!dayMap[dateKey]) dayMap[dateKey] = { date: dateKey, profit: 0, loss: 0, trades: 0 };
      dayMap[dateKey].trades++;
      if (entry.pnl >= 0) dayMap[dateKey].profit += entry.pnl;
      else dayMap[dateKey].loss += Math.abs(entry.pnl);
    }

    // From ledger trade entries
    for (const entry of ledgerTradeEntries) {
      const dateKey = entry.entry_date ? new Date(entry.entry_date).toISOString().slice(0, 10) : 'unknown';
      if (!dayMap[dateKey]) dayMap[dateKey] = { date: dateKey, profit: 0, loss: 0, trades: 0 };
      dayMap[dateKey].trades++;
      if (entry.entry_type === 'Trade Profit') dayMap[dateKey].profit += entry.amount;
      else dayMap[dateKey].loss += entry.amount;
    }

    // Convert to sorted array
    const days = Object.values(dayMap)
      .map(d => ({
        ...d,
        profit: +d.profit.toFixed(2),
        loss: +d.loss.toFixed(2),
        net: +(d.profit - d.loss).toFixed(2),
      }))
      .sort((a, b) => b.date.localeCompare(a.date)); // newest first

    // Totals
    const totalProfit = days.reduce((s, d) => s + d.profit, 0);
    const totalLoss = days.reduce((s, d) => s + d.loss, 0);

    res.json({
      days,
      totals: {
        totalProfit: +totalProfit.toFixed(2),
        totalLoss: +totalLoss.toFixed(2),
        netPnL: +(totalProfit - totalLoss).toFixed(2),
        totalDays: days.length,
        profitDays: days.filter(d => d.net > 0).length,
        lossDays: days.filter(d => d.net < 0).length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── P&L Entries (with filters) ──────────────────────────────────────────────

router.get('/pnl', async (req, res) => {
  try {
    const { accountName, symbol, page = 1, limit = 100 } = req.query;
    const pg = parseInt(page);
    const lim = parseInt(limit);

    // trade_pnl table may not exist yet
    try {
      let q = supabase.from('trade_pnl').select('*', { count: 'exact' });
      if (accountName && accountName !== 'all') q = q.eq('account_name', accountName);
      if (symbol) q = q.ilike('symbol', `%${symbol}%`);
      q = q.order('sell_date', { ascending: false, nullsFirst: false });
      q = q.range((pg - 1) * lim, pg * lim - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return res.json({
        entries: data || [],
        pagination: { page: pg, limit: lim, total: count, pages: Math.ceil(count / lim) },
      });
    } catch {
      return res.json({ entries: [], pagination: { page: pg, limit: lim, total: 0, pages: 0 } });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Ledger Entries (with filters) ───────────────────────────────────────────

router.get('/ledger', async (req, res) => {
  try {
    const { accountName, entryType, page = 1, limit = 100 } = req.query;
    let q = supabase.from('ledger_entries').select('*', { count: 'exact' });

    if (accountName && accountName !== 'all') q = q.eq('account_name', accountName);
    if (entryType && entryType !== 'all') q = q.eq('entry_type', entryType);
    q = q.order('entry_date', { ascending: false });

    const pg = parseInt(page);
    const lim = parseInt(limit);
    q = q.range((pg - 1) * lim, pg * lim - 1);

    const { data, error, count } = await q;
    if (error) throw error;

    res.json({
      entries: data || [],
      pagination: { page: pg, limit: lim, total: count, pages: Math.ceil(count / lim) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Clear All ───────────────────────────────────────────────────────────────

router.delete('/clear', async (req, res) => {
  try {
    // trade_pnl may not exist yet — ignore errors
    try { await supabase.from('trade_pnl').delete().neq('id', '00000000-0000-0000-0000-000000000000'); } catch {}
    const { error: e2 } = await supabase.from('ledger_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const { error: e3 } = await supabase.from('stock_accounts').delete().neq('account_name', '');
    if (e2) throw e2;
    if (e3) throw e3;
    res.json({ message: 'All share market data cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
