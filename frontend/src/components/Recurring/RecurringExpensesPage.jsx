import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Trash2, AlertCircle, Repeat, Play } from 'lucide-react';
import {
  finoListRecurring, finoCreateRecurring, finoDeleteRecurring,
  finoGenerateDueRecurring, finoRecurringSummary,
  finoListBanks,
} from '../../services/api';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

// Common expense COA codes seeded by the system
const EXPENSE_COA = [
  { code: '5100', label: '5100 Purchases' },
  { code: '5210', label: '5210 Cash Conversion Charge' },
  { code: '5220', label: '5220 Bank Charges' },
  { code: '5230', label: '5230 Shipping' },
  { code: '5240', label: '5240 Custom Duty' },
  { code: '5290', label: '5290 Petty Cash Expense' },
  { code: '5300', label: '5300 Salary' },
  { code: '5400', label: '5400 Office Rent' },
  { code: '5500', label: '5500 Marketing / Ads' },
  { code: '5550', label: '5550 Hosting & Domain' },
  { code: '5560', label: '5560 Web Development' },
  { code: '5600', label: '5600 Office Expenses' },
  { code: '5700', label: '5700 Misc Expenses' },
];

export default function RecurringExpensesPage() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [modal, setModal] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([finoListRecurring(), finoRecurringSummary()]);
      setRows(l.data.items || []);
      setSummary(s.data);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const generate = async () => {
    setGenerating(true); setGenResult(null);
    try {
      const r = await finoGenerateDueRecurring({});
      setGenResult(r.data);
      await reload();
    } catch (e) { setGenResult({ error: e?.response?.data?.error || e.message }); }
    finally { setGenerating(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Recurring Expenses</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={generate} disabled={generating}>
            <Play size={13} /> {generating ? 'Generating…' : 'Generate Due'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'new' })}><Plus size={13} /> New Recurring</button>
        </div>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Active Recurring" value={summary.activeCount} />
          <SummaryCard label="Monthly Equivalent" value={fmtINR(summary.monthlyEquivalent)} fg="var(--accent)" />
          <SummaryCard label="Due This Week" value={summary.upcomingThisWeek?.length || 0} fg={(summary.upcomingThisWeek?.length || 0) > 0 ? '#f59e0b' : 'var(--text-muted)'} />
        </div>
      )}

      {genResult && (
        <div style={{ background: genResult.error ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.10)', padding: 10, borderRadius: 8, marginBottom: 14, fontSize: 12 }}>
          {genResult.error ? `Error: ${genResult.error}` : `Generated ${genResult.count} ledger entries.`}
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No recurring expenses yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>Name</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '8px 10px' }}>Frequency</th>
                <th style={{ padding: '8px 10px' }}>Category</th>
                <th style={{ padding: '8px 10px' }}>Next Due</th>
                <th style={{ padding: '8px 10px' }}>Last Generated</th>
                <th style={{ padding: '8px 10px' }}>Active</th>
                <th style={{ padding: '8px 10px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const overdue = r.is_active && r.next_due_date && r.next_due_date < today();
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                      <Repeat size={11} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--text-muted)' }} />
                      {r.name}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtINR(r.amount)}</td>
                    <td style={{ padding: '8px 10px' }}>{r.frequency}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{r.expense_category_code}</td>
                    <td style={{ padding: '8px 10px', color: overdue ? '#ef4444' : 'var(--text-primary)', fontWeight: overdue ? 700 : 400 }}>
                      {r.next_due_date}{overdue ? ' (overdue)' : ''}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{r.last_generated_date || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                        background: r.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(120,120,120,0.15)',
                        color: r.is_active ? '#22c55e' : 'var(--text-muted)',
                      }}>{r.is_active ? 'active' : 'inactive'}</span>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <RowMenu items={[
                        { label: 'Delete', icon: <Trash2 size={12} />, danger: true,
                          onClick: () => setModal({ kind: 'delete', row: r }) },
                      ]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal?.kind === 'new' && <NewRecurringModal onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'delete' && (
        <DeleteConfirmModal title={`Delete ${modal.row.name}`}
          description="Soft-deletes the recurring template. Past ledger entries are kept."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoDeleteRecurring(modal.row.id, reason); reload(); }} />
      )}
    </div>
  );
}

function NewRecurringModal({ onClose, onSaved }) {
  const [banks, setBanks] = useState([]);
  const [f, setF] = useState({
    name: '', description: '', amount: '', frequency: 'monthly',
    expenseCategoryCode: '5400', paidViaAccountId: '',
    startDate: today(), endDate: '', autoCreate: false, notes: '',
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    finoListBanks().then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : [])).catch(() => setBanks([]));
  }, []);
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.name.trim())          throw new Error('Name required');
      if (!(Number(f.amount) > 0)) throw new Error('Amount > 0');
      if (!f.paidViaAccountId)     throw new Error('Bank account required');
      await finoCreateRecurring({ ...f, amount: Number(f.amount) });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title="New Recurring Expense" onClose={onClose}>
      <Field label="Name"><input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Office Rent" /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Amount (₹)"><input className="input" type="number" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
        <Field label="Frequency">
          <select className="input" value={f.frequency} onChange={e => set('frequency', e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </Field>
      </div>
      <Field label="Expense Category">
        <select className="input" value={f.expenseCategoryCode} onChange={e => set('expenseCategoryCode', e.target.value)}>
          {EXPENSE_COA.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="Pay From">
        <select className="input" value={f.paidViaAccountId} onChange={e => set('paidViaAccountId', e.target.value)} style={{ width: '100%' }}>
          <option value="">— Select —</option>
          {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Start Date"><input className="input" type="date" value={f.startDate} onChange={e => set('startDate', e.target.value)} /></Field>
        <Field label="End Date (optional)"><input className="input" type="date" value={f.endDate} onChange={e => set('endDate', e.target.value)} /></Field>
      </div>
      <Field label="Description"><input className="input" value={f.description} onChange={e => set('description', e.target.value)} /></Field>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Create" />
    </ModalShell>
  );
}

function SummaryCard({ label, value, fg }) {
  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: fg || 'var(--text-primary)' }}>{value}</div>
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
