import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Search, Users, Pencil, Trash2 } from 'lucide-react';
import {
  finoListParties, finoCreateParty, finoUpdateParty, finoDeleteParty,
  finoGetParty, finoPartyLedger, finoPartySummary,
} from '../../services/api';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const ROLES = [
  { id: 'all',               label: 'All',              flag: null },
  { id: 'customer',          label: 'Customers',        flag: 'is_customer' },
  { id: 'supplier',          label: 'Suppliers',        flag: 'is_supplier' },
  { id: 'conversion_vendor', label: 'Conv. Vendors',    flag: 'is_conversion_vendor' },
  { id: 'hawala_agent',      label: 'Hawala Agents',    flag: 'is_hawala_agent' },
  { id: 'borrower',          label: 'Borrowers',        flag: 'is_borrower' },
  { id: 'partner',           label: 'Partners',         flag: 'is_partner' },
  { id: 'employee',          label: 'Employees',        flag: 'is_employee' },
  { id: 'card_holder',       label: 'Card Holders',     flag: 'is_card_holder' },
];

function rolesOf(p) {
  return ROLES.filter(r => r.flag && p[r.flag]).map(r => r.label.replace('s', '').replace('Card Holder', 'Card Holder'));
}

export default function PartiesPage() {
  const [role, setRole]       = useState('all');
  const [search, setSearch]   = useState('');
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId]     = useState(null);
  const [detail, setDetail]   = useState(null);
  const [ledger, setLedger]   = useState({ entries: [] });
  const [summary, setSummary] = useState(null);
  const [modal, setModal]     = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await finoListParties({ role, search: search || undefined });
      setParties(data.parties || []);
      if (!selId && data.parties?.length) setSelId(data.parties[0].id);
    } finally { setLoading(false); }
  }, [role, search, selId]);

  const loadDetail = useCallback(async (id) => {
    if (!id) { setDetail(null); setLedger({ entries: [] }); setSummary(null); return; }
    const [d, l, s] = await Promise.all([
      finoGetParty(id), finoPartyLedger(id, { limit: 100 }), finoPartySummary(id),
    ]);
    setDetail(d.data.party);
    setLedger(l.data);
    setSummary(s.data.summary);
  }, []);

  useEffect(() => { reload(); }, [role]);
  useEffect(() => { const t = setTimeout(() => reload(), 250); return () => clearTimeout(t); }, [search]);
  useEffect(() => { loadDetail(selId); }, [selId, loadDetail]);

  const onSaved = () => { setModal(null); reload(); loadDetail(selId); };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Parties</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'new' })}>
          <Plus size={13} /> Add Party
        </button>
      </div>

      {/* Role chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {ROLES.map(r => (
          <button key={r.id} onClick={() => setRole(r.id)} style={{
            padding: '6px 12px', border: 'none', cursor: 'pointer',
            borderRadius: 16, fontSize: 12, fontWeight: role === r.id ? 700 : 500,
            background: role === r.id ? 'var(--accent)' : 'var(--bg-surface)',
            color: role === r.id ? '#1A1A2E' : 'var(--text-secondary)',
          }}>{r.label}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 12, maxWidth: 360 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input className="input" placeholder="Search by name, phone, GSTIN, PAN..."
          value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
      </div>

      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 320px)' }}>
        <aside style={{ width: 320, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
            {parties.length} parties
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? <div className="spinner" style={{ margin: '40px auto' }} /> : parties.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No parties.</div>
            ) : parties.map(p => {
              const active = selId === p.id;
              const bal = Number(p.current_balance || 0);
              const balColor = bal > 0 ? 'var(--success)' : bal < 0 ? 'var(--danger)' : 'var(--text-muted)';
              const roles = rolesOf(p).join(', ') || '—';
              return (
                <button key={p.id} onClick={() => setSelId(p.id)} style={{
                  width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
                  background: active ? 'var(--bg-hover)' : 'transparent',
                  borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                  textAlign: 'left', borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: balColor }}>{fmt(bal)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{roles}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <section style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!detail ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
              {parties.length === 0 ? 'Add a party to begin.' : 'Select a party.'}
            </div>
          ) : (
            <PartyDetail party={detail} ledger={ledger} summary={summary} onAct={(action) => setModal(action)} />
          )}
        </section>
      </div>

      {modal?.kind === 'new'    && <PartyModal onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'edit'   && detail && <PartyModal party={detail} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'delete' && detail && (
        <DeleteConfirmModal title={`Delete ${detail.name}`}
          description="Reverses opening balance ledger entry (if any). Blocks if active loans/cards exist."
          confirmLabel="Delete"
          onClose={() => setModal(null)}
          onConfirm={(reason) => finoDeleteParty(detail.id, reason).then(() => { setSelId(null); onSaved(); })}
        />
      )}
    </div>
  );
}

function PartyDetail({ party, ledger, summary, onAct }) {
  const bal = Number(party.current_balance || 0);
  const balColor = bal > 0 ? 'var(--success)' : bal < 0 ? 'var(--danger)' : 'var(--text-muted)';
  const roles = rolesOf(party);
  return (
    <>
      <div style={{ padding: 18, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={18} />
              {party.name}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {[party.contact_phone, party.contact_email, party.gstin && `GSTIN: ${party.gstin}`, party.pan && `PAN: ${party.pan}`].filter(Boolean).join(' · ') || '—'}
            </div>
            {party.address && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{party.address}</div>}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Roles: <b>{roles.join(', ') || 'none'}</b>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 22 }}>
              <Stat label="Current Balance" value={fmt(bal)} highlight color={balColor} />
              <Stat label="Last Txn" value={party.last_txn_date || '—'} small />
              <Stat label="Reliability" value={party.reliability_score ? `${'★'.repeat(party.reliability_score)}${'☆'.repeat(5 - party.reliability_score)}` : '—'} small />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => onAct({ kind: 'edit' })}><Pencil size={13} /></button>
            <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => onAct({ kind: 'delete' })} style={{ color: 'var(--danger)' }}><Trash2 size={13} /></button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {summary && (
          <>
            <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 18 }}>
              <Mini label="Loans" value={`${summary.loans_count} loans`} />
              <Mini label="Disbursed" value={fmt(summary.loans_disbursed)} />
              <Mini label="Repaid" value={fmt(summary.loans_repaid)} color="var(--success)" />
              <Mini label="Loan Outstanding" value={fmt(summary.loans_outstanding)} color="var(--warning)" />
              <Mini label="Credit Cards" value={summary.cards_count} />
              <Mini label="Other Received" value={fmt(summary.other_received)} color="var(--success)" />
              <Mini label="Other Paid" value={fmt(summary.other_paid)} color="var(--danger)" />
            </div>
          </>
        )}

        <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Ledger ({ledger.total || ledger.entries.length})</h3>
        {ledger.entries.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No ledger entries.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Date</th>
                <th style={{ padding: '6px 8px' }}>Module</th>
                <th style={{ padding: '6px 8px' }}>Description</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Debit</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Credit</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.entries.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)', opacity: r.is_reversed ? 0.5 : 1 }}>
                  <td style={{ padding: 8 }}>{r.txn_date}</td>
                  <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 10 }}>{r.source_module || '—'}</td>
                  <td style={{ padding: 8 }}>{r.description || '—'}</td>
                  <td style={{ padding: 8, textAlign: 'right', color: 'var(--success)' }}>{r.direction === 'debit' ? fmt(r.amount) : ''}</td>
                  <td style={{ padding: 8, textAlign: 'right', color: 'var(--danger)' }}>{r.direction === 'credit' ? fmt(r.amount) : ''}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{fmt(r.running_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, highlight, small, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: small ? 13 : (highlight ? 18 : 14), fontWeight: highlight ? 800 : 600, color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}
function Mini({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg-page)', padding: 8, borderRadius: 8 }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

// ─── Party modal (create/edit) ───────────────────────────────────────────────
function PartyModal({ party, onClose, onSaved }) {
  const isEdit = !!party;
  const hasTxn = isEdit && (Number(party.current_balance || 0) !== 0 || party.last_txn_date);

  const [f, setF] = useState({
    name: party?.name || '',
    contactPhone: party?.contact_phone || '',
    contactEmail: party?.contact_email || '',
    gstin: party?.gstin || '',
    pan: party?.pan || '',
    address: party?.address || '',
    isCustomer:           party?.is_customer || false,
    isSupplier:           party?.is_supplier || false,
    isConversionVendor:   party?.is_conversion_vendor || false,
    isHawalaAgent:        party?.is_hawala_agent || false,
    isBorrower:           party?.is_borrower || false,
    isPartner:            party?.is_partner || false,
    isEmployee:           party?.is_employee || false,
    isCardHolder:         party?.is_card_holder || false,
    defaultConversionPct: party?.default_conversion_pct ?? '',
    defaultInrUsdRate:    party?.default_inr_usd_rate ?? '',
    reliabilityScore:     party?.reliability_score ?? '',
    openingBalance:       party?.opening_balance ?? 0,
    openingBalanceDate:   party?.opening_balance_date || today(),
    notes:                party?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null);
    if (!f.name.trim()) return setErr('Name required');
    setSaving(true);
    try {
      const payload = {
        ...f,
        defaultConversionPct: f.defaultConversionPct === '' ? null : Number(f.defaultConversionPct),
        defaultInrUsdRate:    f.defaultInrUsdRate === '' ? null : Number(f.defaultInrUsdRate),
        reliabilityScore:     f.reliabilityScore === '' ? null : Number(f.reliabilityScore),
        openingBalance:       Number(f.openingBalance) || 0,
      };
      if (isEdit) {
        // Strip opening fields (locked)
        delete payload.openingBalance;
        delete payload.openingBalanceDate;
        await finoUpdateParty(party.id, payload);
      } else {
        await finoCreateParty(payload);
      }
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <Modal title={isEdit ? `Edit ${party.name}` : 'Add Party'} onClose={onClose} width={560}>
      <Field label="Name *"><input className="input" autoFocus value={f.name} onChange={e => set('name', e.target.value)} /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Phone"><input className="input" value={f.contactPhone} onChange={e => set('contactPhone', e.target.value)} /></Field>
        <Field label="Email"><input className="input" value={f.contactEmail} onChange={e => set('contactEmail', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="GSTIN"><input className="input" value={f.gstin} onChange={e => set('gstin', e.target.value.toUpperCase())} /></Field>
        <Field label="PAN"><input className="input" value={f.pan} onChange={e => set('pan', e.target.value.toUpperCase())} /></Field>
      </div>
      <Field label="Address"><textarea className="input" rows={2} value={f.address} onChange={e => set('address', e.target.value)} /></Field>

      <Field label="Roles">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {ROLES.filter(r => r.flag).map(r => {
            const key = {
              is_customer: 'isCustomer', is_supplier: 'isSupplier',
              is_conversion_vendor: 'isConversionVendor', is_hawala_agent: 'isHawalaAgent',
              is_borrower: 'isBorrower', is_partner: 'isPartner',
              is_employee: 'isEmployee', is_card_holder: 'isCardHolder',
            }[r.flag];
            return (
              <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input type="checkbox" checked={f[key]} onChange={e => set(key, e.target.checked)} />
                {r.label}
              </label>
            );
          })}
        </div>
      </Field>
      {f.isConversionVendor && (
        <Field label="Default Conversion %"><input className="input" type="number" step="0.01" value={f.defaultConversionPct} onChange={e => set('defaultConversionPct', e.target.value)} /></Field>
      )}
      {f.isHawalaAgent && (
        <Field label="Default INR/USD Rate"><input className="input" type="number" step="0.0001" value={f.defaultInrUsdRate} onChange={e => set('defaultInrUsdRate', e.target.value)} /></Field>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Reliability (1-5)"><input className="input" type="number" min="1" max="5" value={f.reliabilityScore} onChange={e => set('reliabilityScore', e.target.value)} /></Field>
        {!isEdit && (
          <>
            <Field label="Opening Balance (₹)"><input className="input" type="number" step="0.01" value={f.openingBalance} onChange={e => set('openingBalance', e.target.value)} placeholder="+ they owe / − I owe" /></Field>
            <Field label="As of"><input className="input" type="date" value={f.openingBalanceDate} onChange={e => set('openingBalanceDate', e.target.value)} /></Field>
          </>
        )}
      </div>
      {isEdit && hasTxn && (
        <div style={{ background: 'rgba(245,158,11,0.10)', padding: 8, borderRadius: 6, fontSize: 11, color: 'var(--warning)', marginBottom: 8 }}>
          Opening balance is locked because this party has transactions.
        </div>
      )}
      <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : (isEdit ? 'Save' : 'Add Party')}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 22, width: '100%', maxWidth: width, maxHeight: '90vh', overflow: 'auto' }}>
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
