import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Download, Printer, AlertTriangle, TrendingUp, Wallet, Scale, BookOpen, Calendar, FileSearch, ArrowUp, ArrowDown, Calculator } from 'lucide-react';
import {
  finoReportPL, finoReportBalanceSheet, finoReportCashFlow, finoReportTrialBalance,
  finoReportTax, finoReportDayBook, finoReportLedger,
  finoReportReceivables, finoReportPayables,
  finoListCompanies,
} from '../../services/api';

const fmtINR = (n) => {
  const v = Number(n) || 0;
  const sign = v < 0 ? '−' : '';
  return `${sign}₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const today = () => new Date().toISOString().slice(0, 10);
const firstOfYear = () => `${new Date().getFullYear()}-04-01`;

const REPORTS = [
  { id: 'pnl',          label: 'Profit & Loss',  Icon: TrendingUp },
  { id: 'balance',      label: 'Balance Sheet',  Icon: Scale },
  { id: 'cashflow',     label: 'Cash Flow',      Icon: Wallet },
  { id: 'trial',        label: 'Trial Balance',  Icon: Calculator },
  { id: 'tax',          label: 'Tax Summary',    Icon: BookOpen },
  { id: 'daybook',      label: 'Day Book',       Icon: Calendar },
  { id: 'ledger',       label: 'Ledger',         Icon: FileSearch },
  { id: 'receivables',  label: 'Receivables',    Icon: ArrowDown },
  { id: 'payables',     label: 'Payables',       Icon: ArrowUp },
];

function downloadCsv(rows, filename) {
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function FinancialReportsPage({ initialReport = 'pnl' }) {
  const [report, setReport] = useState(initialReport);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  useEffect(() => {
    finoListCompanies().then(r => setCompanies(r.data.companies || [])).catch(() => {});
  }, []);

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
        .report-table { width: 100%; font-size: 12px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
        .report-table th, .report-table td { padding: 6px 10px; border-bottom: 1px solid var(--border); }
        .report-table tr:nth-child(even) td { background: rgba(127,127,127,0.04); }
        .report-table .num { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .report-section-head { font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); padding: 14px 10px 4px; }
        .report-total { font-weight: 800; border-top: 2px solid var(--text-muted); }
        .report-grand { font-weight: 800; border-top: 3px double var(--text-muted); border-bottom: 3px double var(--text-muted); background: var(--bg-page); }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Financial Reports</h1>
        <div style={{ display: 'flex', gap: 8 }} className="no-print">
          <select className="input" value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ width: 200 }}>
            <option value="">All Companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="no-print" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 14, flexWrap: 'wrap' }}>
        {REPORTS.map(r => (
          <button key={r.id} onClick={() => setReport(r.id)} style={{
            padding: '8px 14px', border: 'none', cursor: 'pointer',
            background: report === r.id ? 'var(--bg-page)' : 'transparent',
            borderRadius: '6px 6px 0 0',
            fontSize: 12, fontWeight: report === r.id ? 700 : 500,
            color: report === r.id ? 'var(--text-primary)' : 'var(--text-muted)',
            borderBottom: report === r.id ? '2px solid var(--accent)' : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: 6,
          }}><r.Icon size={13} /> {r.label}</button>
        ))}
      </div>

      {report === 'pnl'         && <PnLReport companyId={companyId} />}
      {report === 'balance'     && <BalanceSheetReport companyId={companyId} />}
      {report === 'cashflow'    && <CashFlowReport companyId={companyId} />}
      {report === 'trial'       && <TrialBalanceReport companyId={companyId} />}
      {report === 'tax'         && <TaxReport companyId={companyId} />}
      {report === 'daybook'     && <DayBookReport companyId={companyId} />}
      {report === 'ledger'      && <LedgerReport />}
      {report === 'receivables' && <ReceivablesReport companyId={companyId} />}
      {report === 'payables'    && <PayablesReport companyId={companyId} />}
    </div>
  );
}

// ─── P&L ─────────────────────────────────────────────────────────────────────

function PnLReport({ companyId }) {
  const [from, setFrom] = useState(firstOfYear());
  const [to, setTo] = useState(today());
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try { const r = await finoReportPL({ company: companyId || undefined, from, to }); setData(r.data); }
    catch (e) { console.error(e); }
  }, [companyId, from, to]);
  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ['PROFIT & LOSS STATEMENT'],
      [`Period: ${data.period.from || 'inception'} to ${data.period.to}`],
      [],
      ['REVENUE', '', ''],
      ['Code', 'Account', 'Amount'],
      ...data.revenue.map(l => [l.code, l.name, l.amount]),
      ['', 'Total Revenue', data.totalRevenue],
      [],
      ['EXPENSES', '', ''],
      ['Code', 'Account', 'Amount'],
      ...data.expenses.map(l => [l.code, l.name, l.amount]),
      ['', 'Total Expenses', data.totalExpenses],
      [],
      ['', 'NET PROFIT / (LOSS)', data.netProfit],
    ];
    downloadCsv(rows, `pnl-${data.period.from || 'all'}-to-${data.period.to}.csv`);
  };

  return (
    <ReportShell title="Profit & Loss Statement" subtitle={data && `Period: ${data.period.from || '—'} to ${data.period.to}`}
      filters={
        <>
          <FilterField label="From"><input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></FilterField>
          <FilterField label="To"><input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} /></FilterField>
        </>
      }
      onExport={exportCsv}
    >
      {!data ? <Loading /> : (
        <>
          <div className="report-section-head">Revenue</div>
          <table className="report-table">
            <tbody>
              {data.revenue.length === 0 ? <tr><td colSpan="3" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 14 }}>No revenue in period</td></tr>
                : data.revenue.map(l => <tr key={l.code}><td style={{ width: 80, color: 'var(--text-muted)' }}>{l.code}</td><td>{l.name}</td><td className="num" style={{ color: '#22c55e' }}>{fmtINR(l.amount)}</td></tr>)}
              <tr className="report-total"><td></td><td>Total Revenue</td><td className="num">{fmtINR(data.totalRevenue)}</td></tr>
            </tbody>
          </table>

          <div className="report-section-head">Expenses</div>
          <table className="report-table">
            <tbody>
              {data.expenses.length === 0 ? <tr><td colSpan="3" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 14 }}>No expenses in period</td></tr>
                : data.expenses.map(l => <tr key={l.code}><td style={{ width: 80, color: 'var(--text-muted)' }}>{l.code}</td><td>{l.name}</td><td className="num" style={{ color: '#ef4444' }}>{fmtINR(l.amount)}</td></tr>)}
              <tr className="report-total"><td></td><td>Total Expenses</td><td className="num">{fmtINR(data.totalExpenses)}</td></tr>
            </tbody>
          </table>

          <table className="report-table" style={{ marginTop: 14 }}>
            <tbody>
              <tr className="report-grand">
                <td></td>
                <td style={{ fontSize: 14 }}>NET {data.netProfit >= 0 ? 'PROFIT' : 'LOSS'}</td>
                <td className="num" style={{ fontSize: 14, color: data.netProfit >= 0 ? '#22c55e' : '#ef4444' }}>{fmtINR(data.netProfit)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </ReportShell>
  );
}

// ─── Balance Sheet ───────────────────────────────────────────────────────────

function BalanceSheetReport({ companyId }) {
  const [asOf, setAsOf] = useState(today());
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try { const r = await finoReportBalanceSheet({ company: companyId || undefined, as_of: asOf }); setData(r.data); }
    catch (e) { console.error(e); }
  }, [companyId, asOf]);
  useEffect(() => { load(); }, [load]);

  return (
    <ReportShell title="Balance Sheet" subtitle={data && `As of ${data.asOfDate}`}
      filters={<FilterField label="As of"><input className="input" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></FilterField>}
    >
      {!data ? <Loading /> : (
        <>
          <Section title="Assets" rows={data.assets} total={data.totalAssets} totalLabel="Total Assets" color="#22c55e" />
          <Section title="Liabilities" rows={data.liabilities} total={data.totalLiabilities} totalLabel="Total Liabilities" color="#f59e0b" />
          <Section title="Equity" rows={data.equity} total={data.totalEquity} totalLabel="Total Equity" color="#3b82f6" />

          <table className="report-table" style={{ marginTop: 14 }}>
            <tbody>
              <tr className="report-grand">
                <td></td>
                <td>Assets = Liabilities + Equity</td>
                <td className="num">
                  {fmtINR(data.totalAssets)} {data.balanced ? '✅ BALANCED' : '⚠ DIFF ' + fmtINR(data.difference)}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </ReportShell>
  );
}

function Section({ title, rows, total, totalLabel, color }) {
  return (
    <>
      <div className="report-section-head">{title}</div>
      <table className="report-table">
        <tbody>
          {rows.length === 0 ? <tr><td colSpan="3" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 14 }}>None</td></tr>
            : rows.map(l => <tr key={l.code}><td style={{ width: 80, color: 'var(--text-muted)' }}>{l.code}</td><td>{l.name}</td><td className="num" style={{ color }}>{fmtINR(l.amount)}</td></tr>)}
          <tr className="report-total"><td></td><td>{totalLabel}</td><td className="num">{fmtINR(total)}</td></tr>
        </tbody>
      </table>
    </>
  );
}

// ─── Cash Flow ───────────────────────────────────────────────────────────────

function CashFlowReport({ companyId }) {
  const [from, setFrom] = useState(firstOfYear());
  const [to, setTo] = useState(today());
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try { const r = await finoReportCashFlow({ company: companyId || undefined, from, to }); setData(r.data); }
    catch (e) { console.error(e); }
  }, [companyId, from, to]);
  useEffect(() => { load(); }, [load]);

  const Block = ({ label, info, color }) => (
    <table className="report-table">
      <tbody>
        <tr><td style={{ fontWeight: 700 }}>{label}</td><td></td><td></td></tr>
        <tr><td style={{ paddingLeft: 24, color: 'var(--text-muted)' }}>Inflow</td><td></td><td className="num" style={{ color: '#22c55e' }}>{fmtINR(info.inflow)}</td></tr>
        <tr><td style={{ paddingLeft: 24, color: 'var(--text-muted)' }}>Outflow</td><td></td><td className="num" style={{ color: '#ef4444' }}>{fmtINR(info.outflow)}</td></tr>
        <tr className="report-total"><td></td><td>Net</td><td className="num" style={{ color }}>{fmtINR(info.net)}</td></tr>
      </tbody>
    </table>
  );

  return (
    <ReportShell title="Cash Flow Statement" subtitle={data && `Period: ${data.period.from || '—'} to ${data.period.to}`}
      filters={<>
        <FilterField label="From"><input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></FilterField>
        <FilterField label="To"><input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} /></FilterField>
      </>}
    >
      {!data ? <Loading /> : (
        <>
          <div className="report-section-head">Operating Activities</div>
          <Block label="Operating" info={data.operating} color={data.operating.net >= 0 ? '#22c55e' : '#ef4444'} />
          <div className="report-section-head">Investing Activities</div>
          <Block label="Investing" info={data.investing} color={data.investing.net >= 0 ? '#22c55e' : '#ef4444'} />
          <div className="report-section-head">Financing Activities</div>
          <Block label="Financing" info={data.financing} color={data.financing.net >= 0 ? '#22c55e' : '#ef4444'} />

          <table className="report-table" style={{ marginTop: 14 }}>
            <tbody>
              <tr className="report-grand">
                <td></td>
                <td>NET CHANGE IN CASH</td>
                <td className="num" style={{ color: data.netCashChange >= 0 ? '#22c55e' : '#ef4444' }}>{fmtINR(data.netCashChange)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </ReportShell>
  );
}

// ─── Trial Balance ───────────────────────────────────────────────────────────

function TrialBalanceReport({ companyId }) {
  const [asOf, setAsOf] = useState(today());
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try { const r = await finoReportTrialBalance({ company: companyId || undefined, as_of: asOf }); setData(r.data); }
    catch (e) { console.error(e); }
  }, [companyId, asOf]);
  useEffect(() => { load(); }, [load]);

  return (
    <ReportShell title="Trial Balance" subtitle={data && `As of ${data.asOfDate}`}
      filters={<FilterField label="As of"><input className="input" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></FilterField>}
    >
      {!data ? <Loading /> : (
        <>
          {!data.balanced && (
            <div style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: 12, borderRadius: 8, marginBottom: 14, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertTriangle size={16} /> TRIAL BALANCE DOES NOT BALANCE — diff {fmtINR(data.difference)}
            </div>
          )}
          <table className="report-table">
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left' }}>Code</th>
                <th style={{ textAlign: 'left' }}>Account</th>
                <th style={{ textAlign: 'left' }}>Type</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map(l => (
                <tr key={l.code}>
                  <td style={{ color: 'var(--text-muted)' }}>{l.code}</td>
                  <td>{l.name}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{l.type}</td>
                  <td className="num">{l.debit > 0 ? fmtINR(l.debit) : ''}</td>
                  <td className="num">{l.credit > 0 ? fmtINR(l.credit) : ''}</td>
                  <td className="num">{fmtINR(l.balance)} <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{l.balanceSide}</span></td>
                </tr>
              ))}
              <tr className="report-grand">
                <td></td><td></td><td></td>
                <td className="num">{fmtINR(data.totalDebits)}</td>
                <td className="num">{fmtINR(data.totalCredits)}</td>
                <td className="num">{data.balanced ? '✅' : '⚠'}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </ReportShell>
  );
}

// ─── Tax ─────────────────────────────────────────────────────────────────────

function TaxReport({ companyId }) {
  const [fy, setFy] = useState('2025-26');
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try { const r = await finoReportTax({ company: companyId || undefined, fy }); setData(r.data); }
    catch (e) { console.error(e); }
  }, [companyId, fy]);
  useEffect(() => { load(); }, [load]);

  return (
    <ReportShell title="Tax Summary" subtitle={data && `FY ${fy}`}
      filters={<FilterField label="FY"><input className="input" value={fy} onChange={e => setFy(e.target.value)} placeholder="2025-26" style={{ width: 100 }} /></FilterField>}
    >
      {!data ? <Loading /> : (
        <>
          <div className="report-section-head">GST</div>
          <table className="report-table">
            <tbody>
              <tr><td>Input Credit (1800)</td><td className="num" style={{ color: '#22c55e' }}>{fmtINR(data.gst.inputCredit)}</td></tr>
              <tr><td>Output Liability (2300)</td><td className="num" style={{ color: '#ef4444' }}>{fmtINR(data.gst.outputLiability)}</td></tr>
              <tr className="report-total"><td>Net GST Payable</td><td className="num">{fmtINR(data.gst.netPayable)}</td></tr>
            </tbody>
          </table>

          <div className="report-section-head">TDS</div>
          <table className="report-table">
            <tbody>
              <tr><td>Receivable (1700)</td><td className="num" style={{ color: '#22c55e' }}>{fmtINR(data.tds.receivable)}</td></tr>
              <tr><td>Payable (2410)</td><td className="num" style={{ color: '#ef4444' }}>{fmtINR(data.tds.payable)}</td></tr>
            </tbody>
          </table>

          {(data.gst.records?.length > 0 || data.tds.records?.length > 0) && (
            <>
              <div className="report-section-head">Filed GST Returns ({data.gst.records?.length || 0})</div>
              <table className="report-table">
                <thead><tr><th style={{ textAlign: 'left' }}>Period</th><th>Type</th><th className="num">Output</th><th className="num">Input</th><th className="num">Net</th><th>Status</th></tr></thead>
                <tbody>
                  {(data.gst.records || []).map(r => (
                    <tr key={r.id}>
                      <td>{r.return_period}</td>
                      <td>{r.return_type}</td>
                      <td className="num">{fmtINR(r.total_output_gst)}</td>
                      <td className="num">{fmtINR(r.total_input_gst)}</td>
                      <td className="num">{fmtINR(r.net_gst_payable)}</td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="report-section-head">TDS Records ({data.tds.records?.length || 0})</div>
              <table className="report-table">
                <thead><tr><th style={{ textAlign: 'left' }}>Type</th><th>Quarter</th><th>Section</th><th className="num">Gross</th><th className="num">Rate</th><th className="num">TDS</th><th>Status</th></tr></thead>
                <tbody>
                  {(data.tds.records || []).map(r => (
                    <tr key={r.id}>
                      <td>{r.tds_type}</td>
                      <td>{r.quarter}</td>
                      <td>{r.tds_section || '—'}</td>
                      <td className="num">{fmtINR(r.gross_amount)}</td>
                      <td className="num">{Number(r.tds_rate).toFixed(2)}%</td>
                      <td className="num">{fmtINR(r.tds_amount)}</td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </ReportShell>
  );
}

// ─── Day Book ────────────────────────────────────────────────────────────────

function DayBookReport({ companyId }) {
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try { const r = await finoReportDayBook({ company: companyId || undefined, date }); setData(r.data); }
    catch (e) { console.error(e); }
  }, [companyId, date]);
  useEffect(() => { load(); }, [load]);

  return (
    <ReportShell title="Day Book" subtitle={data && `Date: ${data.date}`}
      filters={<FilterField label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></FilterField>}
    >
      {!data ? <Loading /> : data.entries.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No entries on this date.</div>
      ) : (
        <table className="report-table">
          <thead><tr><th style={{ textAlign: 'left' }}>Account</th><th style={{ textAlign: 'left' }}>Description</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
          <tbody>
            {data.entries.map(e => (
              <tr key={e.id}>
                <td><span style={{ color: 'var(--text-muted)' }}>{e.account?.code}</span> {e.account?.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{e.description || '—'}</td>
                <td className="num">{e.direction === 'debit'  ? fmtINR(e.amount) : ''}</td>
                <td className="num">{e.direction === 'credit' ? fmtINR(e.amount) : ''}</td>
              </tr>
            ))}
            <tr className="report-grand">
              <td></td>
              <td>{data.balanced ? '✅' : '⚠ unbalanced'}</td>
              <td className="num">{fmtINR(data.totalDebits)}</td>
              <td className="num">{fmtINR(data.totalCredits)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </ReportShell>
  );
}

// ─── Ledger ──────────────────────────────────────────────────────────────────

function LedgerReport() {
  const [account, setAccount] = useState('1100');
  const [from, setFrom] = useState(firstOfYear());
  const [to, setTo] = useState(today());
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    setErr(null);
    if (!account.trim()) return;
    try { const r = await finoReportLedger({ account, from, to }); setData(r.data); }
    catch (e) { setErr(e?.response?.data?.error || e.message); setData(null); }
  }, [account, from, to]);
  useEffect(() => { load(); }, [load]);

  return (
    <ReportShell title="Ledger" subtitle={data && `${data.account.code} · ${data.account.name}`}
      filters={<>
        <FilterField label="Account Code"><input className="input" value={account} onChange={e => setAccount(e.target.value)} placeholder="1100" style={{ width: 100 }} /></FilterField>
        <FilterField label="From"><input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></FilterField>
        <FilterField label="To"><input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} /></FilterField>
      </>}
    >
      {err && <div style={{ background: 'rgba(239,68,68,0.10)', color: 'var(--danger)', padding: 10, borderRadius: 8, marginBottom: 10, fontSize: 12 }}>{err}</div>}
      {!data ? (err ? null : <Loading />) : (
        <table className="report-table">
          <thead><tr><th style={{ textAlign: 'left' }}>Date</th><th style={{ textAlign: 'left' }}>Description</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Running</th></tr></thead>
          <tbody>
            {data.entries.length === 0
              ? <tr><td colSpan="5" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 14 }}>No entries</td></tr>
              : data.entries.map(e => (
                  <tr key={e.id}>
                    <td>{e.txn_date}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{e.description || '—'}</td>
                    <td className="num">{e.direction === 'debit' ? fmtINR(e.amount) : ''}</td>
                    <td className="num">{e.direction === 'credit' ? fmtINR(e.amount) : ''}</td>
                    <td className="num">{fmtINR(e.running_balance)}</td>
                  </tr>
                ))}
            <tr className="report-grand">
              <td></td>
              <td>Closing ({data.closingSide})</td>
              <td className="num">{fmtINR(data.totalDebits)}</td>
              <td className="num">{fmtINR(data.totalCredits)}</td>
              <td className="num">{fmtINR(data.closingBalance)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </ReportShell>
  );
}

// ─── Receivables / Payables ──────────────────────────────────────────────────

function ReceivablesReport({ companyId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    finoReportReceivables({ company: companyId || undefined }).then(r => setData(r.data)).catch(() => {});
  }, [companyId]);

  return (
    <ReportShell title="Accounts Receivable" subtitle={data && `Outstanding ${fmtINR(data.totalOutstanding)} · ${data.overdueCount} overdue`}>
      {!data ? <Loading /> : (
        <>
          <div className="report-section-head">By Customer</div>
          <table className="report-table">
            <thead><tr><th style={{ textAlign: 'left' }}>Customer</th><th className="num">Open Invoices</th><th className="num">Outstanding</th></tr></thead>
            <tbody>
              {data.byCustomer.length === 0 ? <tr><td colSpan="3" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 14 }}>No outstanding</td></tr>
                : data.byCustomer.map(c => <tr key={c.customer_id}><td>{c.name}</td><td className="num">{c.count}</td><td className="num">{fmtINR(c.total)}</td></tr>)}
              <tr className="report-grand"><td>Total</td><td></td><td className="num">{fmtINR(data.totalOutstanding)}</td></tr>
            </tbody>
          </table>
          <div className="report-section-head">Open Invoices ({data.invoices.length})</div>
          <table className="report-table">
            <thead><tr><th style={{ textAlign: 'left' }}>Invoice #</th><th>Date</th><th>Due</th><th>Customer</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {data.invoices.map(i => {
                const overdue = i.due_date && i.due_date < today();
                return (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 700 }}>{i.invoice_number}</td>
                    <td>{i.invoice_date}</td>
                    <td style={{ color: overdue ? '#ef4444' : 'var(--text-primary)' }}>{i.due_date || '—'}</td>
                    <td>{i.customer?.name}</td>
                    <td className="num">{fmtINR(i.grand_total)}</td>
                    <td className="num">{fmtINR(i.amount_paid)}</td>
                    <td className="num" style={{ fontWeight: 700, color: overdue ? '#ef4444' : 'var(--text-primary)' }}>{fmtINR(i.balance_due)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </ReportShell>
  );
}

function PayablesReport({ companyId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    finoReportPayables({ company: companyId || undefined }).then(r => setData(r.data)).catch(() => {});
  }, [companyId]);

  return (
    <ReportShell title="Accounts Payable" subtitle={data && `Outstanding ${fmtINR(data.totalOutstanding)} · ${data.overdueCount} overdue`}>
      {!data ? <Loading /> : (
        <>
          <div className="report-section-head">By Supplier</div>
          <table className="report-table">
            <thead><tr><th style={{ textAlign: 'left' }}>Supplier</th><th className="num">Open Bills</th><th className="num">Outstanding</th></tr></thead>
            <tbody>
              {data.bySupplier.length === 0 ? <tr><td colSpan="3" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 14 }}>No outstanding</td></tr>
                : data.bySupplier.map(c => <tr key={c.supplier_id}><td>{c.name}</td><td className="num">{c.count}</td><td className="num">{fmtINR(c.total)}</td></tr>)}
              <tr className="report-grand"><td>Total</td><td></td><td className="num">{fmtINR(data.totalOutstanding)}</td></tr>
            </tbody>
          </table>
          <div className="report-section-head">Open Bills ({data.bills.length})</div>
          <table className="report-table">
            <thead><tr><th style={{ textAlign: 'left' }}>Bill #</th><th>Date</th><th>Due</th><th>Supplier</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {data.bills.map(b => {
                const overdue = b.due_date && b.due_date < today();
                return (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 700 }}>{b.bill_number}</td>
                    <td>{b.bill_date}</td>
                    <td style={{ color: overdue ? '#ef4444' : 'var(--text-primary)' }}>{b.due_date || '—'}</td>
                    <td>{b.supplier?.name}</td>
                    <td className="num">{fmtINR(b.grand_total)}</td>
                    <td className="num">{fmtINR(b.amount_paid)}</td>
                    <td className="num" style={{ fontWeight: 700, color: overdue ? '#ef4444' : 'var(--text-primary)' }}>{fmtINR(b.balance_due)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </ReportShell>
  );
}

// ─── Shared UI ──────────────────────────────────────────────────────────────

function ReportShell({ title, subtitle, filters, onExport, children }) {
  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 18 }}>
      <div className="no-print" style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {filters}
        {onExport && <button className="btn btn-sm" onClick={onExport}><Download size={13} /> CSV</button>}
        <button className="btn btn-sm" onClick={() => window.print()}><Printer size={13} /> Print</button>
      </div>
      {children}
    </div>
  );
}

function FilterField({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  );
}

function Loading() {
  return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>;
}
