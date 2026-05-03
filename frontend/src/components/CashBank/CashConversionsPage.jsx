import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, X, RefreshCw, AlertCircle, Check, Clock, FileText } from 'lucide-react';
import {
  finoListConversions, finoGetConversion, finoCreateConversion,
  finoUpdateConversion, finoCancelConversion,
  finoNextConversionNumber, finoConversionSummary,
  finoMarkCashReceived, finoMarkGstReceived,
  finoListParties, finoListBanks,
} from '../../services/api';
import EditModal from '../shared/EditModal';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';

const fmt   = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_FILTERS = [
  { id: 'all',             label: 'All' },
  { id: 'active',          label: 'Active' },
  { id: 'completed',       label: 'Completed' },
  { id: 'pending_cash',    label: 'Pending Cash' },
  { id: 'pending_invoice', label: 'Pending Invoice' },
];

const STATUS_COLORS = {
  active:    { bg: 'rgba(59,130,246,0.15)',  fg: '#3b82f6' },
  completed: { bg: 'rgba(34,197,94,0.15)',   fg: '#22c55e' },
  cancelled: { bg: 'rgba(239,68,68,0.15)',   fg: '#ef4444' },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.active;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: c.bg, color: c.fg, textTransform: 'uppercase' }}>
      {status}
    </span>
  );
}

function FlowChip({ label, state }) {
  // state: 'received' | 'pending' | 'not_applicable'
  const palette = state === 'received'
    ? { bg: 'rgba(34,197,94,0.12)', fg: '#22c55e', icon: <Check size={10} /> }
    : state === 'not_applicable'
    ? { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8', icon: <span style={{ fontSize: 9 }}>—</span> }
    : { bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b', icon: <Clock size={10} /> };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: palette.bg, color: palette.fg }}>
      {palette.icon} {label}
    </span>
  );
}

export default function CashConversionsPage() {
  const [conversions, setConversions] = useState([]);
  const [summary, setSummary]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState('all');
  const [selectedId, setSelected]     = useState(null);
  const [detail, setDetail]           = useState(null);
  const [modal, setModal]             = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, sum] = await Promise.all([finoListConversions(), finoConversionSummary()]);
      setConversions(list.data.conversions || []);
      setSummary(sum.data.summary || null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    finoGetConversion(selectedId).then(r => setDetail(r.data)).catch(() => setDetail(null));
  }, [selectedId]);

  const reloadDetail = async () => {
    if (!selectedId) return;
    const r = await finoGetConversion(selectedId);
    setDetail(r.data);
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return conversions;
    if (filter === 'pending_cash') return conversions.filter(c => c.cash_status === 'pending' && c.status !== 'cancelled');
    if (filter === 'pending_invoice') return conversions.filter(c => c.gst_invoice_status === 'pending' && c.status !== 'cancelled');
    return conversions.filter(c => c.status === filter);
  }, [conversions, filter]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Cash Conversions</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'new' })}>
          <Plus size={13} /> New Conversion
        </button>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Total Conversions" value={summary.total_conversions} />
          <SummaryCard label="Total Converted" value={fmt(summary.total_converted)} />
          <SummaryCard label="Commission" value={fmt(summary.total_commission)} fg="#f97316" />
          <SummaryCard label="GST Claimed" value={fmt(summary.total_gst_claimed)} fg="#22c55e" />
          <SummaryCard label={`⏳ Pending Cash`} value={summary.pending_cash_count} fg="#f59e0b" />
          <SummaryCard label={`⏳ Pending Invoice`} value={summary.pending_invoice_count} fg="#f59e0b" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {STATUS_FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: '5px 10px', border: 'none', cursor: 'pointer',
            borderRadius: 14, fontSize: 11, fontWeight: filter === f.id ? 700 : 500,
            background: filter === f.id ? 'var(--accent)' : 'var(--bg-surface)',
            color: filter === f.id ? '#1A1A2E' : 'var(--text-secondary)',
          }}>{f.label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', maxHeight: '70vh', overflowY: 'auto' }}>
          {loading ? <div className="spinner" style={{ margin: '40px auto' }} />
            : filtered.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No conversions.</div>
            ) : filtered.map(c => (
              <div key={c.id} onClick={() => setSelected(c.id)} style={{
                padding: 12, borderBottom: '1px solid var(--border)', cursor: 'pointer',
                background: selectedId === c.id ? 'var(--bg-hover)' : 'transparent',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{c.conversion_number}</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(c.bank_amount)}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                  <div>{c.vendor?.name || '—'}</div>
                  <div>{c.conversion_date}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <StatusBadge status={c.status} />
                  <div style={{ display: 'flex', gap: 4 }}>
                    <FlowChip label="Cash" state={c.cash_status} />
                    <FlowChip label="Bill" state={c.gst_invoice_status} />
                  </div>
                </div>
              </div>
            ))}
        </div>

        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 18, minHeight: 300 }}>
          {!detail ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 40, textAlign: 'center' }}>
              <RefreshCw size={32} style={{ opacity: 0.4, margin: '0 auto 8px', display: 'block' }} />
              Select a conversion to view details.
            </div>
          ) : (
            <ConversionDetail
              detail={detail}
              onAction={(action) => setModal({ kind: action, conversion: detail.conversion })}
            />
          )}
        </div>
      </div>

      {modal?.kind === 'new' && (
        <NewConversionModal onClose={() => setModal(null)} onSaved={async (id) => {
          setModal(null); await reload(); if (id) setSelected(id);
        }} />
      )}
      {modal?.kind === 'cash' && (
        <MarkCashReceivedModal conversion={modal.conversion} onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await Promise.all([reload(), reloadDetail()]); }} />
      )}
      {modal?.kind === 'gst' && (
        <MarkGstReceivedModal conversion={modal.conversion} onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await Promise.all([reload(), reloadDetail()]); }} />
      )}
      {modal?.kind === 'edit' && (
        <EditModal title={`Edit ${modal.conversion.conversion_number}`}
          fields={[{ key: 'notes', label: 'Notes', type: 'textarea' }]}
          initialValues={{ notes: modal.conversion.notes || '' }}
          onClose={() => setModal(null)}
          onSubmit={async (patch) => {
            await finoUpdateConversion(modal.conversion.id, patch);
            await Promise.all([reload(), reloadDetail()]);
          }}
        />
      )}
      {modal?.kind === 'cancel' && (
        <DeleteConfirmModal
          title={`Cancel ${modal.conversion.conversion_number}`}
          description="This will reverse the main ledger group (bank, cash, commission) and the GST input ledger group if applicable. Bank balance restored."
          warning="If cash was already used elsewhere or GST already filed, you will need to handle those separately."
          confirmLabel="Cancel Conversion"
          onClose={() => setModal(null)}
          onConfirm={async (reason) => {
            await finoCancelConversion(modal.conversion.id, reason);
            await Promise.all([reload(), reloadDetail()]);
            setSelected(null);
          }}
        />
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

function Row({ label, value, fg, bold, big }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <div style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ color: fg || 'var(--text-primary)', fontWeight: bold ? 700 : 500, fontSize: big ? 15 : 12 }}>{value}</div>
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

// ─── Detail ──────────────────────────────────────────────────────────────────

function ConversionDetail({ detail, onAction }) {
  const { conversion: c, ledger } = detail;
  const isCancelled = c.status === 'cancelled' || c.is_deleted;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{c.conversion_number}</h2>
            <StatusBadge status={c.status} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong>{c.vendor?.name}</strong>
            {c.vendor?.gstin && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>GSTIN: {c.vendor.gstin}</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {c.conversion_date} · {c.bank?.account_name} ({c.bank?.bank_name})
          </div>
        </div>
        {!isCancelled && (
          <div style={{ display: 'flex', gap: 6 }}>
            {c.cash_status !== 'received' && (
              <button className="btn btn-primary btn-sm" onClick={() => onAction('cash')}>Mark Cash Received</button>
            )}
            {c.gst_invoice_status !== 'received' && (
              <button className="btn btn-sm" onClick={() => onAction('gst')}>Mark Invoice Received</button>
            )}
            <button className="btn btn-sm" onClick={() => onAction('edit')}>Edit</button>
            <button className="btn btn-sm" style={{ color: '#ef4444' }} onClick={() => onAction('cancel')}>Cancel</button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={{ background: 'var(--bg-page)', padding: 12, borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Cash Flow</div>
          <Row label="Bank Withdrawal" value={fmt(c.bank_amount)} bold big />
          <Row label={`Commission (${c.commission_pct}%)`} value={`− ${fmt(c.commission_amount)}`} fg="#f97316" />
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
            <Row label="Cash Receivable" value={fmt(c.cash_received)} bold fg="#22c55e" />
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <FlowChip label={c.cash_status === 'received' ? `Cash received ${c.cash_received_date}` : 'Cash pending'} state={c.cash_status} />
          </div>
        </div>

        <div style={{ background: 'var(--bg-page)', padding: 12, borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>GST Invoice</div>
          {c.gst_invoice_status === 'received' ? (
            <>
              <Row label="Invoice #" value={c.gst_invoice_number || '—'} />
              <Row label="Invoice Amount" value={fmt(c.gst_invoice_amount)} />
              <Row label={`GST @ ${c.gst_rate}%`} value={fmt(c.gst_amount)} bold fg="#22c55e" />
              <Row label="Received" value={c.gst_invoice_received_date} />
            </>
          ) : (
            <div style={{ padding: 8, color: 'var(--text-muted)', textAlign: 'center' }}>
              <FileText size={20} style={{ opacity: 0.4, margin: '0 auto 6px', display: 'block' }} />
              No invoice received yet.
            </div>
          )}
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <FlowChip label={c.gst_invoice_status === 'received' ? 'Invoice received' : 'Invoice pending'} state={c.gst_invoice_status} />
          </div>
        </div>
      </div>

      {ledger?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Ledger Entries</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                  <th style={{ padding: '6px 10px' }}>Account</th>
                  <th style={{ padding: '6px 10px' }}>Description</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Debit</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(le => (
                  <tr key={le.id} style={{ borderTop: '1px solid var(--border)', textDecoration: le.is_reversed ? 'line-through' : 'none', opacity: le.is_reversed ? 0.5 : 1 }}>
                    <td style={{ padding: '6px 10px' }}>{le.account?.code} · {le.account?.name}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{le.description}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{le.direction === 'debit' ? fmt(le.amount) : ''}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{le.direction === 'credit' ? fmt(le.amount) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {c.notes && (
        <div style={{ marginTop: 14, padding: 10, background: 'var(--bg-page)', borderRadius: 6, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Notes</div>
          {c.notes}
        </div>
      )}
    </div>
  );
}

// ─── New Conversion Modal ────────────────────────────────────────────────────

function NewConversionModal({ onClose, onSaved }) {
  const [number, setNumber]       = useState('');
  const [date, setDate]           = useState(today());
  const [vendors, setVendors]     = useState([]);
  const [banks, setBanks]         = useState([]);
  const [vendorId, setVendorId]   = useState('');
  const [bankId, setBankId]       = useState('');
  const [bankAmount, setBankAmt]  = useState(0);
  const [commPct, setCommPct]     = useState(0);
  const [notes, setNotes]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState(null);

  useEffect(() => {
    finoNextConversionNumber()
      .then(r => setNumber(r.data.conversion_number))
      .catch(e => console.error('[conv] next-number failed:', e));

    finoListParties({ role: 'conversion_vendor' })
      .then(r => setVendors(Array.isArray(r.data?.parties) ? r.data.parties : []))
      .catch(e => { console.error('[conv] vendors failed:', e); setVendors([]); });

    finoListBanks()
      .then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : Array.isArray(r.data?.banks) ? r.data.banks : []))
      .catch(e => { console.error('[conv] banks failed:', e); setBanks([]); });
  }, []);

  // Auto-fill commission % from vendor's default
  useEffect(() => {
    if (!vendorId) return;
    const v = vendors.find(p => p.id === vendorId);
    if (v && v.default_conversion_pct != null) setCommPct(Number(v.default_conversion_pct));
  }, [vendorId, vendors]);

  const commission = useMemo(() => Math.round(((Number(bankAmount) || 0) * (Number(commPct) || 0) / 100) * 100) / 100, [bankAmount, commPct]);
  const cashReceivable = useMemo(() => Math.round(((Number(bankAmount) || 0) - commission) * 100) / 100, [bankAmount, commission]);

  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!vendorId) throw new Error('Vendor required');
      if (!bankId)   throw new Error('Bank required');
      if (!(Number(bankAmount) > 0)) throw new Error('Bank amount must be > 0');
      const r = await finoCreateConversion({
        conversionNumber: number || undefined,
        conversionDate: date,
        vendorPartyId: vendorId,
        bankAccountId: bankId,
        bankAmount: Number(bankAmount),
        commissionPct: Number(commPct) || 0,
        notes: notes || undefined,
      });
      onSaved(r.data?.conversion?.id);
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 540, maxHeight: '92vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>New Cash Conversion</h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Conversion Number">
            <input className="input" value={number} onChange={e => setNumber(e.target.value)} />
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Vendor"
          hint={vendors.length === 0 ? 'No vendors found. Add a party with the "Conversion Vendor" role on the Parties page.' : null}>
          <select className="input" value={vendorId} onChange={e => setVendorId(e.target.value)} style={{ width: '100%' }}>
            <option value="">— Select vendor —</option>
            {vendors.map(v => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.default_conversion_pct != null ? ` (default ${v.default_conversion_pct}%)` : ''}
                {v.reliability_score != null ? ` ★${v.reliability_score}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Bank Account"
          hint={banks.length === 0 ? 'No bank accounts. Add one on the Bank Accounts page first.' : null}>
          <select className="input" value={bankId} onChange={e => setBankId(e.target.value)} style={{ width: '100%' }}>
            <option value="">— Select bank —</option>
            {banks.map(b => (
              <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name}) · Bal {fmt(b.current_balance || 0)}</option>
            ))}
          </select>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Bank Amount (₹)">
            <input className="input" type="number" min={0} step={0.01} value={bankAmount} onChange={e => setBankAmt(e.target.value)} />
          </Field>
          <Field label="Commission %">
            <input className="input" type="number" min={0} max={100} step={0.01} value={commPct} onChange={e => setCommPct(e.target.value)} />
          </Field>
        </div>

        <div style={{ background: 'var(--bg-page)', padding: 12, borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
          <Row label="Bank Withdrawal" value={fmt(bankAmount)} />
          <Row label="Commission" value={`− ${fmt(commission)}`} fg="#f97316" />
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
            <Row label="Cash Receivable" value={fmt(cashReceivable)} bold big fg="#22c55e" />
          </div>
        </div>

        <Field label="Notes">
          <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>

        {err && (
          <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
            <AlertCircle size={14} /> {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mark Cash Received ──────────────────────────────────────────────────────

function MarkCashReceivedModal({ conversion, onClose, onSaved }) {
  const [date, setDate]   = useState(today());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]     = useState(null);

  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      await finoMarkCashReceived(conversion.id, { receivedDate: date, notes: notes || undefined });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Mark Cash Received · {conversion.conversion_number}</h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
          <Row label="Cash Receivable" value={fmt(conversion.cash_received)} bold fg="#22c55e" />
        </div>
        <Field label="Received Date">
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
        <Field label="Notes (optional)">
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
        {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginTop: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mark GST Invoice Received ───────────────────────────────────────────────

function MarkGstReceivedModal({ conversion, onClose, onSaved }) {
  const [date, setDate]       = useState(today());
  const [invNum, setInvNum]   = useState('');
  const [invAmt, setInvAmt]   = useState(conversion.bank_amount);
  const [rate, setRate]       = useState(18);
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState(null);

  const gstAmount = useMemo(() => Math.round(((Number(invAmt) || 0) * (Number(rate) || 0) / 100) * 100) / 100, [invAmt, rate]);

  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!(Number(invAmt) > 0)) throw new Error('Invoice amount must be > 0');
      await finoMarkGstReceived(conversion.id, {
        receivedDate: date,
        invoiceNumber: invNum || undefined,
        invoiceAmount: Number(invAmt),
        gstRate: Number(rate),
        notes: notes || undefined,
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Mark GST Invoice Received · {conversion.conversion_number}</h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Received Date">
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
          <Field label="Invoice Number">
            <input className="input" value={invNum} onChange={e => setInvNum(e.target.value)} />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Invoice Amount (₹)">
            <input className="input" type="number" min={0} step={0.01} value={invAmt} onChange={e => setInvAmt(e.target.value)} />
          </Field>
          <Field label="GST Rate (%)">
            <input className="input" type="number" min={0} max={100} step={0.01} value={rate} onChange={e => setRate(e.target.value)} />
          </Field>
        </div>

        <div style={{ background: 'rgba(34,197,94,0.08)', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 12, border: '1px solid rgba(34,197,94,0.2)' }}>
          <Row label="GST Input Credit will be created" value={fmt(gstAmount)} bold fg="#22c55e" />
        </div>

        <Field label="Notes (optional)">
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>

        {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginTop: 8 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm & Create GST Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
