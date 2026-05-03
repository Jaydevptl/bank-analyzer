import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, X, Trash2, FileText, AlertCircle } from 'lucide-react';
import {
  finoListInvoices, finoGetInvoice, finoCreateInvoice, finoUpdateInvoice,
  finoCancelInvoice, finoNextInvoiceNumber, finoInvoiceSummary,
  finoRecordPayment, finoDeletePayment,
  finoListParties, finoListItems,
  finoListBanks,
} from '../../services/api';
import EditModal from '../shared/EditModal';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmt   = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtN  = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_FILTERS = [
  { id: 'all',             label: 'All' },
  { id: 'confirmed',       label: 'Confirmed' },
  { id: 'partially_paid',  label: 'Partially Paid' },
  { id: 'paid',            label: 'Paid' },
  { id: 'overdue',         label: 'Overdue' },
  { id: 'draft',           label: 'Draft' },
];

const STATUS_COLORS = {
  draft:           { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
  confirmed:       { bg: 'rgba(59,130,246,0.15)',  fg: '#3b82f6' },
  partially_paid:  { bg: 'rgba(249,115,22,0.15)',  fg: '#f97316' },
  paid:            { bg: 'rgba(34,197,94,0.15)',   fg: '#22c55e' },
  cancelled:       { bg: 'rgba(239,68,68,0.15)',   fg: '#ef4444' },
};

function StatusBadge({ status, overdue }) {
  if (overdue) return (
    <span style={{
      padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
      background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid #ef4444',
    }}>OVERDUE</span>
  );
  const c = STATUS_COLORS[status] || STATUS_COLORS.confirmed;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: c.bg, color: c.fg, textTransform: 'uppercase' }}>
      {status?.replace('_', ' ')}
    </span>
  );
}

export default function SaleInvoicesPage() {
  const [invoices, setInvoices]   = useState([]);
  const [summary, setSummary]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('all');
  const [search, setSearch]       = useState('');
  const [selectedId, setSelected] = useState(null);
  const [detail, setDetail]       = useState(null);
  const [modal, setModal]         = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, sum] = await Promise.all([finoListInvoices(), finoInvoiceSummary()]);
      setInvoices(inv.data.invoices || []);
      setSummary(sum.data.summary || null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    finoGetInvoice(selectedId).then(r => setDetail(r.data)).catch(() => setDetail(null));
  }, [selectedId]);

  const reloadDetail = async () => {
    if (!selectedId) return;
    const r = await finoGetInvoice(selectedId);
    setDetail(r.data);
  };

  const filtered = useMemo(() => {
    const t = today();
    let list = invoices;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(i =>
        i.invoice_number?.toLowerCase().includes(s) ||
        i.customer?.name?.toLowerCase().includes(s)
      );
    }
    if (filter === 'all') return list;
    if (filter === 'overdue') return list.filter(i => i.due_date && i.due_date < t && Number(i.balance_due) > 0 && !['cancelled','deleted'].includes(i.status));
    return list.filter(i => i.status === filter);
  }, [invoices, search, filter]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Sale Invoices</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'new' })}>
          <Plus size={13} /> New Invoice
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Total Invoices" value={summary.total_invoices} />
          <SummaryCard label="Revenue" value={fmt(summary.total_revenue)} />
          <SummaryCard label="Collected" value={fmt(summary.total_collected)} fg="#22c55e" />
          <SummaryCard label="Outstanding" value={fmt(summary.total_outstanding)} fg="#f97316" />
          <SummaryCard label={`Overdue (${summary.overdue_count})`} value={fmt(summary.overdue_amount)} fg="#ef4444" />
          <SummaryCard label="This Month" value={fmt(summary.this_month?.revenue || 0)} sub={`${summary.this_month?.invoices || 0} invoices`} />
        </div>
      )}

      {/* Filter chips */}
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

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 12, maxWidth: 360 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input className="input" placeholder="Search invoice number or customer name…"
          value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
      </div>

      {/* List + detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 14, alignItems: 'start' }}>
        {/* List */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', maxHeight: '70vh', overflowY: 'auto' }}>
          {loading ? <div className="spinner" style={{ margin: '40px auto' }} />
            : filtered.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No invoices.</div>
            ) : filtered.map(inv => {
              const isOverdue = inv.due_date && inv.due_date < today() && Number(inv.balance_due) > 0 && !['cancelled','deleted'].includes(inv.status);
              return (
                <div key={inv.id} onClick={() => setSelected(inv.id)} style={{
                  padding: 12, borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  background: selectedId === inv.id ? 'var(--bg-hover)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{inv.invoice_number}</div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(inv.grand_total)}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                    <div>{inv.customer?.name || '—'}</div>
                    <div>{inv.invoice_date}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <StatusBadge status={inv.status} overdue={isOverdue} />
                    {Number(inv.balance_due) > 0 ? (
                      <span style={{ fontSize: 11, color: '#ef4444' }}>Due: {fmt(inv.balance_due)}</span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#22c55e' }}>Paid ✓</span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Detail */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 18, minHeight: 300 }}>
          {!detail ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 40, textAlign: 'center' }}>
              <FileText size={32} style={{ opacity: 0.4, margin: '0 auto 8px', display: 'block' }} />
              Select an invoice to view details.
            </div>
          ) : (
            <InvoiceDetail
              detail={detail}
              onAction={(action) => setModal({ kind: action, invoice: detail.invoice })}
              onDeletePayment={async (pid) => {
                if (!confirm('Delete this payment? This will reverse the ledger entry.')) return;
                await finoDeletePayment(pid);
                await Promise.all([reload(), reloadDetail()]);
              }}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {modal?.kind === 'new' && (
        <NewInvoiceModal onClose={() => setModal(null)} onSaved={async (newId) => {
          setModal(null); await reload(); if (newId) setSelected(newId);
        }} />
      )}
      {modal?.kind === 'payment' && (
        <PaymentModal invoice={modal.invoice} onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await Promise.all([reload(), reloadDetail()]); }} />
      )}
      {modal?.kind === 'edit' && (
        <EditModal title={`Edit ${modal.invoice.invoice_number}`}
          fields={[
            { key: 'dueDate', label: 'Due Date', type: 'date' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
            { key: 'termsAndConditions', label: 'Terms & Conditions', type: 'textarea' },
          ]}
          initialValues={{
            dueDate: modal.invoice.due_date || '',
            notes: modal.invoice.notes || '',
            termsAndConditions: modal.invoice.terms_and_conditions || '',
          }}
          onClose={() => setModal(null)}
          onSubmit={async (patch) => {
            await finoUpdateInvoice(modal.invoice.id, patch);
            await Promise.all([reload(), reloadDetail()]);
          }}
        />
      )}
      {modal?.kind === 'cancel' && (
        <DeleteConfirmModal
          title={`Cancel ${modal.invoice.invoice_number}`}
          description="This will reverse all ledger entries (revenue, COGS, payments) and restore stock for product line items."
          warning="The invoice will be marked cancelled and hidden by default. Audit trail is preserved via reversal entries."
          confirmLabel="Cancel Invoice"
          onClose={() => setModal(null)}
          onConfirm={async (reason) => {
            await finoCancelInvoice(modal.invoice.id, reason);
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

// ─── Invoice Detail ──────────────────────────────────────────────────────────

function InvoiceDetail({ detail, onAction, onDeletePayment }) {
  const { invoice, items, payments } = detail;
  const isCancelled = invoice.status === 'cancelled' || invoice.is_deleted;
  const isOverdue = invoice.due_date && invoice.due_date < today() && Number(invoice.balance_due) > 0 && !isCancelled;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{invoice.invoice_number}</h2>
            <StatusBadge status={invoice.status} overdue={isOverdue} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong>{invoice.customer?.name}</strong>
            {invoice.customer?.gstin && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>GSTIN: {invoice.customer.gstin}</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Date: {invoice.invoice_date}
            {invoice.due_date && <> · Due: {invoice.due_date}</>}
          </div>
        </div>
        {!isCancelled && (
          <div style={{ display: 'flex', gap: 6 }}>
            {Number(invoice.balance_due) > 0 && (
              <button className="btn btn-primary btn-sm" onClick={() => onAction('payment')}>
                Receive Payment
              </button>
            )}
            <button className="btn btn-sm" onClick={() => onAction('edit')}>Edit</button>
            <button className="btn btn-sm" style={{ color: '#ef4444' }} onClick={() => onAction('cancel')}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Line items */}
      <div style={{ marginTop: 14, marginBottom: 14, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
              <th style={{ padding: '8px 10px' }}>Item</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Qty</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>GST</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map(li => (
              <tr key={li.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 10px' }}>
                  <div style={{ fontWeight: 600 }}>{li.description || li.item?.name}</div>
                  {li.item?.hsn_sac_code && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>HSN: {li.item.hsn_sac_code}</div>}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtN(li.quantity)} {li.unit || ''}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(li.rate)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  {Number(li.gst_rate) > 0 ? <>{li.gst_rate}% · {fmt(li.gst_amount)}</> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmt(li.line_grand_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <div style={{ minWidth: 280, fontSize: 12 }}>
          <Row label="Subtotal" value={fmt(invoice.subtotal)} />
          <Row label="Total GST" value={fmt(invoice.total_gst)} />
          {Number(invoice.discount_amount) > 0 && <Row label="Discount" value={`− ${fmt(invoice.discount_amount)}`} fg="#f97316" />}
          {Number(invoice.round_off) !== 0 && <Row label="Round Off" value={fmt(invoice.round_off)} />}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
            <Row label="Grand Total" value={fmt(invoice.grand_total)} bold big />
            <Row label="Paid" value={fmt(invoice.amount_paid)} fg="#22c55e" />
            <Row label="Balance Due" value={fmt(invoice.balance_due)} bold fg={Number(invoice.balance_due) > 0 ? '#ef4444' : '#22c55e'} />
          </div>
        </div>
      </div>

      {/* Payments */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
          Payments ({payments.length})
        </div>
        {payments.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12, background: 'var(--bg-page)', borderRadius: 6, textAlign: 'center' }}>
            No payments recorded yet.
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                  <th style={{ padding: '8px 10px' }}>Date</th>
                  <th style={{ padding: '8px 10px' }}>Mode</th>
                  <th style={{ padding: '8px 10px' }}>Reference</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '8px 10px', width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px' }}>{p.payment_date}</td>
                    <td style={{ padding: '8px 10px', textTransform: 'capitalize' }}>{p.payment_mode}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{p.reference_number || '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#22c55e' }}>{fmt(p.amount)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {!isCancelled && (
                        <RowMenu items={[{
                          label: 'Delete', icon: <Trash2 size={12} />, danger: true,
                          onClick: () => onDeletePayment(p.id),
                        }]} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {invoice.notes && (
        <div style={{ marginTop: 14, padding: 10, background: 'var(--bg-page)', borderRadius: 6, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Notes</div>
          {invoice.notes}
        </div>
      )}
      {invoice.terms_and_conditions && (
        <div style={{ marginTop: 8, padding: 10, background: 'var(--bg-page)', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Terms & Conditions</div>
          {invoice.terms_and_conditions}
        </div>
      )}
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

// ─── New Invoice Modal ───────────────────────────────────────────────────────

function NewInvoiceModal({ onClose, onSaved }) {
  const [number, setNumber]       = useState('');
  const [invoiceDate, setIDate]   = useState(today());
  const [dueDate, setDueDate]     = useState('');
  const [parties, setParties]     = useState([]);
  const [allItems, setAllItems]   = useState([]);
  const [banks, setBanks]         = useState([]);
  const [customerQ, setCustomerQ] = useState('');
  const [customerId, setCustId]   = useState(null);
  const [lines, setLines]         = useState([{ ...emptyLine() }]);
  const [discount, setDiscount]   = useState(0);
  const [roundOff, setRoundOff]   = useState(0);
  const [notes, setNotes]         = useState('');
  const [terms, setTerms]         = useState('');
  const [withPayment, setWP]      = useState(false);
  const [payMode, setPayMode]     = useState('bank');
  const [payVia, setPayVia]       = useState('');
  const [payRef, setPayRef]       = useState('');
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState(null);

  const [itemsLoading, setItemsLoading] = useState(true);

  useEffect(() => {
    // Fetch each independently so one failure doesn't blank everything.
    finoNextInvoiceNumber()
      .then(r => setNumber(r.data.invoice_number))
      .catch(e => console.error('[invoice] next-number failed:', e));

    finoListParties({ role: 'customer' })
      .then(r => setParties(Array.isArray(r.data?.parties) ? r.data.parties : []))
      .catch(e => { console.error('[invoice] parties failed:', e); setParties([]); });

    setItemsLoading(true);
    finoListItems()
      .then(r => {
        const list = Array.isArray(r.data?.items) ? r.data.items : [];
        console.log('[invoice] items loaded:', list.length, list.slice(0, 3));
        setAllItems(list);
      })
      .catch(e => { console.error('[invoice] items failed:', e); setAllItems([]); })
      .finally(() => setItemsLoading(false));

    finoListBanks()
      .then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : Array.isArray(r.data?.banks) ? r.data.banks : Array.isArray(r.data) ? r.data : []))
      .catch(e => { console.error('[invoice] banks failed:', e); setBanks([]); });
  }, []);

  const customerMatches = useMemo(() => {
    if (!customerQ.trim()) return parties.slice(0, 5);
    const s = customerQ.toLowerCase();
    return parties.filter(p => p.name?.toLowerCase().includes(s)).slice(0, 8);
  }, [parties, customerQ]);

  const totals = useMemo(() => {
    let sub = 0, gst = 0;
    for (const l of lines) {
      const lt = (Number(l.quantity) || 0) * (Number(l.rate) || 0);
      const ga = lt * (Number(l.gstRate) || 0) / 100;
      sub += lt; gst += ga;
    }
    sub = Math.round(sub * 100) / 100;
    gst = Math.round(gst * 100) / 100;
    const grand = Math.round((sub + gst - Number(discount || 0) + Number(roundOff || 0)) * 100) / 100;
    return { subtotal: sub, total_gst: gst, grand_total: grand };
  }, [lines, discount, roundOff]);

  const updateLine = (i, patch) => setLines(s => s.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const removeLine = (i) => setLines(s => s.filter((_, idx) => idx !== i));
  const addLine    = () => setLines(s => [...s, emptyLine()]);

  const onItemPick = (i, item) => {
    updateLine(i, {
      itemId: item.id,
      itemName: item.name,
      unit: item.unit || '',
      rate: Number(item.default_sale_price || 0),
      gstRate: Number(item.gst_rate || 0),
      costPrice: Number(item.default_purchase_price || 0),
      type: item.type,
      stockAvailable: Number(item.current_stock_qty || 0),
      query: '',
      focused: false,
    });
  };

  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!customerId && !customerQ.trim()) throw new Error('Customer required');

      // Validate the same array the UI renders from.
      if (!lines || lines.length === 0) throw new Error('Add at least one line item');
      const missingItem = lines.findIndex(l => !l.itemId);
      if (missingItem !== -1) throw new Error(`Pick an item for line ${missingItem + 1} (or remove that row)`);
      const badQty = lines.findIndex(l => !(Number(l.quantity) > 0));
      if (badQty !== -1) throw new Error(`Quantity must be > 0 for line ${badQty + 1}`);

      const payload = {
        invoiceNumber: number || undefined,
        invoiceDate,
        dueDate: dueDate || undefined,
        customerPartyId: customerId || undefined,
        customerName: customerId ? undefined : customerQ.trim(),
        notes: notes || undefined,
        termsAndConditions: terms || undefined,
        discountAmount: Number(discount) || 0,
        roundOff: Number(roundOff) || 0,
        items: lines.map(l => ({
          itemId: l.itemId,
          description: l.description || undefined,
          quantity: Number(l.quantity),
          unit: l.unit || undefined,
          rate: Number(l.rate),
          gstRate: Number(l.gstRate) || 0,
        })),
      };

      if (withPayment && Number(totals.grand_total) > 0) {
        payload.paymentOnCreation = {
          paymentDate: invoiceDate,
          amount: totals.grand_total,
          paymentMode: payMode,
          paidViaAccountId: payMode === 'cash' ? null : payVia || null,
          referenceNumber: payRef || undefined,
        };
        if (payMode !== 'cash' && !payVia) throw new Error('Select bank for payment');
      }

      const r = await finoCreateInvoice(payload);
      onSaved(r.data?.invoice?.id);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 880, maxHeight: '92vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>New Sale Invoice</h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          <Field label="Invoice Number">
            <input className="input" value={number} onChange={e => setNumber(e.target.value)} />
          </Field>
          <Field label="Invoice Date">
            <input className="input" type="date" value={invoiceDate} onChange={e => setIDate(e.target.value)} />
          </Field>
          <Field label="Due Date (optional)">
            <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </Field>
        </div>

        {/* Customer typeahead */}
        <Field label="Customer">
          <div style={{ position: 'relative' }}>
            <input className="input" placeholder="Search or type new customer name…"
              value={customerId ? (parties.find(p => p.id === customerId)?.name || customerQ) : customerQ}
              onChange={e => { setCustId(null); setCustomerQ(e.target.value); }}
            />
            {!customerId && customerMatches.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, marginTop: 2, zIndex: 5, maxHeight: 160, overflowY: 'auto' }}>
                {customerMatches.map(p => (
                  <div key={p.id} onClick={() => { setCustId(p.id); setCustomerQ(p.name); }}
                    style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    {p.name}
                    {p.gstin && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>GSTIN: {p.gstin}</span>}
                  </div>
                ))}
                {customerQ && !parties.some(p => p.name?.toLowerCase() === customerQ.toLowerCase()) && (
                  <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--accent)', borderTop: '1px solid var(--border)' }}>
                    + Will create new customer "{customerQ}"
                  </div>
                )}
              </div>
            )}
          </div>
        </Field>

        {/* Line items */}
        <div style={{ marginTop: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Line Items</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'visible' }}>
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                  <th style={{ padding: '6px 8px', width: '32%' }}>Item</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Rate</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>GST%</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '6px 8px', width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const lt = (Number(l.quantity) || 0) * (Number(l.rate) || 0);
                  const ga = lt * (Number(l.gstRate) || 0) / 100;
                  const total = lt + ga;
                  const q = (l.query || '').toLowerCase();
                  const matches = q
                    ? allItems.filter(it =>
                        it.name?.toLowerCase().includes(q) ||
                        it.sku?.toLowerCase().includes(q) ||
                        it.hsn_sac_code?.toLowerCase().includes(q)
                      ).slice(0, 8)
                    : allItems.slice(0, 8); // show first 8 on focus
                  return (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                      <td style={{ padding: '6px 8px' }}>
                        {l.itemId ? (
                          <div>
                            <div style={{ fontWeight: 600 }}>{l.itemName}</div>
                            {l.type === 'product' && (
                              <div style={{ fontSize: 10, color: l.stockAvailable < (Number(l.quantity) || 0) ? '#ef4444' : 'var(--text-muted)' }}>
                                Stock: {fmtN(l.stockAvailable)}
                              </div>
                            )}
                            <button className="btn btn-ghost btn-xs" style={{ padding: 0, fontSize: 10, marginTop: 2 }}
                              onClick={() => updateLine(i, { itemId: null, itemName: '', query: '' })}>Change</button>
                          </div>
                        ) : (
                          <div style={{ position: 'relative' }}>
                            <input className="input" placeholder="Search item by name / SKU / HSN…"
                              value={l.query || ''}
                              onFocus={() => updateLine(i, { focused: true })}
                              onBlur={() => setTimeout(() => updateLine(i, { focused: false }), 150)}
                              onChange={e => updateLine(i, { query: e.target.value, focused: true })} />
                            {l.focused && (
                              <div style={{
                                position: 'absolute', top: '100%', left: 0, right: 0,
                                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                borderRadius: 6, marginTop: 2, zIndex: 50,
                                maxHeight: 240, overflowY: 'auto',
                                boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
                              }}>
                                {itemsLoading ? (
                                  <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Loading items…</div>
                                ) : allItems.length === 0 ? (
                                  <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                                    No items in database. Add items via the Items page first.
                                  </div>
                                ) : matches.length === 0 ? (
                                  <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                                    No items match "{l.query}".
                                  </div>
                                ) : matches.map(it => (
                                  <div key={it.id}
                                    onMouseDown={(e) => { e.preventDefault(); onItemPick(i, it); }}
                                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                    <div style={{ fontWeight: 600 }}>{it.name}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                      {it.sku ? `SKU: ${it.sku} · ` : ''}
                                      {it.type}
                                      {' · '}{fmt(it.default_sale_price || 0)}
                                      {' · GST '}{it.gst_rate || 0}%
                                      {it.type === 'product' && ` · Stock: ${fmtN(it.current_stock_qty || 0)}`}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input className="input" type="number" min={0} step={0.001} style={{ textAlign: 'right' }}
                          value={l.quantity} onChange={e => updateLine(i, { quantity: e.target.value })} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input className="input" type="number" min={0} step={0.01} style={{ textAlign: 'right' }}
                          value={l.rate} onChange={e => updateLine(i, { rate: e.target.value })} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input className="input" type="number" min={0} max={100} step={0.01} style={{ textAlign: 'right' }}
                          value={l.gstRate} onChange={e => updateLine(i, { gstRate: e.target.value })} />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{fmt(total)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        {lines.length > 1 && (
                          <button className="btn btn-ghost btn-xs" onClick={() => removeLine(i)} style={{ color: '#ef4444' }}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-sm" onClick={addLine}><Plus size={12} /> Add Item</button>
            </div>
          </div>
        </div>

        {/* Totals */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <Field label="Discount (₹)">
              <input className="input" type="number" min={0} step={0.01} value={discount} onChange={e => setDiscount(e.target.value)} />
            </Field>
            <Field label="Round Off (±₹)">
              <input className="input" type="number" step={0.01} value={roundOff} onChange={e => setRoundOff(e.target.value)} />
            </Field>
          </div>
          <div style={{ background: 'var(--bg-page)', borderRadius: 8, padding: 12, fontSize: 12 }}>
            <Row label="Subtotal" value={fmt(totals.subtotal)} />
            <Row label="GST" value={fmt(totals.total_gst)} />
            {Number(discount) > 0 && <Row label="Discount" value={`− ${fmt(discount)}`} fg="#f97316" />}
            {Number(roundOff) !== 0 && <Row label="Round Off" value={fmt(roundOff)} />}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
              <Row label="Grand Total" value={fmt(totals.grand_total)} bold big />
            </div>
          </div>
        </div>

        {/* Payment on creation */}
        <div style={{ marginBottom: 12, padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={withPayment} onChange={e => setWP(e.target.checked)} />
            Receive full payment now ({fmt(totals.grand_total)})
          </label>
          {withPayment && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
              <Field label="Mode">
                <select className="input" value={payMode} onChange={e => { setPayMode(e.target.value); setPayVia(''); }}>
                  <option value="bank">Bank</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="cheque">Cheque</option>
                </select>
              </Field>
              {payMode !== 'cash' && (
                <Field label="Paid Via (Bank)">
                  <select className="input" value={payVia} onChange={e => setPayVia(e.target.value)}>
                    <option value="">— Select bank —</option>
                    {(banks || []).map(b => <option key={b.id} value={b.linked_account_id}>{b.account_name} ({b.bank_name})</option>)}
                  </select>
                </Field>
              )}
              <Field label="Reference">
                <input className="input" placeholder="UTR / Cheque #" value={payRef} onChange={e => setPayRef(e.target.value)} />
              </Field>
            </div>
          )}
        </div>

        {/* Notes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <Field label="Notes">
            <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </Field>
          <Field label="Terms & Conditions">
            <textarea className="input" rows={2} value={terms} onChange={e => setTerms(e.target.value)} />
          </Field>
        </div>

        {err && (
          <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
            <AlertCircle size={14} /> {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm & Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function emptyLine() {
  return { itemId: null, itemName: '', description: '', quantity: 1, unit: '', rate: 0, gstRate: 0, query: '', type: null, stockAvailable: 0 };
}

// ─── Payment Modal ───────────────────────────────────────────────────────────

function PaymentModal({ invoice, onClose, onSaved }) {
  const [date, setDate]     = useState(today());
  const [amount, setAmount] = useState(invoice.balance_due);
  const [mode, setMode]     = useState('bank');
  const [paidVia, setPV]    = useState('');
  const [ref, setRef]       = useState('');
  const [notes, setNotes]   = useState('');
  const [banks, setBanks]   = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);

  useEffect(() => {
    finoListBanks()
      .then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : Array.isArray(r.data?.banks) ? r.data.banks : Array.isArray(r.data) ? r.data : []))
      .catch(() => setBanks([]));
  }, []);

  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error('Amount must be > 0');
      if (amt > Number(invoice.balance_due) + 0.001) throw new Error(`Max payable: ${fmt(invoice.balance_due)}`);
      if (mode !== 'cash' && !paidVia) throw new Error('Select bank account');
      await finoRecordPayment(invoice.id, {
        paymentDate: date,
        amount: amt,
        paymentMode: mode,
        paidViaAccountId: mode === 'cash' ? null : paidVia,
        referenceNumber: ref || undefined,
        notes: notes || undefined,
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Receive Payment · {invoice.invoice_number}</h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
          <Row label="Grand Total" value={fmt(invoice.grand_total)} />
          <Row label="Already Paid" value={fmt(invoice.amount_paid)} fg="#22c55e" />
          <Row label="Balance Due" value={fmt(invoice.balance_due)} bold fg="#ef4444" />
        </div>

        <Field label="Payment Date">
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
        <Field label="Amount">
          <input className="input" type="number" min={0} step={0.01} value={amount} onChange={e => setAmount(e.target.value)} />
        </Field>
        <Field label="Mode">
          <select className="input" value={mode} onChange={e => { setMode(e.target.value); setPV(''); }}>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="cheque">Cheque</option>
          </select>
        </Field>
        {mode !== 'cash' && (
          <Field label="Paid Via (Bank)">
            <select className="input" value={paidVia} onChange={e => setPV(e.target.value)}>
              <option value="">— Select bank —</option>
              {banks.map(b => <option key={b.id} value={b.linked_account_id}>{b.account_name} ({b.bank_name})</option>)}
            </select>
          </Field>
        )}
        <Field label="Reference (optional)">
          <input className="input" placeholder="UTR / Cheque # / UPI Ref" value={ref} onChange={e => setRef(e.target.value)} />
        </Field>
        <Field label="Notes (optional)">
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>

        {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginTop: 8 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Receive'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
