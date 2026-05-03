import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Trash2, AlertCircle, ArrowRightLeft, Wallet } from 'lucide-react';
import {
  finoIcDashboard,
  finoListTransfers, finoCreateTransfer, finoCancelTransfer, finoNextTransferNumber,
  finoListDrawings, finoCreateDrawing, finoCancelDrawing, finoNextDrawingNumber,
  finoListCompanies, finoListBanks, finoListParties,
} from '../../services/api';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const TABS = [
  { id: 'transfers', label: 'Inter-company Transfers' },
  { id: 'drawings',  label: 'Owner Drawings' },
];

export default function IntercompanyPage() {
  const [tab, setTab] = useState('transfers');
  const [dashboard, setDashboard] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [drawings, setDrawings]   = useState([]);
  const [modal, setModal] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [d, t, dr] = await Promise.all([
        finoIcDashboard(), finoListTransfers(), finoListDrawings(),
      ]);
      setDashboard(d.data);
      setTransfers(t.data.transfers || []);
      setDrawings(dr.data.drawings || []);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const onSaved = () => { setModal(null); reload(); };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Inter-company & Owner Drawings</h1>
      </div>

      {dashboard && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Transfers"        value={dashboard.transferCount} />
          <SummaryCard label="Total Transferred" value={fmtINR(dashboard.totalTransferred)} fg="var(--accent)" />
          <SummaryCard label="Drawings"         value={dashboard.drawingCount} />
          <SummaryCard label="Withdrawals"      value={fmtINR(dashboard.totalWithdrawals)} fg="#ef4444" />
          <SummaryCard label="Contributions"    value={fmtINR(dashboard.totalContributions)} fg="#22c55e" />
          <SummaryCard label="Net Drawings"     value={fmtINR(dashboard.netDrawings)} fg={dashboard.netDrawings > 0 ? '#ef4444' : '#22c55e'} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', border: 'none', cursor: 'pointer',
            background: tab === t.id ? 'var(--bg-page)' : 'transparent',
            borderRadius: '6px 6px 0 0',
            fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'transfers' && <TransfersTab rows={transfers} onAct={setModal} />}
      {tab === 'drawings'  && <DrawingsTab  rows={drawings}  onAct={setModal} />}

      {modal?.kind === 'newTransfer'    && <NewTransferModal onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'newDrawing'     && <NewDrawingModal  onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'deleteTransfer' && (
        <DeleteConfirmModal title={`Cancel ${modal.row.transfer_number}`}
          description="Reverses the inter-company ledger entry and refreshes affected bank balances."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoCancelTransfer(modal.row.id, reason); reload(); }} />
      )}
      {modal?.kind === 'deleteDrawing' && (
        <DeleteConfirmModal title={`Cancel ${modal.row.drawing_number}`}
          description="Reverses the drawing/contribution ledger entry."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoCancelDrawing(modal.row.id, reason); reload(); }} />
      )}
    </div>
  );
}

function TransfersTab({ rows, onAct }) {
  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={() => onAct({ kind: 'newTransfer' })}><Plus size={13} /> New Transfer</button>
      </div>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No transfers yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>#</th>
                <th style={{ padding: '8px 10px' }}>Date</th>
                <th style={{ padding: '8px 10px' }}>From</th>
                <th style={{ padding: '8px 10px', width: 30 }}></th>
                <th style={{ padding: '8px 10px' }}>To</th>
                <th style={{ padding: '8px 10px' }}>Type</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>{r.transfer_number}</td>
                  <td style={{ padding: '8px 10px' }}>{r.transfer_date}</td>
                  <td style={{ padding: '8px 10px' }}>{r.from_company?.name || '—'}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}><ArrowRightLeft size={12} /></td>
                  <td style={{ padding: '8px 10px' }}>{r.to_company?.name || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{r.transfer_type}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtINR(r.amount)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                      background: r.status === 'completed' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: r.status === 'completed' ? '#22c55e' : '#ef4444',
                    }}>{r.status}</span>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <RowMenu items={[
                      { label: 'Cancel', icon: <Trash2 size={12} />, danger: true,
                        disabled: r.status === 'cancelled',
                        onClick: () => onAct({ kind: 'deleteTransfer', row: r }) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function DrawingsTab({ rows, onAct }) {
  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={() => onAct({ kind: 'newDrawing' })}><Plus size={13} /> New Drawing/Contribution</button>
      </div>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No drawings yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>#</th>
                <th style={{ padding: '8px 10px' }}>Date</th>
                <th style={{ padding: '8px 10px' }}>Owner</th>
                <th style={{ padding: '8px 10px' }}>Company</th>
                <th style={{ padding: '8px 10px' }}>Type</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '8px 10px' }}>Description</th>
                <th style={{ padding: '8px 10px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>{r.drawing_number}</td>
                  <td style={{ padding: '8px 10px' }}>{r.drawing_date}</td>
                  <td style={{ padding: '8px 10px' }}>{r.owner?.name || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{r.company?.name || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                      background: r.drawing_type === 'withdrawal' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                      color: r.drawing_type === 'withdrawal' ? '#ef4444' : '#22c55e',
                    }}>{r.drawing_type}</span>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtINR(r.amount)}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{r.description || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <RowMenu items={[
                      { label: 'Cancel', icon: <Trash2 size={12} />, danger: true,
                        onClick: () => onAct({ kind: 'deleteDrawing', row: r }) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function NewTransferModal({ onClose, onSaved }) {
  const [companies, setCompanies] = useState([]);
  const [banks, setBanks] = useState([]);
  const [number, setNumber] = useState('');
  const [f, setF] = useState({
    transferDate: today(), fromCompanyId: '', toCompanyId: '',
    transferType: 'internal', amount: '', description: '',
    fromAccountId: '', toAccountId: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  useEffect(() => {
    finoListCompanies().then(r => setCompanies(r.data.companies || [])).catch(() => setCompanies([]));
    finoListBanks().then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : [])).catch(() => setBanks([]));
    finoNextTransferNumber().then(r => setNumber(r.data.transfer_number)).catch(() => {});
  }, []);
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.fromCompanyId || !f.toCompanyId) throw new Error('Both companies required');
      if (f.fromCompanyId === f.toCompanyId)  throw new Error('From and to must differ');
      if (!(Number(f.amount) > 0))            throw new Error('Amount > 0');
      if (!f.fromAccountId)                   throw new Error('From account required');
      if (f.transferType !== 'investment' && !f.toAccountId) throw new Error('To account required');
      await finoCreateTransfer({
        transferNumber: number || undefined,
        ...f, amount: Number(f.amount),
        toAccountId: f.transferType === 'investment' ? null : f.toAccountId,
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title="New Inter-company Transfer" onClose={onClose} maxWidth={540}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Transfer #"><input className="input" value={number} onChange={e => setNumber(e.target.value)} /></Field>
        <Field label="Date"><input className="input" type="date" value={f.transferDate} onChange={e => set('transferDate', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="From Company">
          <select className="input" value={f.fromCompanyId} onChange={e => set('fromCompanyId', e.target.value)} style={{ width: '100%' }}>
            <option value="">— Select —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="To Company">
          <select className="input" value={f.toCompanyId} onChange={e => set('toCompanyId', e.target.value)} style={{ width: '100%' }}>
            <option value="">— Select —</option>
            {companies.filter(c => c.id !== f.fromCompanyId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Transfer Type">
        <select className="input" value={f.transferType} onChange={e => set('transferType', e.target.value)}>
          <option value="internal">Internal (cash movement)</option>
          <option value="investment">Investment</option>
          <option value="loan">Loan</option>
          <option value="expense_share">Expense Share</option>
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="From Account (debit-side)">
          <select className="input" value={f.fromAccountId} onChange={e => set('fromAccountId', e.target.value)} style={{ width: '100%' }}>
            <option value="">— Select —</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
          </select>
        </Field>
        {f.transferType !== 'investment' && (
          <Field label="To Account">
            <select className="input" value={f.toAccountId} onChange={e => set('toAccountId', e.target.value)} style={{ width: '100%' }}>
              <option value="">— Select —</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
            </select>
          </Field>
        )}
      </div>
      <Field label="Amount (₹)"><input className="input" type="number" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
      <Field label="Description"><input className="input" value={f.description} onChange={e => set('description', e.target.value)} placeholder="Funding for inventory" /></Field>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Create" />
    </ModalShell>
  );
}

function NewDrawingModal({ onClose, onSaved }) {
  const [companies, setCompanies] = useState([]);
  const [parties, setParties] = useState([]);
  const [banks, setBanks] = useState([]);
  const [number, setNumber] = useState('');
  const [f, setF] = useState({
    drawingDate: today(), ownerPartyId: '', companyId: '',
    drawingType: 'withdrawal', amount: '', description: '',
    paidViaAccountId: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  useEffect(() => {
    finoListCompanies().then(r => setCompanies(r.data.companies || [])).catch(() => setCompanies([]));
    finoListParties().then(r => setParties(r.data.parties || [])).catch(() => setParties([]));
    finoListBanks().then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : [])).catch(() => setBanks([]));
    finoNextDrawingNumber().then(r => setNumber(r.data.drawing_number)).catch(() => {});
  }, []);
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.ownerPartyId)         throw new Error('Owner required');
      if (!(Number(f.amount) > 0)) throw new Error('Amount > 0');
      if (!f.paidViaAccountId)     throw new Error('Bank account required');
      await finoCreateDrawing({ drawingNumber: number || undefined, ...f, amount: Number(f.amount) });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title="New Owner Drawing/Contribution" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Drawing #"><input className="input" value={number} onChange={e => setNumber(e.target.value)} /></Field>
        <Field label="Date"><input className="input" type="date" value={f.drawingDate} onChange={e => set('drawingDate', e.target.value)} /></Field>
      </div>
      <Field label="Owner">
        <select className="input" value={f.ownerPartyId} onChange={e => set('ownerPartyId', e.target.value)} style={{ width: '100%' }}>
          <option value="">— Select —</option>
          {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Company (optional)">
        <select className="input" value={f.companyId} onChange={e => set('companyId', e.target.value)} style={{ width: '100%' }}>
          <option value="">— None —</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Type">
        <select className="input" value={f.drawingType} onChange={e => set('drawingType', e.target.value)}>
          <option value="withdrawal">Withdrawal (owner takes money)</option>
          <option value="contribution">Contribution (owner adds money)</option>
        </select>
      </Field>
      <Field label={f.drawingType === 'withdrawal' ? 'Paid From' : 'Received Into'}>
        <select className="input" value={f.paidViaAccountId} onChange={e => set('paidViaAccountId', e.target.value)} style={{ width: '100%' }}>
          <option value="">— Select —</option>
          {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
        </select>
      </Field>
      <Field label="Amount (₹)"><input className="input" type="number" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
      <Field label="Description"><input className="input" value={f.description} onChange={e => set('description', e.target.value)} /></Field>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Save" />
    </ModalShell>
  );
}

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
