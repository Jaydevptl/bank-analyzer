import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Trash2, AlertCircle, Wallet, Receipt, FileText } from 'lucide-react';
import {
  finoListSalary, finoCreateSalary, finoCancelSalary, finoSalarySummary,
  finoListTds, finoRecordTds, finoDepositTds, finoCancelTds, finoTdsSummary,
  finoListGst, finoRecordGst, finoFileGst, finoPayGst, finoCancelGst, finoGstSummary,
  finoListBanks, finoListParties, finoListCompanies,
} from '../../services/api';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);
const monthStr = () => new Date().toISOString().slice(0, 7);

const TABS = [
  { id: 'salary', label: 'Salary',  Icon: Wallet },
  { id: 'tds',    label: 'TDS',     Icon: Receipt },
  { id: 'gst',    label: 'GST',     Icon: FileText },
];

export default function StaffPage({ initialTab = 'salary' }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Staff & Compliance</h1>
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', border: 'none', cursor: 'pointer',
            background: tab === t.id ? 'var(--bg-page)' : 'transparent',
            borderRadius: '6px 6px 0 0',
            fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: 6,
          }}><t.Icon size={13} /> {t.label}</button>
        ))}
      </div>
      {tab === 'salary' && <SalaryTab />}
      {tab === 'tds'    && <TdsTab />}
      {tab === 'gst'    && <GstTab />}
    </div>
  );
}

// ─── Salary ──────────────────────────────────────────────────────────────────

function SalaryTab() {
  const [rows, setRows]   = useState([]);
  const [summ, setSumm]   = useState(null);
  const [modal, setModal] = useState(null);
  const reload = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([finoListSalary(), finoSalarySummary()]);
      setRows(l.data.records || []);
      setSumm(s.data);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  return (
    <>
      {summ && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Records"   value={summ.count} />
          <SummaryCard label="Gross Paid" value={fmtINR(summ.totalGross)} />
          <SummaryCard label="Net Paid"   value={fmtINR(summ.totalNet)} fg="var(--accent)" />
          <SummaryCard label="TDS Deducted" value={fmtINR(summ.totalTds)} fg="#f59e0b" />
          <SummaryCard label="PF Deducted"  value={fmtINR(summ.totalPf)}  fg="#3b82f6" />
        </div>
      )}
      <div style={{ marginBottom: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'paySalary' })}><Plus size={13} /> Pay Salary</button>
      </div>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No salary records yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>Employee</th>
                <th style={{ padding: '8px 10px' }}>Month</th>
                <th style={{ padding: '8px 10px' }}>Pay Date</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Basic</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Allow</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>TDS</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>PF</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Net</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>{r.employee?.name || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{r.salary_month}</td>
                  <td style={{ padding: '8px 10px' }}>{r.pay_date}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtINR(r.basic_salary)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtINR(r.allowances)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#f59e0b' }}>{fmtINR(r.tds_deducted)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#3b82f6' }}>{fmtINR(r.pf_deducted)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtINR(r.net_salary)}</td>
                  <td style={{ padding: '8px 10px' }}>{r.status}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <RowMenu items={[
                      { label: 'Cancel', icon: <Trash2 size={12} />, danger: true,
                        disabled: r.status === 'cancelled',
                        onClick: () => setModal({ kind: 'cancelSalary', row: r }) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {modal?.kind === 'paySalary' && <PaySalaryModal onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'cancelSalary' && (
        <DeleteConfirmModal title="Cancel Salary"
          description="Reverses the multi-line salary ledger entry. Bank balance restores."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoCancelSalary(modal.row.id, reason); reload(); }} />
      )}
    </>
  );
}

function PaySalaryModal({ onClose, onSaved }) {
  const [parties, setParties] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [banks, setBanks] = useState([]);
  const [f, setF] = useState({
    employeePartyId: '', companyId: '', salaryMonth: monthStr(), payDate: today(),
    basicSalary: '', allowances: '', deductions: '', tdsDeducted: '', pfDeducted: '',
    paidViaAccountId: '', notes: '',
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    finoListParties().then(r => setParties(r.data.parties || [])).catch(() => setParties([]));
    finoListCompanies().then(r => setCompanies(r.data.companies || [])).catch(() => setCompanies([]));
    finoListBanks().then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : [])).catch(() => setBanks([]));
  }, []);

  const basic = Number(f.basicSalary) || 0;
  const allow = Number(f.allowances)  || 0;
  const ded   = Number(f.deductions)  || 0;
  const tds   = Number(f.tdsDeducted) || 0;
  const pf    = Number(f.pfDeducted)  || 0;
  const net   = basic + allow - ded - tds - pf;

  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.employeePartyId)   throw new Error('Employee required');
      if (!(basic > 0))         throw new Error('Basic salary > 0');
      if (!f.paidViaAccountId)  throw new Error('Bank account required');
      await finoCreateSalary({
        ...f,
        basicSalary: basic, allowances: allow, deductions: ded,
        tdsDeducted: tds, pfDeducted: pf,
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title="Pay Salary" onClose={onClose} maxWidth={560}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Employee">
          <select className="input" value={f.employeePartyId} onChange={e => set('employeePartyId', e.target.value)} style={{ width: '100%' }}>
            <option value="">— Select —</option>
            {parties.filter(p => p.is_employee).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            <optgroup label="All Parties (auto-tag as employee)">
              {parties.filter(p => !p.is_employee).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
          </select>
        </Field>
        <Field label="Company">
          <select className="input" value={f.companyId} onChange={e => set('companyId', e.target.value)} style={{ width: '100%' }}>
            <option value="">— None —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Salary Month"><input className="input" type="month" value={f.salaryMonth} onChange={e => set('salaryMonth', e.target.value)} /></Field>
        <Field label="Pay Date"><input className="input" type="date" value={f.payDate} onChange={e => set('payDate', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Basic (₹)"><input className="input" type="number" step="0.01" value={f.basicSalary} onChange={e => set('basicSalary', e.target.value)} /></Field>
        <Field label="Allowances (₹)"><input className="input" type="number" step="0.01" value={f.allowances} onChange={e => set('allowances', e.target.value)} /></Field>
        <Field label="Deductions (₹)"><input className="input" type="number" step="0.01" value={f.deductions} onChange={e => set('deductions', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="TDS (₹)"><input className="input" type="number" step="0.01" value={f.tdsDeducted} onChange={e => set('tdsDeducted', e.target.value)} /></Field>
        <Field label="PF (₹)"><input className="input"  type="number" step="0.01" value={f.pfDeducted} onChange={e => set('pfDeducted', e.target.value)} /></Field>
      </div>
      <Field label="Pay From Bank">
        <select className="input" value={f.paidViaAccountId} onChange={e => set('paidViaAccountId', e.target.value)} style={{ width: '100%' }}>
          <option value="">— Select —</option>
          {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
        </select>
      </Field>
      <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
        Net Salary: <b style={{ color: net >= 0 ? '#22c55e' : '#ef4444' }}>{fmtINR(net)}</b>
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Pay Salary" />
    </ModalShell>
  );
}

// ─── TDS ─────────────────────────────────────────────────────────────────────

function TdsTab() {
  const [rows, setRows] = useState([]);
  const [summ, setSumm] = useState(null);
  const [modal, setModal] = useState(null);
  const reload = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([finoListTds(), finoTdsSummary()]);
      setRows(l.data.records || []);
      setSumm(s.data);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  return (
    <>
      {summ && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Records"   value={summ.count} />
          <SummaryCard label="Gross"     value={fmtINR(summ.totalGross)} />
          <SummaryCard label="TDS"       value={fmtINR(summ.totalTds)} fg="var(--accent)" />
          <SummaryCard label="Deposited" value={fmtINR(summ.totalDeposited)} fg="#22c55e" />
          <SummaryCard label="Pending"   value={fmtINR(summ.totalPending)} fg="#f59e0b" />
        </div>
      )}
      <div style={{ marginBottom: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'recordTds' })}><Plus size={13} /> Record TDS</button>
      </div>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No TDS records yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>Type</th>
                <th style={{ padding: '8px 10px' }}>Party</th>
                <th style={{ padding: '8px 10px' }}>FY</th>
                <th style={{ padding: '8px 10px' }}>Q</th>
                <th style={{ padding: '8px 10px' }}>Section</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Gross</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>TDS</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.tds_type}</td>
                  <td style={{ padding: '8px 10px' }}>{r.party?.name || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{r.financial_year}</td>
                  <td style={{ padding: '8px 10px' }}>{r.quarter}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{r.tds_section || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtINR(r.gross_amount)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{Number(r.tds_rate).toFixed(2)}%</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtINR(r.tds_amount)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                      background: r.status === 'deposited' || r.status === 'filed' ? 'rgba(34,197,94,0.15)' : r.status === 'cancelled' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      color: r.status === 'deposited' || r.status === 'filed' ? '#22c55e' : r.status === 'cancelled' ? '#ef4444' : '#f59e0b',
                    }}>{r.status}</span>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <RowMenu items={[
                      { label: 'Deposit TDS', disabled: r.status !== 'deducted',
                        onClick: () => setModal({ kind: 'depositTds', row: r }) },
                      { label: 'Cancel', icon: <Trash2 size={12} />, danger: true,
                        disabled: r.status === 'cancelled',
                        onClick: () => setModal({ kind: 'cancelTds', row: r }) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {modal?.kind === 'recordTds'  && <RecordTdsModal  onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'depositTds' && <DepositTdsModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'cancelTds'  && (
        <DeleteConfirmModal title="Cancel TDS Record"
          description="Reverses any ledger entries created for this TDS."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoCancelTds(modal.row.id, reason); reload(); }} />
      )}
    </>
  );
}

function RecordTdsModal({ onClose, onSaved }) {
  const [parties, setParties] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [f, setF] = useState({
    tdsType: 'amazon_tds', partyId: '', companyId: '',
    financialYear: '2025-26', quarter: 'Q4', tdsSection: '194O',
    grossAmount: '', tdsRate: '1', notes: '',
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    finoListParties().then(r => setParties(r.data.parties || [])).catch(() => setParties([]));
    finoListCompanies().then(r => setCompanies(r.data.companies || [])).catch(() => setCompanies([]));
  }, []);
  const tdsAmount = (Number(f.grossAmount) || 0) * (Number(f.tdsRate) || 0) / 100;
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!(Number(f.grossAmount) > 0)) throw new Error('Gross amount > 0');
      if (!(Number(f.tdsRate) >= 0))    throw new Error('TDS rate >= 0');
      await finoRecordTds({
        ...f,
        partyId: f.partyId || null,
        companyId: f.companyId || null,
        grossAmount: Number(f.grossAmount),
        tdsRate: Number(f.tdsRate),
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title="Record TDS" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="TDS Type">
          <select className="input" value={f.tdsType} onChange={e => set('tdsType', e.target.value)}>
            <option value="salary_tds">Salary TDS</option>
            <option value="amazon_tds">Amazon TDS</option>
            <option value="professional_tds">Professional TDS</option>
            <option value="rent_tds">Rent TDS</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Section"><input className="input" value={f.tdsSection} onChange={e => set('tdsSection', e.target.value)} placeholder="194O" /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Party (deductor / employee)">
          <select className="input" value={f.partyId} onChange={e => set('partyId', e.target.value)} style={{ width: '100%' }}>
            <option value="">— None —</option>
            {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Company">
          <select className="input" value={f.companyId} onChange={e => set('companyId', e.target.value)} style={{ width: '100%' }}>
            <option value="">— None —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Financial Year"><input className="input" value={f.financialYear} onChange={e => set('financialYear', e.target.value)} placeholder="2025-26" /></Field>
        <Field label="Quarter">
          <select className="input" value={f.quarter} onChange={e => set('quarter', e.target.value)}>
            <option value="Q1">Q1</option><option value="Q2">Q2</option>
            <option value="Q3">Q3</option><option value="Q4">Q4</option>
          </select>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Gross Amount (₹)"><input className="input" type="number" step="0.01" value={f.grossAmount} onChange={e => set('grossAmount', e.target.value)} /></Field>
        <Field label="TDS Rate (%)"><input className="input" type="number" step="0.01" value={f.tdsRate} onChange={e => set('tdsRate', e.target.value)} /></Field>
      </div>
      <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
        TDS Amount: <b style={{ color: 'var(--accent)' }}>{fmtINR(tdsAmount)}</b>
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Record" />
    </ModalShell>
  );
}

function DepositTdsModal({ row, onClose, onSaved }) {
  const [banks, setBanks] = useState([]);
  const [f, setF] = useState({ depositDate: today(), challanNumber: '', paidViaAccountId: '' });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    finoListBanks().then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : [])).catch(() => setBanks([]));
  }, []);
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.paidViaAccountId) throw new Error('Bank account required');
      await finoDepositTds(row.id, f);
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title="Deposit TDS to Government" onClose={onClose}>
      <div style={{ background: 'var(--bg-page)', padding: 8, borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
        TDS amount: <b>{fmtINR(row.tds_amount)}</b> · {row.financial_year} {row.quarter}
      </div>
      <Field label="Deposit Date"><input className="input" type="date" value={f.depositDate} onChange={e => set('depositDate', e.target.value)} /></Field>
      <Field label="Challan Number"><input className="input" value={f.challanNumber} onChange={e => set('challanNumber', e.target.value)} placeholder="CIN…" /></Field>
      <Field label="Paid From">
        <select className="input" value={f.paidViaAccountId} onChange={e => set('paidViaAccountId', e.target.value)} style={{ width: '100%' }}>
          <option value="">— Select —</option>
          {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
        </select>
      </Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Deposit" />
    </ModalShell>
  );
}

// ─── GST ─────────────────────────────────────────────────────────────────────

function GstTab() {
  const [rows, setRows] = useState([]);
  const [summ, setSumm] = useState(null);
  const [modal, setModal] = useState(null);
  const reload = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([finoListGst(), finoGstSummary()]);
      setRows(l.data.records || []);
      setSumm(s.data);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  return (
    <>
      {summ && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Returns"  value={summ.count} />
          <SummaryCard label="Output"   value={fmtINR(summ.totalOutput)} fg="#ef4444" />
          <SummaryCard label="Input"    value={fmtINR(summ.totalInput)}  fg="#22c55e" />
          <SummaryCard label="Net"      value={fmtINR(summ.totalNet)} fg="var(--accent)" />
          <SummaryCard label="Paid"     value={fmtINR(summ.totalPaid)}   fg="#22c55e" />
          <SummaryCard label="Pending"  value={fmtINR(summ.pending)}     fg="#f59e0b" />
        </div>
      )}
      <div style={{ marginBottom: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'recordGst' })}><Plus size={13} /> Record GST Return</button>
      </div>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No GST records yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>Period</th>
                <th style={{ padding: '8px 10px' }}>Type</th>
                <th style={{ padding: '8px 10px' }}>Company</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Output</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Input</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Net</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>{r.return_period}</td>
                  <td style={{ padding: '8px 10px' }}>{r.return_type}</td>
                  <td style={{ padding: '8px 10px' }}>{r.company?.name || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtINR(r.total_output_gst)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtINR(r.total_input_gst)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtINR(r.net_gst_payable)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                      background: r.status === 'paid' ? 'rgba(34,197,94,0.15)' : r.status === 'cancelled' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      color: r.status === 'paid' ? '#22c55e' : r.status === 'cancelled' ? '#ef4444' : '#f59e0b',
                    }}>{r.status}</span>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <RowMenu items={[
                      { label: 'Mark Filed', disabled: r.status !== 'draft',
                        onClick: async () => { await finoFileGst(r.id, { filedDate: today() }); reload(); } },
                      { label: 'Pay GST', disabled: r.status === 'paid' || r.status === 'cancelled',
                        onClick: () => setModal({ kind: 'payGst', row: r }) },
                      { label: 'Cancel', icon: <Trash2 size={12} />, danger: true,
                        disabled: r.status === 'cancelled',
                        onClick: () => setModal({ kind: 'cancelGst', row: r }) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {modal?.kind === 'recordGst' && <RecordGstModal onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'payGst'    && <PayGstModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'cancelGst' && (
        <DeleteConfirmModal title="Cancel GST Record"
          description="Reverses the payment ledger entry if any."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoCancelGst(modal.row.id, reason); reload(); }} />
      )}
    </>
  );
}

function RecordGstModal({ onClose, onSaved }) {
  const [companies, setCompanies] = useState([]);
  const [f, setF] = useState({
    companyId: '', returnPeriod: monthStr(), returnType: 'GSTR3B',
    totalOutputGst: '', totalInputGst: '', igst: '', cgst: '', sgst: '', notes: '',
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    finoListCompanies().then(r => setCompanies(r.data.companies || [])).catch(() => setCompanies([]));
  }, []);
  const net = (Number(f.totalOutputGst) || 0) - (Number(f.totalInputGst) || 0);
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.returnPeriod) throw new Error('Return period required');
      await finoRecordGst({
        ...f,
        companyId: f.companyId || null,
        totalOutputGst: Number(f.totalOutputGst) || 0,
        totalInputGst:  Number(f.totalInputGst)  || 0,
        igst: Number(f.igst) || 0,
        cgst: Number(f.cgst) || 0,
        sgst: Number(f.sgst) || 0,
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title="Record GST Return" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Period"><input className="input" type="month" value={f.returnPeriod} onChange={e => set('returnPeriod', e.target.value)} /></Field>
        <Field label="Type">
          <select className="input" value={f.returnType} onChange={e => set('returnType', e.target.value)}>
            <option value="GSTR1">GSTR1</option>
            <option value="GSTR3B">GSTR3B</option>
            <option value="GSTR9">GSTR9</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </div>
      <Field label="Company">
        <select className="input" value={f.companyId} onChange={e => set('companyId', e.target.value)} style={{ width: '100%' }}>
          <option value="">— None —</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Output GST"><input className="input" type="number" step="0.01" value={f.totalOutputGst} onChange={e => set('totalOutputGst', e.target.value)} /></Field>
        <Field label="Input GST"><input className="input" type="number" step="0.01" value={f.totalInputGst} onChange={e => set('totalInputGst', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="IGST"><input className="input" type="number" step="0.01" value={f.igst} onChange={e => set('igst', e.target.value)} /></Field>
        <Field label="CGST"><input className="input" type="number" step="0.01" value={f.cgst} onChange={e => set('cgst', e.target.value)} /></Field>
        <Field label="SGST"><input className="input" type="number" step="0.01" value={f.sgst} onChange={e => set('sgst', e.target.value)} /></Field>
      </div>
      <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
        Net GST Payable: <b style={{ color: net >= 0 ? '#ef4444' : '#22c55e' }}>{fmtINR(net)}</b>
        {net < 0 && <span style={{ color: 'var(--text-muted)' }}> (input credit carry forward)</span>}
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Record" />
    </ModalShell>
  );
}

function PayGstModal({ row, onClose, onSaved }) {
  const [banks, setBanks] = useState([]);
  const [f, setF] = useState({ paymentDate: today(), paymentAmount: row.net_gst_payable, paidViaAccountId: '' });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    finoListBanks().then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : [])).catch(() => setBanks([]));
  }, []);
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.paidViaAccountId)            throw new Error('Bank account required');
      if (!(Number(f.paymentAmount) > 0)) throw new Error('Payment amount > 0');
      await finoPayGst(row.id, { ...f, paymentAmount: Number(f.paymentAmount) });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title="Pay GST" onClose={onClose}>
      <div style={{ background: 'var(--bg-page)', padding: 8, borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
        Net Payable: <b>{fmtINR(row.net_gst_payable)}</b> · {row.return_type} {row.return_period}
      </div>
      <Field label="Payment Date"><input className="input" type="date" value={f.paymentDate} onChange={e => set('paymentDate', e.target.value)} /></Field>
      <Field label="Payment Amount (₹)"><input className="input" type="number" step="0.01" value={f.paymentAmount} onChange={e => set('paymentAmount', e.target.value)} /></Field>
      <Field label="Paid From">
        <select className="input" value={f.paidViaAccountId} onChange={e => set('paidViaAccountId', e.target.value)} style={{ width: '100%' }}>
          <option value="">— Select —</option>
          {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
        </select>
      </Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Pay" />
    </ModalShell>
  );
}

// ─── Shared UI bits ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, fg }) {
  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: fg || 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
function ModalShell({ title, onClose, children, maxWidth = 460 }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 22, width: '100%', maxWidth, maxHeight: '92vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function ErrBox({ msg }) {
  if (!msg) return null;
  return <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
    <AlertCircle size={14} /> {msg}
  </div>;
}
function Buttons({ onCancel, onSave, saving, label }) {
  return <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
    <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel}>Cancel</button>
    <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={onSave} disabled={saving}>
      {saving ? 'Saving…' : label}
    </button>
  </div>;
}
