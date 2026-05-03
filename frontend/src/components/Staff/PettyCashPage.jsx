import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Trash2, AlertCircle, Wallet } from 'lucide-react';
import {
  finoListPettyCash, finoCreatePettyCash, finoDeletePettyCash, finoPettyCashSummary,
  finoListBanks, finoListParties,
} from '../../services/api';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const EXPENSE_COA = [
  { code: '5290', label: '5290 Petty Cash Expense' },
  { code: '5230', label: '5230 Shipping' },
  { code: '5400', label: '5400 Office Rent' },
  { code: '5500', label: '5500 Marketing / Ads' },
  { code: '5600', label: '5600 Office Expenses' },
  { code: '5700', label: '5700 Misc Expenses' },
];

export default function PettyCashPage() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [modal, setModal] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([finoListPettyCash(), finoPettyCashSummary()]);
      setRows(l.data.records || []);
      setSummary(s.data);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Petty Cash</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'new' })}><Plus size={13} /> New Transaction</button>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Records" value={summary.count} />
          <SummaryCard label="Advances" value={fmtINR(summary.totalAdvances)} fg="#3b82f6" />
          <SummaryCard label="Expenses" value={fmtINR(summary.totalExpenses)} fg="#ef4444" />
          <SummaryCard label="Settlements" value={fmtINR(summary.totalSettlements)} fg="#22c55e" />
          <SummaryCard label="Outstanding" value={fmtINR(summary.totalOutstanding)} fg={summary.totalOutstanding > 0 ? '#f59e0b' : 'var(--text-muted)'} />
        </div>
      )}

      {summary?.staffSummary?.length > 0 && (
        <div style={{ marginBottom: 14, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Per-Staff Outstanding</div>
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead><tr style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Staff</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>Advances</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>Expenses</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>Settled</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>Outstanding</th>
            </tr></thead>
            <tbody>
              {summary.staffSummary.map(s => (
                <tr key={s.staff_party_id}>
                  <td style={{ padding: '4px 6px', fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{fmtINR(s.advances)}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{fmtINR(s.expenses)}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{fmtINR(s.settlements)}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, color: s.outstanding > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                    {fmtINR(s.outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No petty cash records yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>#</th>
                <th style={{ padding: '8px 10px' }}>Date</th>
                <th style={{ padding: '8px 10px' }}>Type</th>
                <th style={{ padding: '8px 10px' }}>Staff</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '8px 10px' }}>Description</th>
                <th style={{ padding: '8px 10px' }}>Receipt</th>
                <th style={{ padding: '8px 10px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>{r.txn_number}</td>
                  <td style={{ padding: '8px 10px' }}>{r.txn_date}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                      background: r.txn_type === 'advance' ? 'rgba(59,130,246,0.15)' : r.txn_type === 'expense' ? 'rgba(239,68,68,0.15)' : r.txn_type === 'settlement' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                      color: r.txn_type === 'advance' ? '#3b82f6' : r.txn_type === 'expense' ? '#ef4444' : r.txn_type === 'settlement' ? '#22c55e' : '#f59e0b',
                    }}>{r.txn_type}</span>
                  </td>
                  <td style={{ padding: '8px 10px' }}>{r.staff?.name || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtINR(r.amount)}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{r.description || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{r.receipt_attached ? '✅' : '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <RowMenu items={[
                      { label: 'Cancel', icon: <Trash2 size={12} />, danger: true,
                        onClick: () => setModal({ kind: 'delete', row: r }) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal?.kind === 'new' && <NewPettyCashModal onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'delete' && (
        <DeleteConfirmModal title={`Cancel ${modal.row.txn_number}`}
          description="Reverses the petty cash ledger entry."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoDeletePettyCash(modal.row.id, reason); reload(); }} />
      )}
    </div>
  );
}

function NewPettyCashModal({ onClose, onSaved }) {
  const [parties, setParties] = useState([]);
  const [banks, setBanks] = useState([]);
  const [f, setF] = useState({
    txnDate: today(), txnType: 'advance', staffPartyId: '', amount: '',
    description: '', expenseCategoryCode: '5290', receiptAttached: false,
    approvedBy: '', paidViaAccountId: '', notes: '',
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    finoListParties().then(r => setParties(r.data.parties || [])).catch(() => setParties([]));
    finoListBanks().then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : [])).catch(() => setBanks([]));
  }, []);
  const needsBank = f.txnType === 'advance' || f.txnType === 'refund';
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.staffPartyId)         throw new Error('Staff required');
      if (!(Number(f.amount) > 0)) throw new Error('Amount > 0');
      if (needsBank && !f.paidViaAccountId) throw new Error('Bank account required for advance/refund');
      await finoCreatePettyCash({ ...f, amount: Number(f.amount) });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title="New Petty Cash Transaction" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Date"><input className="input" type="date" value={f.txnDate} onChange={e => set('txnDate', e.target.value)} /></Field>
        <Field label="Type">
          <select className="input" value={f.txnType} onChange={e => set('txnType', e.target.value)}>
            <option value="advance">Advance (cash to staff)</option>
            <option value="expense">Expense (staff spent)</option>
            <option value="settlement">Settlement (staff returned)</option>
            <option value="refund">Refund (cash back to float)</option>
          </select>
        </Field>
      </div>
      <Field label="Staff">
        <select className="input" value={f.staffPartyId} onChange={e => set('staffPartyId', e.target.value)} style={{ width: '100%' }}>
          <option value="">— Select —</option>
          {parties.filter(p => p.is_employee).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          <optgroup label="All Parties (auto-tag)">
            {parties.filter(p => !p.is_employee).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </optgroup>
        </select>
      </Field>
      <Field label="Amount (₹)"><input className="input" type="number" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
      {f.txnType === 'expense' && (
        <Field label="Expense Category">
          <select className="input" value={f.expenseCategoryCode} onChange={e => set('expenseCategoryCode', e.target.value)}>
            {EXPENSE_COA.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </Field>
      )}
      {needsBank && (
        <Field label={f.txnType === 'advance' ? 'Withdraw From' : 'Refund From'}>
          <select className="input" value={f.paidViaAccountId} onChange={e => set('paidViaAccountId', e.target.value)} style={{ width: '100%' }}>
            <option value="">— Select —</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
          </select>
        </Field>
      )}
      <Field label="Description"><input className="input" value={f.description} onChange={e => set('description', e.target.value)} /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Approved By"><input className="input" value={f.approvedBy} onChange={e => set('approvedBy', e.target.value)} /></Field>
        <Field label="Receipt Attached">
          <select className="input" value={f.receiptAttached ? 'yes' : 'no'} onChange={e => set('receiptAttached', e.target.value === 'yes')}>
            <option value="no">No</option><option value="yes">Yes</option>
          </select>
        </Field>
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Save" />
    </ModalShell>
  );
}

function SummaryCard({ label, value, fg }) {
  return <div style={{ background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 12 }}>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 700, color: fg || 'var(--text-primary)' }}>{value}</div>
  </div>;
}
function Field({ label, children }) {
  return <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
    {children}
  </div>;
}
function ModalShell({ title, onClose, children, maxWidth = 460 }) {
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 22, width: '100%', maxWidth, maxHeight: '92vh', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
        <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
      </div>
      {children}
    </div>
  </div>;
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
