/**
 * Export Route
 * GET /api/export/excel
 * GET /api/export/pdf
 */

const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { format } = require('date-fns');
const supabase = require('../lib/supabase');
const { fromDb } = require('../lib/mapper');

// ─── Build Supabase query from filters ────────────────────────────────────────

function applyFilters(query, { startDate, endDate, bank, category, search, status }) {
  if (status && status !== 'all') query = query.eq('status', status);
  if (startDate) query = query.gte('date', new Date(startDate).toISOString());
  if (endDate)   query = query.lte('date', new Date(endDate + 'T23:59:59').toISOString());
  if (bank && bank !== 'all')         query = query.eq('bank_name', bank);
  if (category && category !== 'all') query = query.eq('category', category);
  if (search) query = query.ilike('description', `%${search}%`);
  return query;
}

async function fetchTransactions(queryParams) {
  let query = supabase.from('transactions').select('*').order('date', { ascending: true });
  query = applyFilters(query, queryParams);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(fromDb);
}

// ─── Excel Export ──────────────────────────────────────────────────────────────

router.get('/excel', async (req, res) => {
  try {
    const transactions = await fetchTransactions(req.query);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Bank Analyzer';
    workbook.created = new Date();

    // Sheet 1: Transactions
    const sheet = workbook.addWorksheet('Transactions');
    sheet.columns = [
      { header: 'Date',        key: 'date',        width: 14 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Debit (₹)',   key: 'debit',       width: 16 },
      { header: 'Credit (₹)',  key: 'credit',      width: 16 },
      { header: 'Balance (₹)', key: 'balance',     width: 16 },
      { header: 'Bank',        key: 'bankName',    width: 20 },
      { header: 'Category',    key: 'category',    width: 22 },
    ];

    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    transactions.forEach((txn, i) => {
      const row = sheet.addRow({
        date:        format(new Date(txn.date), 'dd/MM/yyyy'),
        description: txn.description,
        debit:       txn.debit  || '',
        credit:      txn.credit || '',
        balance:     txn.balance || '',
        bankName:    txn.bankName,
        category:    txn.category,
      });

      if (i % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } };
        });
      }
      if (txn.debit  > 0) row.getCell('debit').font  = { color: { argb: 'FFD32F2F' } };
      if (txn.credit > 0) row.getCell('credit').font = { color: { argb: 'FF2E7D32' } };
    });

    // Sheet 2: Monthly Summary
    const summarySheet = workbook.addWorksheet('Monthly Summary');
    const monthlyMap = {};
    transactions.forEach((txn) => {
      const key = format(new Date(txn.date), 'MMM yyyy');
      if (!monthlyMap[key]) monthlyMap[key] = { credit: 0, debit: 0, count: 0 };
      monthlyMap[key].credit += txn.credit || 0;
      monthlyMap[key].debit  += txn.debit  || 0;
      monthlyMap[key].count++;
    });

    summarySheet.columns = [
      { header: 'Month',            key: 'month',  width: 14 },
      { header: 'Total Credit (₹)', key: 'credit', width: 18 },
      { header: 'Total Debit (₹)',  key: 'debit',  width: 18 },
      { header: 'Net Flow (₹)',     key: 'net',    width: 18 },
      { header: 'Transactions',     key: 'count',  width: 14 },
    ];
    summarySheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    });
    Object.entries(monthlyMap).forEach(([month, d]) => {
      summarySheet.addRow({ month, credit: d.credit.toFixed(2), debit: d.debit.toFixed(2), net: (d.credit - d.debit).toFixed(2), count: d.count });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bank_statement_${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PDF Export ────────────────────────────────────────────────────────────────

router.get('/pdf', async (req, res) => {
  try {
    const transactions = await fetchTransactions(req.query);
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bank_statement_${Date.now()}.pdf"`);
    doc.pipe(res);

    doc.fontSize(16).font('Helvetica-Bold').text('Bank Statement Analysis Report', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, { align: 'center' });
    doc.moveDown();

    const total = transactions.reduce((acc, t) => {
      acc.credit += t.credit || 0;
      acc.debit  += t.debit  || 0;
      return acc;
    }, { credit: 0, debit: 0 });

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text(
      `Total Transactions: ${transactions.length}   |   `
      + `Total Credit: ₹${total.credit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}   |   `
      + `Total Debit: ₹${total.debit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}   |   `
      + `Net Flow: ₹${(total.credit - total.debit).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
      { align: 'center' }
    );
    doc.moveDown().font('Helvetica');

    const cols = { date: 70, desc: 280, debit: 80, credit: 80, bank: 100, category: 100 };
    let x = 40;
    const headerY = doc.y;

    doc.rect(x, headerY, 720, 18).fill('#1E3A5F');
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
    doc.text('Date',        x + 2,                                                      headerY + 4, { width: cols.date });
    doc.text('Description', x + cols.date + 2,                                          headerY + 4, { width: cols.desc });
    doc.text('Debit (₹)',   x + cols.date + cols.desc + 2,                              headerY + 4, { width: cols.debit });
    doc.text('Credit (₹)',  x + cols.date + cols.desc + cols.debit + 2,                 headerY + 4, { width: cols.credit });
    doc.text('Bank',        x + cols.date + cols.desc + cols.debit + cols.credit + 2,   headerY + 4, { width: cols.bank });
    doc.text('Category',    x + cols.date + cols.desc + cols.debit + cols.credit + cols.bank + 2, headerY + 4, { width: cols.category });

    doc.fillColor('black').font('Helvetica').fontSize(7);
    let y = headerY + 20;

    transactions.slice(0, 500).forEach((txn, i) => {
      if (y > 550) { doc.addPage({ layout: 'landscape' }); y = 40; }
      if (i % 2 === 0) { doc.rect(x, y - 2, 720, 14).fill('#F0F4F8'); doc.fillColor('black'); }

      doc.text(format(new Date(txn.date), 'dd/MM/yy'), x + 2, y, { width: cols.date });
      doc.text(txn.description?.substring(0, 55) || '', x + cols.date + 2, y, { width: cols.desc });

      if (txn.debit  > 0) doc.fillColor('#C62828');
      doc.text(txn.debit  ? txn.debit.toFixed(2)  : '-', x + cols.date + cols.desc + 2,                y, { width: cols.debit });
      doc.fillColor('black');

      if (txn.credit > 0) doc.fillColor('#2E7D32');
      doc.text(txn.credit ? txn.credit.toFixed(2) : '-', x + cols.date + cols.desc + cols.debit + 2,   y, { width: cols.credit });
      doc.fillColor('black');

      doc.text(txn.bankName || '', x + cols.date + cols.desc + cols.debit + cols.credit + 2,            y, { width: cols.bank });
      doc.text(txn.category || '', x + cols.date + cols.desc + cols.debit + cols.credit + cols.bank + 2, y, { width: cols.category });
      y += 14;
    });

    if (transactions.length > 500) {
      doc.moveDown().text(`... and ${transactions.length - 500} more transactions. Use Excel export for full data.`, { align: 'center' });
    }
    doc.end();
  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
