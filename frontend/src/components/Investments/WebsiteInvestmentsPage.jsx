import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Trash2, AlertCircle, Globe, ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import {
  finoListWebsites, finoCreateWebsite, finoDeleteWebsite,
  finoGetWebsiteSummary, finoListWebsiteTxns, finoCreateWebsiteTxn,
  finoDeleteWebsiteTxn, finoWebsiteDashboard,
  finoListBanks,
} from '../../services/api';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const TXN_TYPES = [
  { value: 'ad_spend',      label: 'Ad Spend',         kind: 'expense' },
  { value: 'hosting',       label: 'Hosting',          kind: 'expense' },
  { value: 'domain',        label: 'Domain',           kind: 'expense' },
  { value: 'development',   label: 'Development',      kind: 'expense' },
  { value: 'marketing',     label: 'Marketing',        kind: 'expense' },
  { value: 'other_expense', label: 'Other Expense',    kind: 'expense' },
  { value: 'revenue',       label: 'Revenue',          kind: 'income' },
  { value: 'refund',        label: 'Refund',           kind: 'income' },
  { value: 'other_income',  label: 'Other Income',     kind: 'income' },
];

export default function WebsiteInvestmentsPage() {
  const [websites, setWebsites] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [selected, setSelected] = useState(null); // website id or null
  const [modal, setModal] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [w, d] = await Promise.all([finoListWebsites(), finoWebsiteDashboard()]);
      setWebsites(w.data.websites || []);
      setDashboard(d.data);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const onSaved = () => { setModal(null); reload(); };

  if (selected) {
    return <WebsiteDetail websiteId={selected} onBack={() => { setSelected(null); reload(); }} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Website Investments</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'newWebsite' })}><Plus size={13} /> New Website</button>
      </div>

      {dashboard && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Websites"     value={dashboard.websiteCount} />
          <SummaryCard label="Total Spend"  value={fmtINR(dashboard.totalSpend)} fg="#ef4444" />
          <SummaryCard label="Total Revenue" value={fmtINR(dashboard.totalRevenue)} fg="#22c55e" />
          <SummaryCard label="Net Profit"   value={fmtINR(dashboard.totalProfit)} fg={dashboard.totalProfit >= 0 ? '#22c55e' : '#ef4444'} />
          <SummaryCard label="Overall ROI"  value={dashboard.overallRoi != null ? `${dashboard.overallRoi.toFixed(1)}%` : '—'} fg="var(--accent)" />
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible' }}>
        {websites.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No websites yet. Add your first website to start tracking ad spend & revenue.
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>Name</th>
                <th style={{ padding: '8px 10px' }}>URL</th>
                <th style={{ padding: '8px 10px' }}>Platform</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Spend</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Revenue</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Profit</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>ROI</th>
                <th style={{ padding: '8px 10px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {websites.map(w => {
                const stat = dashboard?.perWebsite?.find(x => x.id === w.id);
                return (
                  <tr key={w.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setSelected(w.id)}>
                    <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                      <Globe size={12} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--text-muted)' }} />
                      {w.name}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{w.url || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{w.platform || '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtINR(stat?.totalSpend || 0)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtINR(stat?.netRevenue || 0)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: (stat?.profit || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                      {fmtINR(stat?.profit || 0)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      {stat?.roi != null ? `${stat.roi.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <RowMenu items={[
                        { label: 'Delete', icon: <Trash2 size={12} />, danger: true,
                          onClick: () => setModal({ kind: 'deleteWebsite', row: w }) },
                      ]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal?.kind === 'newWebsite' && <NewWebsiteModal onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'deleteWebsite' && (
        <DeleteConfirmModal title={`Delete ${modal.row.name}`}
          description="Reverses every expense/revenue ledger entry tied to this website."
          warning="All transactions will be soft-deleted. This cannot be undone from the UI."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoDeleteWebsite(modal.row.id, reason); reload(); }} />
      )}
    </div>
  );
}

function WebsiteDetail({ websiteId, onBack }) {
  const [summary, setSummary] = useState(null);
  const [txns, setTxns] = useState([]);
  const [modal, setModal] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        finoGetWebsiteSummary(websiteId),
        finoListWebsiteTxns(websiteId),
      ]);
      setSummary(s.data);
      setTxns(t.data.transactions || []);
    } catch (e) { console.error(e); }
  }, [websiteId]);
  useEffect(() => { reload(); }, [reload]);

  if (!summary) return <div className="spinner" />;
  const w = summary.website;
  const monthly = summary.monthly || [];
  const maxBar = Math.max(1, ...monthly.map(m => Math.max(m.spend, m.revenue)));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={14} /> Back</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, flex: 1 }}>
          <Globe size={18} style={{ marginRight: 8, verticalAlign: 'middle', color: 'var(--text-muted)' }} />
          {w.name}
          {w.url && <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>{w.url}</span>}
        </h1>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'newTxn' })}><Plus size={13} /> Record Transaction</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
        <SummaryCard label="Total Spend"  value={fmtINR(summary.totalSpend)}  fg="#ef4444" />
        <SummaryCard label="Revenue"      value={fmtINR(summary.totalRevenue)} fg="#22c55e" />
        <SummaryCard label="Refunds"      value={fmtINR(summary.totalRefunds)} />
        <SummaryCard label="Other Income" value={fmtINR(summary.totalOtherIncome)} />
        <SummaryCard label="Net Profit"   value={fmtINR(summary.profit)} fg={summary.profit >= 0 ? '#22c55e' : '#ef4444'} />
        <SummaryCard label="ROI"          value={summary.roi != null ? `${summary.roi.toFixed(1)}%` : '—'} fg="var(--accent)" />
      </div>

      {monthly.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
            Monthly: Spend vs Revenue
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, paddingTop: 10 }}>
            {monthly.map(m => (
              <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 110, width: '100%', justifyContent: 'center' }}>
                  <div title={`Spend ${fmtINR(m.spend)}`} style={{ width: '40%', height: `${(m.spend / maxBar) * 100}%`, background: '#ef4444', borderRadius: '3px 3px 0 0', minHeight: m.spend > 0 ? 2 : 0 }} />
                  <div title={`Revenue ${fmtINR(m.revenue)}`} style={{ width: '40%', height: `${(Math.max(0, m.revenue) / maxBar) * 100}%`, background: '#22c55e', borderRadius: '3px 3px 0 0', minHeight: m.revenue > 0 ? 2 : 0 }} />
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{m.month}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-muted)', marginTop: 8, justifyContent: 'center' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#ef4444', borderRadius: 2, marginRight: 4 }} /> Spend</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#22c55e', borderRadius: 2, marginRight: 4 }} /> Revenue</span>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible' }}>
        {txns.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No transactions yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>Date</th>
                <th style={{ padding: '8px 10px' }}>Type</th>
                <th style={{ padding: '8px 10px' }}>Description</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '8px 10px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {txns.map(t => {
                const meta = TXN_TYPES.find(x => x.value === t.txn_type);
                const isExpense = meta?.kind === 'expense' || t.txn_type === 'refund';
                return (
                  <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px' }}>{t.txn_date}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                        background: isExpense ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                        color: isExpense ? '#ef4444' : '#22c55e',
                      }}>{meta?.label || t.txn_type}</span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>{t.description || '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: isExpense ? '#ef4444' : '#22c55e' }}>
                      {isExpense ? '−' : '+'}{fmtINR(t.amount)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <RowMenu items={[
                        { label: 'Delete', icon: <Trash2 size={12} />, danger: true, onClick: () => setModal({ kind: 'deleteTxn', row: t }) },
                      ]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal?.kind === 'newTxn' && (
        <NewTransactionModal websiteId={websiteId} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}
      {modal?.kind === 'deleteTxn' && (
        <DeleteConfirmModal title="Delete Transaction"
          description="Reverses the ledger entry."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoDeleteWebsiteTxn(modal.row.id, reason); reload(); }} />
      )}
    </div>
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

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function ErrBox({ msg }) {
  if (!msg) return null;
  return <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
    <AlertCircle size={14} /> {msg}
  </div>;
}

function NewWebsiteModal({ onClose, onSaved }) {
  const [f, setF] = useState({ name: '', url: '', platform: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.name.trim()) throw new Error('Name required');
      await finoCreateWebsite(f);
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title="New Website" onClose={onClose}>
      <Field label="Name"><input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="dropy.in" /></Field>
      <Field label="URL"><input className="input" value={f.url} onChange={e => set('url', e.target.value)} placeholder="https://dropy.in" /></Field>
      <Field label="Platform" hint="e.g. Shopify, WooCommerce, custom">
        <input className="input" value={f.platform} onChange={e => set('platform', e.target.value)} />
      </Field>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Create'}
        </button>
      </div>
    </ModalShell>
  );
}

function NewTransactionModal({ websiteId, onClose, onSaved }) {
  const [banks, setBanks] = useState([]);
  const [f, setF] = useState({ txnDate: today(), txnType: 'ad_spend', description: '', amount: '', paidViaAccountId: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    finoListBanks().then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : [])).catch(() => setBanks([]));
  }, []);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!(Number(f.amount) > 0)) throw new Error('Amount > 0');
      if (!f.paidViaAccountId)     throw new Error('Bank/cash account required');
      await finoCreateWebsiteTxn(websiteId, { ...f, amount: Number(f.amount) });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  const meta = TXN_TYPES.find(t => t.value === f.txnType);
  return (
    <ModalShell title="Record Transaction" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Date"><input className="input" type="date" value={f.txnDate} onChange={e => set('txnDate', e.target.value)} /></Field>
        <Field label="Type">
          <select className="input" value={f.txnType} onChange={e => set('txnType', e.target.value)}>
            <optgroup label="Expense">
              {TXN_TYPES.filter(t => t.kind === 'expense').map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </optgroup>
            <optgroup label="Income">
              {TXN_TYPES.filter(t => t.kind === 'income').map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </optgroup>
          </select>
        </Field>
      </div>
      <Field label="Description"><input className="input" value={f.description} onChange={e => set('description', e.target.value)} placeholder={meta?.kind === 'expense' ? 'Facebook Ads campaign' : 'Order #12345'} /></Field>
      <Field label="Amount (₹)"><input className="input" type="number" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
      <Field label={meta?.kind === 'expense' ? 'Paid From' : 'Received Into'}>
        <select className="input" value={f.paidViaAccountId} onChange={e => set('paidViaAccountId', e.target.value)} style={{ width: '100%' }}>
          <option value="">— Select —</option>
          {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
        </select>
      </Field>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Record'}
        </button>
      </div>
    </ModalShell>
  );
}
