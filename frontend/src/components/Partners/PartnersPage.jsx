import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Trash2, AlertCircle, Handshake, ArrowLeft, Users, Wallet, Check } from 'lucide-react';
import {
  finoListPartnerships, finoCreatePartnership, finoDeletePartnership,
  finoGetPartnership, finoAddMember, finoRemoveMember,
  finoCreateDistribution, finoGetDistribution, finoPayDistribution, finoCancelDistribution,
  finoPartnersDashboard,
  finoListBanks, finoListParties,
} from '../../services/api';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

export default function PartnersPage() {
  const [list, setList] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [l, d] = await Promise.all([finoListPartnerships(), finoPartnersDashboard()]);
      setList(l.data.partnerships || []);
      setDashboard(d.data);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  if (selected) return <PartnershipDetail id={selected} onBack={() => { setSelected(null); reload(); }} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Partnerships</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'newPartnership' })}><Plus size={13} /> New Partnership</button>
      </div>

      {dashboard && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Partnerships" value={dashboard.partnershipCount} />
          <SummaryCard label="Total Capital" value={fmtINR(dashboard.totalCapital)} fg="var(--accent)" />
          <SummaryCard label="Total Distributed" value={fmtINR(dashboard.totalDistributed)} fg="#22c55e" />
          <SummaryCard label="Pending Distributions" value={dashboard.pendingDistributions} fg={dashboard.pendingDistributions > 0 ? '#f59e0b' : 'var(--text-muted)'} />
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible' }}>
        {list.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No partnerships yet. Create one to start tracking partner shares.
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>Name</th>
                <th style={{ padding: '8px 10px' }}>Period</th>
                <th style={{ padding: '8px 10px' }}>Deduct Expenses</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {list.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setSelected(p.id)}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                    <Handshake size={12} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--text-muted)' }} />
                    {p.name}
                  </td>
                  <td style={{ padding: '8px 10px' }}>{p.distribution_period}</td>
                  <td style={{ padding: '8px 10px' }}>{p.deduct_expenses ? 'Yes' : 'No'}</td>
                  <td style={{ padding: '8px 10px' }}>{p.is_active ? 'Active' : 'Inactive'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                    <RowMenu items={[
                      { label: 'Delete', icon: <Trash2 size={12} />, danger: true,
                        onClick: () => setModal({ kind: 'deletePartnership', row: p }) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal?.kind === 'newPartnership' && <NewPartnershipModal onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'deletePartnership' && (
        <DeleteConfirmModal title={`Delete ${modal.row.name}`}
          description="Reverses every paid distribution and soft-deletes members + history."
          warning="This action cannot be undone from the UI."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoDeletePartnership(modal.row.id, reason); reload(); }} />
      )}
    </div>
  );
}

function PartnershipDetail({ id, onBack }) {
  const [data, setData] = useState(null);
  const [modal, setModal] = useState(null);
  const reload = useCallback(async () => {
    try { const r = await finoGetPartnership(id); setData(r.data); }
    catch (e) { console.error(e); }
  }, [id]);
  useEffect(() => { reload(); }, [reload]);

  if (!data) return <div className="spinner" />;
  const { partnership: p, members, distributions, totalCapital, totalDistributed } = data;
  const totalPctShare = members.filter(m => m.share_type === 'percentage' && m.is_active).reduce((s, m) => s + Number(m.share_value || 0), 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={14} /> Back</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, flex: 1 }}>
          <Handshake size={18} style={{ marginRight: 8, verticalAlign: 'middle', color: 'var(--text-muted)' }} />
          {p.name}
        </h1>
        <button className="btn btn-sm" onClick={() => setModal({ kind: 'addMember' })}><Users size={13} /> Add Member</button>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'distribute' })}><Wallet size={13} /> New Distribution</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
        <SummaryCard label="Members"           value={members.length} />
        <SummaryCard label="Total Capital"     value={fmtINR(totalCapital)} fg="var(--accent)" />
        <SummaryCard label="Total Distributed" value={fmtINR(totalDistributed)} fg="#22c55e" />
        <SummaryCard label="% Allocated"       value={`${totalPctShare}%`} fg={totalPctShare > 100 ? '#ef4444' : 'var(--text-primary)'} />
        <SummaryCard label="Period"            value={p.distribution_period} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
          Members ({members.length})
        </div>
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible' }}>
          {members.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No members. Add one to start.</div>
          ) : (
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                  <th style={{ padding: '6px 10px' }}>Name</th>
                  <th style={{ padding: '6px 10px' }}>Role</th>
                  <th style={{ padding: '6px 10px' }}>Share</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Capital</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Distributed</th>
                  <th style={{ padding: '6px 10px', width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 700 }}>{m.party?.name || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>{m.role}</td>
                    <td style={{ padding: '6px 10px' }}>
                      {m.share_type === 'percentage' ? `${m.share_value}%` : fmtINR(m.share_value)}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtINR(m.capital_contributed)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#22c55e' }}>{fmtINR(m.total_distributed)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                      <RowMenu items={[
                        { label: 'Remove', icon: <Trash2 size={12} />, danger: true,
                          onClick: () => setModal({ kind: 'removeMember', row: m }) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
          Distributions ({distributions.length})
        </div>
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible' }}>
          {distributions.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No distributions yet.</div>
          ) : (
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                  <th style={{ padding: '6px 10px' }}>Period</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Gross</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Expenses</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Net</th>
                  <th style={{ padding: '6px 10px' }}>Status</th>
                  <th style={{ padding: '6px 10px', width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {distributions.map(d => (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setModal({ kind: 'distDetail', row: d })}>
                    <td style={{ padding: '6px 10px', fontWeight: 700 }}>{d.period_label}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtINR(d.gross_profit)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtINR(d.total_expenses)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: Number(d.net_distributable) >= 0 ? '#22c55e' : '#ef4444' }}>
                      {fmtINR(d.net_distributable)}
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                        background: d.status === 'distributed' ? 'rgba(34,197,94,0.15)' : d.status === 'cancelled' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                        color: d.status === 'distributed' ? '#22c55e' : d.status === 'cancelled' ? '#ef4444' : '#f59e0b',
                      }}>{d.status}</span>
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <RowMenu items={[
                        { label: 'View', onClick: () => setModal({ kind: 'distDetail', row: d }) },
                        { label: 'Cancel', icon: <Trash2 size={12} />, danger: true, disabled: d.status === 'cancelled',
                          onClick: () => setModal({ kind: 'cancelDist', row: d }) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal?.kind === 'addMember' && (
        <AddMemberModal partnershipId={id} existingPctSum={totalPctShare}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}
      {modal?.kind === 'removeMember' && (
        <DeleteConfirmModal title={`Remove ${modal.row.party?.name}`}
          description="Soft-deletes the member from the partnership. Past distributions are kept."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoRemoveMember(modal.row.id, reason); reload(); }} />
      )}
      {modal?.kind === 'distribute' && (
        <DistributeModal partnershipId={id} members={members}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}
      {modal?.kind === 'distDetail' && (
        <DistributionDetailModal distId={modal.row.id}
          onClose={() => setModal(null)} onChanged={reload} />
      )}
      {modal?.kind === 'cancelDist' && (
        <DeleteConfirmModal title="Cancel Distribution"
          description="Reverses all ledger entries and rolls back partner totals."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoCancelDistribution(modal.row.id, reason); reload(); }} />
      )}
    </div>
  );
}

function NewPartnershipModal({ onClose, onSaved }) {
  const [f, setF] = useState({ name: '', distributionPeriod: 'monthly', deductExpenses: true, notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.name.trim()) throw new Error('Name required');
      await finoCreatePartnership(f);
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title="New Partnership" onClose={onClose}>
      <Field label="Name"><input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Dropy Partnership" /></Field>
      <Field label="Distribution Period">
        <select className="input" value={f.distributionPeriod} onChange={e => set('distributionPeriod', e.target.value)}>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="yearly">Yearly</option>
          <option value="per_txn">Per Transaction</option>
        </select>
      </Field>
      <Field label="Net Profit Calculation">
        <select className="input" value={f.deductExpenses ? 'yes' : 'no'} onChange={e => set('deductExpenses', e.target.value === 'yes')}>
          <option value="yes">Deduct expenses from gross profit</option>
          <option value="no">Distribute gross profit as-is</option>
        </select>
      </Field>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Create" />
    </ModalShell>
  );
}

function AddMemberModal({ partnershipId, existingPctSum, onClose, onSaved }) {
  const [parties, setParties] = useState([]);
  const [partyId, setPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [f, setF] = useState({ role: 'capital', shareType: 'percentage', shareValue: '', capitalContributed: '', notes: '' });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { finoListParties().then(r => setParties(r.data.parties || [])).catch(() => setParties([])); }, []);

  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!partyId && !partyName.trim()) throw new Error('Pick or name a partner');
      if (!(Number(f.shareValue) > 0)) throw new Error('Share value > 0');
      await finoAddMember(partnershipId, {
        partyId: partyId || undefined,
        partyName: partyId ? undefined : partyName.trim(),
        role: f.role,
        shareType: f.shareType,
        shareValue: Number(f.shareValue),
        capitalContributed: Number(f.capitalContributed) || 0,
        notes: f.notes,
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title="Add Member" onClose={onClose}>
      <Field label="Partner"
        hint={existingPctSum > 0 ? `Existing percentage allocation: ${existingPctSum}%` : null}>
        <select className="input" value={partyId} onChange={e => setPartyId(e.target.value)} style={{ width: '100%' }}>
          <option value="">— Pick existing party —</option>
          {parties.map(p => <option key={p.id} value={p.id}>{p.name}{p.is_partner ? ' ★' : ''}</option>)}
        </select>
        {!partyId && (
          <input className="input" style={{ marginTop: 6 }} value={partyName} onChange={e => setPartyName(e.target.value)} placeholder="…or type a new partner name" />
        )}
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Role">
          <select className="input" value={f.role} onChange={e => set('role', e.target.value)}>
            <option value="capital">Capital</option>
            <option value="working">Working</option>
            <option value="both">Both</option>
          </select>
        </Field>
        <Field label="Share Type">
          <select className="input" value={f.shareType} onChange={e => set('shareType', e.target.value)}>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed Amount</option>
          </select>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label={f.shareType === 'percentage' ? 'Share %' : 'Fixed ₹'}>
          <input className="input" type="number" step="0.01" value={f.shareValue} onChange={e => set('shareValue', e.target.value)} />
        </Field>
        <Field label="Capital Contributed (₹)">
          <input className="input" type="number" step="0.01" value={f.capitalContributed} onChange={e => set('capitalContributed', e.target.value)} />
        </Field>
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Add Member" />
    </ModalShell>
  );
}

function DistributeModal({ partnershipId, members, onClose, onSaved }) {
  // Default to current month range
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastOfMonth  = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const monthLabel   = today.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const [f, setF] = useState({
    periodLabel: monthLabel, periodFrom: firstOfMonth, periodTo: lastOfMonth,
    grossProfit: '', totalExpenses: '', notes: '',
    labelManuallyEdited: false,
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  // Auto-recompute label when from/to change (unless user has manually edited it)
  const setDate = (k, v) => setF(s => {
    const next = { ...s, [k]: v };
    if (!s.labelManuallyEdited && next.periodFrom && next.periodTo) {
      const from = new Date(next.periodFrom);
      const to   = new Date(next.periodTo);
      if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
        next.periodLabel = from.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      } else {
        const f1 = from.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const t1 = to.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        next.periodLabel = `${f1} – ${t1}`;
      }
    }
    return next;
  });
  const setLabel = (v) => setF(s => ({ ...s, periodLabel: v, labelManuallyEdited: true }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  // Live preview using the same algorithm
  const gp = Number(f.grossProfit) || 0;
  const exp = Number(f.totalExpenses) || 0;
  const net = gp - exp; // assumes deduct_expenses=true; preview only
  const active = members.filter(m => m.is_active);
  const fixed = active.filter(m => m.share_type === 'fixed');
  const pct   = active.filter(m => m.share_type === 'percentage');
  let preview = [];
  if (net >= 0) {
    let remaining = net;
    for (const m of fixed) {
      const amt = Math.min(Number(m.share_value) || 0, Math.max(0, remaining));
      remaining -= amt;
      preview.push({ name: m.party?.name, amount: amt });
    }
    const pctSum = pct.reduce((s, m) => s + Number(m.share_value || 0), 0) || 1;
    for (const m of pct) preview.push({ name: m.party?.name, amount: remaining * (Number(m.share_value) || 0) / pctSum });
  } else {
    const pctSum = pct.reduce((s, m) => s + Number(m.share_value || 0), 0) || 1;
    for (const m of active) {
      if (m.share_type === 'fixed') preview.push({ name: m.party?.name, amount: 0 });
      else preview.push({ name: m.party?.name, amount: net * (Number(m.share_value) || 0) / pctSum });
    }
  }

  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.periodFrom)         throw new Error('Period From date required');
      if (!f.periodTo)           throw new Error('Period To date required');
      if (f.periodTo < f.periodFrom) throw new Error('Period To must be on/after Period From');
      if (!f.periodLabel.trim()) throw new Error('Period label required');
      if (Number.isNaN(Number(f.grossProfit))) throw new Error('Gross profit required');
      await finoCreateDistribution(partnershipId, {
        periodLabel: f.periodLabel.trim(),
        periodFrom: f.periodFrom,
        periodTo: f.periodTo,
        grossProfit: Number(f.grossProfit),
        totalExpenses: Number(f.totalExpenses) || 0,
        notes: f.notes,
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title="New Distribution" onClose={onClose} maxWidth={560}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Period From *"><input className="input" type="date" value={f.periodFrom} onChange={e => setDate('periodFrom', e.target.value)} required /></Field>
        <Field label="Period To *"><input className="input" type="date" value={f.periodTo} onChange={e => setDate('periodTo', e.target.value)} required /></Field>
      </div>
      <Field label="Period Label" hint="Auto-derived from dates; edit if needed">
        <input className="input" value={f.periodLabel} onChange={e => setLabel(e.target.value)} placeholder="Mar 2026" />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Gross Profit (₹)"><input className="input" type="number" step="0.01" value={f.grossProfit} onChange={e => set('grossProfit', e.target.value)} /></Field>
        <Field label="Total Expenses (₹)"><input className="input" type="number" step="0.01" value={f.totalExpenses} onChange={e => set('totalExpenses', e.target.value)} /></Field>
      </div>
      <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          Net Distributable: <b style={{ color: net >= 0 ? '#22c55e' : '#ef4444' }}>{fmtINR(net)}</b>
        </div>
        {preview.length > 0 && (
          <div style={{ fontSize: 12 }}>
            {preview.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span>{p.name}</span>
                <b style={{ color: p.amount >= 0 ? 'var(--text-primary)' : '#ef4444' }}>{fmtINR(p.amount)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Create Distribution" />
    </ModalShell>
  );
}

function DistributionDetailModal({ distId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [banks, setBanks] = useState([]);
  const [defBank, setDefBank] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const [d, b] = await Promise.all([finoGetDistribution(distId), finoListBanks()]);
      setData(d.data);
      setBanks(Array.isArray(b.data?.accounts) ? b.data.accounts : []);
    } catch (e) { setErr(e.message); }
  }, [distId]);
  useEffect(() => { load(); }, [load]);

  const pay = async () => {
    setErr(null); setSaving(true);
    try {
      if (!defBank) throw new Error('Pick a bank account to pay from');
      await finoPayDistribution(distId, { defaultBankAccountId: defBank });
      onChanged && onChanged();
      onClose();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  if (!data) return <ModalShell title="Loading…" onClose={onClose}><div className="spinner" /></ModalShell>;
  const { distribution: d, lines } = data;

  return (
    <ModalShell title={`Distribution · ${d.period_label}`} onClose={onClose} maxWidth={620}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
        <SummaryCard label="Gross"   value={fmtINR(d.gross_profit)} />
        <SummaryCard label="Expenses" value={fmtINR(d.total_expenses)} />
        <SummaryCard label="Net"     value={fmtINR(d.net_distributable)} fg={Number(d.net_distributable) >= 0 ? '#22c55e' : '#ef4444'} />
      </div>
      <div style={{ background: 'var(--bg-page)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
        <table style={{ width: '100%', fontSize: 12 }}>
          <thead><tr style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Member</th>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Share</th>
            <th style={{ textAlign: 'right', padding: '4px 6px' }}>Amount</th>
            <th style={{ padding: '4px 6px' }}>Paid</th>
          </tr></thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.id}>
                <td style={{ padding: '4px 6px', fontWeight: 600 }}>{l.party?.name}</td>
                <td style={{ padding: '4px 6px' }}>{l.share_type === 'percentage' ? `${l.share_value}%` : fmtINR(l.share_value)}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, color: Number(l.computed_amount) >= 0 ? '#22c55e' : '#ef4444' }}>
                  {fmtINR(l.computed_amount)}
                </td>
                <td style={{ padding: '4px 6px' }}>{l.is_paid ? <Check size={12} color="#22c55e" /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.status === 'draft' && (
        <Field label="Pay From (single bank for all members)">
          <select className="input" value={defBank} onChange={e => setDefBank(e.target.value)} style={{ width: '100%' }}>
            <option value="">— Select —</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
          </select>
        </Field>
      )}
      <ErrBox msg={err} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Close</button>
        {d.status === 'draft' && (
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={pay} disabled={saving}>
            {saving ? 'Processing…' : 'Mark Paid'}
          </button>
        )}
      </div>
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
