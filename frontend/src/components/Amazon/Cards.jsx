import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, CreditCard } from 'lucide-react';
import { amzGetCardBalances, amzAddCard, amzUpdateCard, amzDeleteCard } from '../../services/api';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
const lbl = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };

function CardModal({ editing, onClose, onSaved }) {
  const [form, setForm] = useState({
    cardName: editing?.card_name || '',
    last4: editing?.last_4 || '',
    openingBalance: editing?.opening_balance ?? 0,
    notes: editing?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.cardName.trim() || !form.last4.trim()) {
      setErr('Card name and last 4 digits required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await amzUpdateCard(editing.id, form);
      } else {
        await amzAddCard(form);
      }
      onSaved();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 480, padding: 24, background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={17} /> {editing ? 'Edit Card' : 'Add Card'}
          </h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Card Name *</label>
              <input className="input" value={form.cardName} onChange={e => set('cardName', e.target.value)} required />
            </div>
            <div>
              <label style={lbl}>Last 4 Digits *</label>
              <input className="input" value={form.last4} onChange={e => set('last4', e.target.value.replace(/\D/g, ''))} maxLength={6} required />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={lbl}>Opening Balance ($)</label>
            <input type="number" step="0.01" className="input" value={form.openingBalance} onChange={e => set('openingBalance', e.target.value)} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={lbl}>Notes</label>
            <input className="input" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="optional" />
          </div>

          {err && <div style={{ marginTop: 12, padding: 8, borderRadius: 6, background: 'rgba(239,68,68,0.10)', color: 'var(--danger)', fontSize: 12 }}>{err}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AmazonCards({ onChange }) {
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | card obj

  const load = () => {
    setLoading(true);
    amzGetCardBalances()
      .then(({ data }) => setBalances(data.balances))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (card) => {
    if (!confirm(`Delete card "${card.card_name}"? Transactions will remain but become unmapped.`)) return;
    try { await amzDeleteCard(card.id); load(); onChange?.(); }
    catch (e) { alert(e?.response?.data?.error || e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 17, margin: 0 }}>Cards</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Map each card by its last 4 digits (matches Amazon's Payment Identifier)</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setModal('new')}>
          <Plus size={14} /> Add Card
        </button>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Card</th>
              <th>Last 4</th>
              <th>Opening</th>
              <th>Added</th>
              <th>Purchases</th>
              <th>Refunded</th>
              <th>Current Balance</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            ) : balances.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No cards yet. Click "Add Card".</td></tr>
            ) : (
              balances.map(b => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 600 }}>{b.card_name}</td>
                  <td><code>{b.last_4}</code></td>
                  <td>{fmt(b.opening_balance)}</td>
                  <td style={{ color: 'var(--success)' }}>{fmt(b.total_added)}</td>
                  <td style={{ color: 'var(--danger)' }}>{fmt(b.total_purchases)}</td>
                  <td style={{ color: 'var(--success)' }}>{fmt(b.total_refunded)}</td>
                  <td style={{ fontWeight: 700, color: Number(b.current_balance) < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmt(b.current_balance)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => setModal(b)} title="Edit"><Pencil size={14} /></button>
                      <button className="btn btn-ghost btn-xs" onClick={() => handleDelete(b)} title="Delete" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <CardModal
          editing={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); onChange?.(); }}
        />
      )}
    </div>
  );
}
