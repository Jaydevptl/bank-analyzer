import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Trash2, AlertCircle, Undo2, ArrowLeft } from 'lucide-react';
import {
  finoListSaleReturns, finoCreateSaleReturn, finoGetSaleReturn,
  finoCancelSaleReturn, finoSaleReturnsSummary,
  finoListInvoices, finoGetInvoice, finoListBanks, finoListParties,
} from '../../services/api';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

export default function SaleReturnsPage() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([finoListSaleReturns(), finoSaleReturnsSummary()]);
      setRows(l.data.returns || []);
      setSummary(s.data);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  if (selected) return <ReturnDetail id={selected} onBack={() => { setSelected(null); reload(); }} onAct={setModal} reload={reload} modal={modal} setModal={setModal} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Sale Returns</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'new' })}><Plus size={13} /> New Return</button>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Total Returns" value={summary.count} />
          <SummaryCard label="All-time Value" value={fmtINR(summary.totalReturns)} fg="var(--accent)" />
          <SummaryCard label="This Month" value={fmtINR(summary.totalThisMonth)} fg="#f59e0b" />
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No sale returns yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>#</th>
                <th style={{ padding: '8px 10px' }}>Date</th>
                <th style={{ padding: '8px 10px' }}>Customer</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Subtotal</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>GST</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Grand</th>
                <th style={{ padding: '8px 10px' }}>Refund Mode</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setSelected(r.id)}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                    <Undo2 size={11} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--text-muted)' }} />
                    {r.return_number}
                  </td>
                  <td style={{ padding: '8px 10px' }}>{r.return_date}</td>
                  <td style={{ padding: '8px 10px' }}>{r.customer?.name || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtINR(r.subtotal)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtINR(r.total_gst)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtINR(r.grand_total)}</td>
                  <td style={{ padding: '8px 10px' }}>{r.refund_mode}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                      background: r.status === 'refunded' || r.status === 'confirmed' ? 'rgba(34,197,94,0.15)' : r.status === 'cancelled' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      color: r.status === 'refunded' || r.status === 'confirmed' ? '#22c55e' : r.status === 'cancelled' ? '#ef4444' : '#f59e0b',
                    }}>{r.status}</span>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                    <RowMenu items={[
                      { label: 'View', onClick: () => setSelected(r.id) },
                      { label: 'Cancel', icon: <Trash2 size={12} />, danger: true,
                        disabled: r.status === 'cancelled',
                        onClick: () => setModal({ kind: 'cancel', row: r }) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal?.kind === 'new' && <NewReturnModal onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'cancel' && (
        <DeleteConfirmModal title={`Cancel ${modal.row.return_number}`}
          description="Reverses ledger entries, removes restored stock, and refreshes bank balance."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoCancelSaleReturn(modal.row.id, reason); reload(); }} />
      )}
    </div>
  );
}

function ReturnDetail({ id, onBack }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    finoGetSaleReturn(id).then(r => setData(r.data)).catch(() => {});
  }, [id]);
  if (!data) return <div className="spinner" />;
  const { return: r, items } = data;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={14} /> Back</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, flex: 1 }}>
          <Undo2 size={18} style={{ marginRight: 8, verticalAlign: 'middle', color: 'var(--text-muted)' }} />
          {r.return_number}
        </h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
        <SummaryCard label="Date" value={r.return_date} />
        <SummaryCard label="Customer" value={r.customer?.name || '—'} />
        <SummaryCard label="Subtotal" value={fmtINR(r.subtotal)} />
        <SummaryCard label="GST" value={fmtINR(r.total_gst)} />
        <SummaryCard label="Grand Total" value={fmtINR(r.grand_total)} fg="var(--accent)" />
        <SummaryCard label="Refund Amount" value={fmtINR(r.refund_amount)} fg="#22c55e" />
        <SummaryCard label="Refund Mode" value={r.refund_mode} />
        <SummaryCard label="Status" value={r.status} />
      </div>
      {r.reason && <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 14 }}>Reason: <b>{r.reason}</b></div>}

      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
              <th style={{ padding: '6px 10px' }}>Item</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Qty</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Rate</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Line Total</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>GST</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Grand</th>
            </tr>
          </thead>
          <tbody>
            {items.map(li => (
              <tr key={li.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 10px' }}>{li.item?.name || li.item_id}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{li.quantity}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtINR(li.rate)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtINR(li.line_total)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtINR(li.gst_amount)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtINR(li.line_grand_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewReturnModal({ onClose, onSaved }) {
  const [invoices, setInvoices] = useState([]);
  const [parties, setParties] = useState([]);
  const [banks, setBanks] = useState([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [invoiceDetail, setInvoiceDetail] = useState(null);
  const [customerId, setCustomerId] = useState('');
  const [reason, setReason] = useState('');
  const [returnDate, setReturnDate] = useState(today());
  const [refundMode, setRefundMode] = useState('credit_note');
  const [refundViaAccountId, setRefundViaAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([]); // [{ originalInvoiceItemId, itemId, name, quantity, rate, gstRate }]
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    finoListInvoices().then(r => setInvoices(r.data.invoices || [])).catch(() => setInvoices([]));
    finoListParties({ role: 'customer' }).then(r => setParties(r.data.parties || [])).catch(() => setParties([]));
    finoListBanks().then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : [])).catch(() => setBanks([]));
  }, []);

  // Load invoice detail → seed lines from its items
  useEffect(() => {
    if (!invoiceId) { setInvoiceDetail(null); setLines([]); return; }
    finoGetInvoice(invoiceId).then(r => {
      setInvoiceDetail(r.data);
      const inv = r.data?.invoice;
      if (inv?.customer_party_id) setCustomerId(inv.customer_party_id);
      const newLines = (r.data?.items || []).map(it => ({
        originalInvoiceItemId: it.id,
        itemId: it.item_id,
        name: it.item?.name || it.description || '',
        quantity: '',  // user enters how many being returned
        rate: it.rate,
        gstRate: it.gst_rate || 0,
      }));
      setLines(newLines);
    }).catch(() => {});
  }, [invoiceId]);

  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  const totalGst = lines.reduce((s, l) => s + ((Number(l.quantity) || 0) * (Number(l.rate) || 0)) * (Number(l.gstRate) || 0) / 100, 0);
  const grand = subtotal + totalGst;

  const setLine = (i, k, v) => setLines(rows => rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r));

  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!customerId) throw new Error('Customer required');
      const items = lines
        .filter(l => Number(l.quantity) > 0 && l.itemId)
        .map(l => ({
          originalInvoiceItemId: l.originalInvoiceItemId || null,
          itemId: l.itemId,
          quantity: Number(l.quantity),
          rate: Number(l.rate) || 0,
          gstRate: Number(l.gstRate) || 0,
        }));
      if (items.length === 0) throw new Error('Enter quantity for at least one line');
      if (refundMode === 'bank' && !refundViaAccountId) throw new Error('Refund bank account required');
      await finoCreateSaleReturn({
        returnDate,
        originalInvoiceId: invoiceId || null,
        customerPartyId: customerId,
        reason: reason || undefined,
        refundMode,
        refundViaAccountId: refundMode === 'bank' ? refundViaAccountId : null,
        notes: notes || undefined,
        items,
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title="New Sale Return" onClose={onClose} maxWidth={760}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Original Invoice (optional)">
          <select className="input" value={invoiceId} onChange={e => setInvoiceId(e.target.value)} style={{ width: '100%' }}>
            <option value="">— None (manual return) —</option>
            {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number} · {fmtINR(i.grand_total)} · {i.invoice_date}</option>)}
          </select>
        </Field>
        <Field label="Return Date"><input className="input" type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} /></Field>
      </div>
      <Field label="Customer">
        <select className="input" value={customerId} onChange={e => setCustomerId(e.target.value)} style={{ width: '100%' }}>
          <option value="">— Select —</option>
          {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Reason"><input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Damaged / wrong item / etc." /></Field>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Line Items</div>
        {lines.length === 0 ? (
          <div style={{ background: 'var(--bg-page)', padding: 14, borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            Pick an original invoice above to load its items. Manual returns: paste itemId rows.
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Item</th>
                <th style={{ textAlign: 'right', padding: '4px 6px', width: 80 }}>Qty</th>
                <th style={{ textAlign: 'right', padding: '4px 6px', width: 100 }}>Rate</th>
                <th style={{ textAlign: 'right', padding: '4px 6px', width: 70 }}>GST %</th>
                <th style={{ textAlign: 'right', padding: '4px 6px' }}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ padding: '4px 6px' }}>{l.name}</td>
                  <td style={{ padding: '4px 6px' }}><input className="input" type="number" step="0.01" value={l.quantity} onChange={e => setLine(i, 'quantity', e.target.value)} style={{ textAlign: 'right' }} /></td>
                  <td style={{ padding: '4px 6px' }}><input className="input" type="number" step="0.01" value={l.rate} onChange={e => setLine(i, 'rate', e.target.value)} style={{ textAlign: 'right' }} /></td>
                  <td style={{ padding: '4px 6px' }}><input className="input" type="number" step="0.01" value={l.gstRate} onChange={e => setLine(i, 'gstRate', e.target.value)} style={{ textAlign: 'right' }} /></td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700 }}>
                    {fmtINR((Number(l.quantity) || 0) * (Number(l.rate) || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
        Subtotal <b>{fmtINR(subtotal)}</b> + GST <b>{fmtINR(totalGst)}</b> = Grand <b style={{ color: 'var(--accent)' }}>{fmtINR(grand)}</b>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Refund Mode">
          <select className="input" value={refundMode} onChange={e => setRefundMode(e.target.value)}>
            <option value="credit_note">Credit Note (carry forward)</option>
            <option value="adjustment">Adjustment</option>
            <option value="bank">Bank Refund</option>
            <option value="cash">Cash Refund</option>
          </select>
        </Field>
        {refundMode === 'bank' && (
          <Field label="Refund From Bank">
            <select className="input" value={refundViaAccountId} onChange={e => setRefundViaAccountId(e.target.value)} style={{ width: '100%' }}>
              <option value="">— Select —</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
            </select>
          </Field>
        )}
      </div>

      <Field label="Notes"><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Create Return" />
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
  return <div style={{ marginBottom: 10, flex: 1 }}>
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
