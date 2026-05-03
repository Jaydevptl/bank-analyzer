import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Minus, Scale, X, Pencil, Trash2 } from 'lucide-react';
import {
  finoCashBalance, finoCashLedger, finoCashDeposit,
  finoCashWithdrawal, finoCashAdjustment,
  finoDeleteCashTxn, finoUpdateCashTxn,
} from '../../services/api';
import EditModal from '../shared/EditModal';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const SOURCES = [
  { v: 'customer_payment', l: 'Customer Payment' },
  { v: 'sales',            l: 'Sales' },
  { v: 'other_income',     l: 'Other Income' },
  { v: 'refund',           l: 'Refund' },
  { v: 'drawings_in',      l: 'Owner Contribution' },
  { v: 'manual',           l: 'Manual / Other' },
];
const DESTS = [
  { v: 'supplier_payment', l: 'Supplier Payment' },
  { v: 'expense',          l: 'Expense' },
  { v: 'salary',           l: 'Salary' },
  { v: 'rent',             l: 'Office Rent' },
  { v: 'marketing',        l: 'Marketing' },
  { v: 'office_expense',   l: 'Office Expense' },
  { v: 'shipping',         l: 'Shipping' },
  { v: 'drawings_out',     l: 'Owner Drawings' },
  { v: 'manual',           l: 'Manual / Other' },
];

export default function CashInHandPage() {
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger]   = useState({ entries: [] });
  const [modal, setModal]     = useState(null); // 'in' | 'out' | 'adjust'
  const [rowModal, setRowModal] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([finoCashBalance(), finoCashLedger({ limit: 200 })])
      .then(([b, l]) => { setBalance(b.data.balance); setLedger(l.data); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);
  const onSaved = () => { setModal(null); reload(); };

  return (
    <div>
      {/* Top card */}
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 12, padding: 22,
        border: '1px solid var(--border)', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Cash in Hand</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(balance)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ledger.total || 0} transactions</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => setModal('in')} style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--success)' }}>
            <Plus size={13} /> Cash In
          </button>
          <button className="btn btn-sm" onClick={() => setModal('out')} style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}>
            <Minus size={13} /> Cash Out
          </button>
          <button className="btn btn-sm" onClick={() => setModal('adjust')} style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--warning)' }}>
            <Scale size={13} /> Adjust
          </button>
        </div>
      </div>

      {/* Ledger */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>Recent Activity</h3>
        {loading ? <div className="spinner" style={{ margin: '40px auto' }} /> : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Date</th>
                <th style={{ padding: '6px 8px' }}>Description</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>In</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Out</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Balance</th>
                <th style={{ padding: '6px 8px', width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {ledger.entries.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No cash activity yet.</td></tr>
              ) : ledger.entries.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)', opacity: r.is_reversed ? 0.5 : 1 }}>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{r.txn_date}</td>
                  <td style={{ padding: '8px' }}>{r.description || '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: 'var(--success)' }}>{r.direction === 'debit' ? fmt(r.amount) : ''}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: 'var(--danger)' }}>{r.direction === 'credit' ? fmt(r.amount) : ''}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{fmt(r.running_balance)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <RowMenu items={[
                      { label: 'Edit description', icon: <Pencil size={12} />, disabled: r.is_reversed,
                        onClick: () => setRowModal({ kind: 'edit', row: r }) },
                      { label: 'Delete (reverse)', icon: <Trash2 size={12} />, danger: true, disabled: r.is_reversed,
                        onClick: () => setRowModal({ kind: 'delete', row: r }) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal === 'in'     && <CashInOutModal mode="in"  onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'out'    && <CashInOutModal mode="out" onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'adjust' && <AdjustModal onClose={() => setModal(null)} onSaved={onSaved} />}

      {rowModal?.kind === 'edit' && (
        <EditModal title="Edit Cash Entry"
          fields={[
            { key: 'description', label: 'Description' },
            { key: 'date',        label: 'Date', type: 'date' },
          ]}
          initialValues={{ description: rowModal.row.description || '', date: rowModal.row.txn_date }}
          onClose={() => setRowModal(null)}
          onSubmit={(patch) => finoUpdateCashTxn(rowModal.row.txn_group_id, patch).then(() => { setRowModal(null); reload(); })}
        />
      )}
      {rowModal?.kind === 'delete' && (
        <DeleteConfirmModal title="Reverse Cash Entry"
          description={`A balanced reversal entry will be inserted. Cash balance will adjust by ${fmt(rowModal.row.amount)}.`}
          confirmLabel="Reverse"
          onClose={() => setRowModal(null)}
          onConfirm={(reason) => finoDeleteCashTxn(rowModal.row.txn_group_id, reason).then(() => { setRowModal(null); reload(); })}
        />
      )}
    </div>
  );
}

// reuse small primitives via local copy
function ModalShell({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', borderRadius: 12, padding: 22,
        width: '100%', maxWidth: 460, maxHeight: '90vh', overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

function CashInOutModal({ mode, onClose, onSaved }) {
  const isIn = mode === 'in';
  const opts = isIn ? SOURCES : DESTS;
  const [f, setF] = useState({ amount: '', date: today(), category: opts[0].v, description: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null);
    const amt = Number(f.amount);
    if (!(amt > 0)) return setErr('Amount must be > 0');
    setSaving(true);
    try {
      const payload = { amount: amt, date: f.date, description: f.description };
      if (isIn) await finoCashDeposit({ ...payload, source: f.category });
      else      await finoCashWithdrawal({ ...payload, destination: f.category });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title={isIn ? 'Cash In' : 'Cash Out'} onClose={onClose}>
      <Field label="Amount (₹) *"><input className="input" type="number" step="0.01" autoFocus value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
      <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
      <Field label={isIn ? 'Source' : 'Destination'}>
        <select className="input" value={f.category} onChange={e => set('category', e.target.value)}>
          {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </Field>
      <Field label="Description"><input className="input" value={f.description} onChange={e => set('description', e.target.value)} placeholder="Optional" /></Field>
      {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : (isIn ? 'Add Cash' : 'Spend Cash')}
        </button>
      </div>
    </ModalShell>
  );
}

function AdjustModal({ onClose, onSaved }) {
  const [f, setF] = useState({ type: 'add', amount: '', date: today(), reason: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null);
    const amt = Number(f.amount);
    if (!(amt > 0))     return setErr('Amount must be > 0');
    if (!f.reason.trim()) return setErr('Reason required');
    setSaving(true);
    try { await finoCashAdjustment({ ...f, amount: amt }); onSaved(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title="Adjust Cash" onClose={onClose}>
      <Field label="Type">
        <div style={{ display: 'flex', gap: 6 }}>
          {['add', 'reduce'].map(t => (
            <button key={t} className={`btn btn-sm ${f.type === t ? 'btn-primary' : ''}`}
              style={{ flex: 1, justifyContent: 'center' }} onClick={() => set('type', t)}>
              {t === 'add' ? '➕ Add' : '➖ Reduce'}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Amount (₹) *"><input className="input" type="number" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
      <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
      <Field label="Reason *"><input className="input" value={f.reason} onChange={e => set('reason', e.target.value)} placeholder="Physical count correction / Found / Lost..." /></Field>
      {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Save Adjustment'}
        </button>
      </div>
    </ModalShell>
  );
}
