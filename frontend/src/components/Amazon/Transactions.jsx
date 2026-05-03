import React, { useEffect, useState, useCallback } from 'react';
import { Search, X, Trash2, ChevronLeft, ChevronRight, AlertTriangle, Plus, ArrowRight } from 'lucide-react';
import { amzGetTransactions, amzGetCards, amzDeleteTransaction, amzAddTransaction } from '../../services/api';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);

const TYPE_COLOR = {
  Purchase: { bg: 'rgba(239,68,68,0.10)',  c: 'var(--danger)'  },
  Add:      { bg: 'rgba(34,197,94,0.10)',  c: 'var(--success)' },
  Transfer: { bg: 'rgba(59,130,246,0.10)', c: 'var(--info)'    },
  Refund:   { bg: 'rgba(139,92,246,0.10)', c: '#8B5CF6'        },
};

export default function AmazonTransactions() {
  const [txns, setTxns] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ search: '', cardId: 'all', txnType: 'all', startDate: '', endDate: '' });
  const [showModal, setShowModal] = useState(false);

  const load = useCallback((page = 1) => {
    setLoading(true);
    const params = { page, limit: pagination.limit };
    if (filters.search)     params.search    = filters.search;
    if (filters.cardId)     params.cardId    = filters.cardId;
    if (filters.txnType)    params.txnType   = filters.txnType;
    if (filters.startDate)  params.startDate = filters.startDate;
    if (filters.endDate)    params.endDate   = filters.endDate;
    amzGetTransactions(params)
      .then(({ data }) => {
        setTxns(data.transactions || []);
        setPagination(data.pagination);
      })
      .finally(() => setLoading(false));
  }, [filters, pagination.limit]);

  useEffect(() => { load(1); }, [filters]);
  useEffect(() => { amzGetCards().then(({ data }) => setCards(data.cards || [])); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Delete this transaction?')) return;
    try { await amzDeleteTransaction(id); load(pagination.page); }
    catch (e) { alert(e?.response?.data?.error || e.message); }
  };

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const cardById = (id) => cards.find(x => String(x.id) === String(id));
  const cardLabel = (id) => {
    const c = cardById(id);
    return c ? `${c.card_name} (${c.last_4})` : '—';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 17, margin: 0 }}>Transactions</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{pagination.total} transactions</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
          <Plus size={14} /> Add Entry
        </button>
      </div>

      <div className="filter-bar">
        <div style={{ position: 'relative', maxWidth: 240 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" placeholder="Search Order ID / title..." value={filters.search} onChange={e => set('search', e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        <select className="input" value={filters.cardId} onChange={e => set('cardId', e.target.value)} style={{ maxWidth: 180 }}>
          <option value="all">All Cards</option>
          {cards.map(c => <option key={c.id} value={c.id}>{c.card_name} ({c.last_4})</option>)}
        </select>
        <select className="input" value={filters.txnType} onChange={e => set('txnType', e.target.value)} style={{ maxWidth: 150 }}>
          <option value="all">All Types</option>
          <option value="Purchase">Purchase</option>
          <option value="Add">Add Balance</option>
          <option value="Transfer">Transfer</option>
          <option value="Refund">Refund</option>
        </select>
        <input className="input" type="date" value={filters.startDate} onChange={e => set('startDate', e.target.value)} style={{ maxWidth: 150 }} />
        <input className="input" type="date" value={filters.endDate} onChange={e => set('endDate', e.target.value)} style={{ maxWidth: 150 }} />
        {(filters.search || filters.cardId !== 'all' || filters.txnType !== 'all' || filters.startDate || filters.endDate) && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ search: '', cardId: 'all', txnType: 'all', startDate: '', endDate: '' })}>
            <X size={13} /> Clear
          </button>
        )}
      </div>

      <div className="table-wrapper">
        <table style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Card</th>
              <th>Amount</th>
              <th>Order ID / Notes</th>
              <th>Product</th>
              <th>Payment Ref</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            ) : txns.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No transactions.</td></tr>
            ) : txns.map(t => {
              const tc = TYPE_COLOR[t.txn_type] || { bg: 'rgba(100,100,100,0.1)', c: 'var(--text-muted)' };
              const isPurchase = t.txn_type === 'Purchase';
              const isTransfer = t.txn_type === 'Transfer';
              const amountColor = isPurchase ? 'var(--danger)' : 'var(--success)';
              return (
                <tr key={t.id}>
                  <td style={{ fontSize: 11 }}>{t.txn_date}</td>
                  <td>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 600, background: tc.bg, color: tc.c }}>
                      {t.txn_type}
                    </span>
                  </td>
                  <td>
                    {isTransfer ? (
                      <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {cardLabel(t.from_card_id)} <ArrowRight size={11} /> {cardLabel(t.to_card_id)}
                      </span>
                    ) : t.card_id && cardById(t.card_id) ? (
                      <span style={{ fontSize: 11 }}>{cardById(t.card_id).card_name} <code style={{ opacity: 0.6 }}>({cardById(t.card_id).last_4})</code></span>
                    ) : t.card_last4 ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--warning)' }}>
                        <AlertTriangle size={11} /> Unmapped <code>{t.card_last4}</code>
                      </span>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ fontWeight: 600, color: isTransfer ? 'var(--info)' : amountColor }}>{fmt(t.amount)}</td>
                  <td style={{ fontSize: 10, fontFamily: 'monospace' }}>{t.order_id || (t.notes ? <span style={{ fontFamily: 'inherit', fontStyle: 'italic', color: 'var(--text-muted)' }}>{t.notes}</span> : '-')}</td>
                  <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }} title={t.title}>{t.title || '-'}</td>
                  <td style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{t.payment_reference_id || '-'}</td>
                  <td>
                    <button className="btn btn-ghost btn-xs" onClick={() => handleDelete(t.id)} style={{ color: 'var(--danger)' }} title="Delete"><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {pagination.page} of {pagination.pages}</span>
          <div className="pagination">
            <button disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}><ChevronLeft size={14} /></button>
            {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => {
              const start = Math.max(1, Math.min(pagination.page - 2, pagination.pages - 4));
              const p = start + i;
              if (p > pagination.pages) return null;
              return <button key={p} className={p === pagination.page ? 'active' : ''} onClick={() => load(p)}>{p}</button>;
            })}
            <button disabled={pagination.page >= pagination.pages} onClick={() => load(pagination.page + 1)}><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {showModal && (
        <AddTxnModal
          cards={cards}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(1); }}
        />
      )}
    </div>
  );
}

function AddTxnModal({ cards, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    txnType: 'Add',
    txnDate: today,
    amount: '',
    cardId: '',
    fromCardId: '',
    toCardId: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setError(null);
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return setError('Amount must be > 0');
    if (!form.txnDate) return setError('Date required');
    if (form.txnType === 'Transfer') {
      if (!form.fromCardId || !form.toCardId) return setError('Select both From and To cards');
      if (form.fromCardId === form.toCardId) return setError('From and To cards must differ');
    } else {
      if (!form.cardId) return setError('Select a card');
    }
    setSaving(true);
    try {
      const payload = {
        txnType: form.txnType,
        txnDate: form.txnDate,
        amount: amt,
        notes: form.notes || null,
      };
      if (form.txnType === 'Transfer') {
        payload.fromCardId = form.fromCardId;
        payload.toCardId = form.toCardId;
      } else {
        payload.cardId = form.cardId;
      }
      await amzAddTransaction(payload);
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 12, padding: 24,
        width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Add Manual Entry</h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Type</label>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {['Add', 'Transfer', 'Refund'].map(t => (
                <button key={t} className={`btn btn-sm ${form.txnType === t ? 'btn-primary' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => set('txnType', t)}>
                  {t === 'Add' ? 'Add Balance' : t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date</label>
            <input className="input" type="date" value={form.txnDate} onChange={e => set('txnDate', e.target.value)} style={{ marginTop: 4 }} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Amount (USD)</label>
            <input className="input" type="number" step="0.01" min="0" placeholder="0.00"
              value={form.amount} onChange={e => set('amount', e.target.value)} style={{ marginTop: 4 }} />
          </div>

          {form.txnType === 'Transfer' ? (
            <>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>From Card</label>
                <select className="input" value={form.fromCardId} onChange={e => set('fromCardId', e.target.value)} style={{ marginTop: 4 }}>
                  <option value="">— Select —</option>
                  {cards.map(c => <option key={c.id} value={c.id}>{c.card_name} ({c.last_4})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>To Card</label>
                <select className="input" value={form.toCardId} onChange={e => set('toCardId', e.target.value)} style={{ marginTop: 4 }}>
                  <option value="">— Select —</option>
                  {cards.map(c => <option key={c.id} value={c.id}>{c.card_name} ({c.last_4})</option>)}
                </select>
              </div>
            </>
          ) : (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Card</label>
              <select className="input" value={form.cardId} onChange={e => set('cardId', e.target.value)} style={{ marginTop: 4 }}>
                <option value="">— Select —</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.card_name} ({c.last_4})</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Notes (optional)</label>
            <input className="input" placeholder="e.g. Bank transfer, Refund reason..."
              value={form.notes} onChange={e => set('notes', e.target.value)} style={{ marginTop: 4 }} />
          </div>

          {error && (
            <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving}
              style={{ flex: 1, justifyContent: 'center' }}>
              {saving ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
