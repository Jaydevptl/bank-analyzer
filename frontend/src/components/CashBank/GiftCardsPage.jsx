import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, X, Gift, ArrowLeftRight, ShoppingBag, Pencil, Trash2 } from 'lucide-react';
import {
  finoListGcPlatforms, finoCreateGcPlatform,
  finoListGiftCards, finoGetGiftCard, finoCreateGiftCard,
  finoUpdateGiftCard, finoDeleteGiftCard,
  finoUseGiftCard, finoDeleteGcUsage,
  finoGcTransfer, finoDeleteGcTransfer,
  finoGcSummary, finoListBanks, finoListCC,
} from '../../services/api';
import EditModal from '../shared/EditModal';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_COLORS = {
  active:    { bg: 'rgba(59,130,246,0.10)', c: 'var(--info)' },
  exhausted: { bg: 'rgba(100,100,100,0.15)', c: 'var(--text-muted)' },
  expired:   { bg: 'rgba(245,158,11,0.10)', c: 'var(--warning)' },
  closed:    { bg: 'rgba(34,197,94,0.10)',  c: 'var(--success)' },
  deleted:   { bg: 'rgba(239,68,68,0.10)',  c: 'var(--danger)' },
  cancelled: { bg: 'rgba(239,68,68,0.10)',  c: 'var(--danger)' },
};

const EXPENSE_CODES = [
  { code: '5700', label: 'Misc Expense' },
  { code: '5100', label: 'Purchases' },
  { code: '5500', label: 'Marketing / Ads' },
  { code: '5600', label: 'Office Expense' },
  { code: '5200', label: 'Direct Expense' },
  { code: '5300', label: 'Salary' },
];

const TRANSFER_REASONS = ['consolidating', 'expiring soon', 'lost card', 'other'];

export default function GiftCardsPage() {
  const [platforms, setPlatforms] = useState([]);
  const [cards, setCards]         = useState([]);
  const [summary, setSummary]     = useState([]);
  const [selId, setSelId]         = useState(null);
  const [detail, setDetail]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c, s] = await Promise.all([
        finoListGcPlatforms(), finoListGiftCards(), finoGcSummary(),
      ]);
      setPlatforms(p.data.platforms || []);
      setCards(c.data.cards || []);
      setSummary(s.data.summary || []);
      if (!selId && c.data.cards?.length) setSelId(c.data.cards[0].id);
    } finally { setLoading(false); }
  }, [selId]);

  const loadDetail = useCallback((id) => {
    if (!id) return setDetail(null);
    finoGetGiftCard(id).then(({ data }) => setDetail(data));
  }, []);

  useEffect(() => { reload(); }, []);
  useEffect(() => { loadDetail(selId); }, [selId, loadDetail]);

  const onSaved = () => { setModal(null); reload(); loadDetail(selId); };
  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of cards) {
      const k = c.platform_id;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    }
    return [...map.entries()];
  }, [cards]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Gift Cards</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setModal('new')}>
          <Plus size={13} /> New Gift Card
        </button>
      </div>

      {/* Platform summary */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
        {summary.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12 }}>No gift cards yet.</div>
        ) : summary.map(s => (
          <div key={s.platform_id} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10,
            padding: 12, minWidth: 180, flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: s.display_color }} />
              <div style={{ fontSize: 12, fontWeight: 700 }}>{s.platform_name}</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', marginTop: 6 }}>{fmt(s.total_balance)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {s.active_cards_count} cards · used {fmt(s.total_used)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 280px)' }}>
        <aside style={{ width: 320, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
            Cards by Platform
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? <div className="spinner" style={{ margin: '40px auto' }} /> : grouped.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No gift cards yet.
              </div>
            ) : grouped.map(([pid, items]) => {
              const plat = items[0]?.platform;
              const total = items.reduce((s, c) => s + Number(c.current_balance || 0), 0);
              return (
                <div key={pid}>
                  <div style={{ padding: '8px 12px', background: 'var(--bg-page)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: plat?.display_color || '#888' }} />
                      {plat?.name || 'Unknown'}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{fmt(total)}</span>
                  </div>
                  {items.map(c => {
                    const active = selId === c.id;
                    const sc = STATUS_COLORS[c.status] || STATUS_COLORS.active;
                    return (
                      <button key={c.id} onClick={() => setSelId(c.id)} style={{
                        width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
                        background: active ? 'var(--bg-hover)' : 'transparent',
                        borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                        textAlign: 'left', borderBottom: '1px solid var(--border)',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>
                            {c.card_label || `Card ${c.id.slice(0, 6)}`}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(c.current_balance)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            Face {fmt(c.face_value)}
                          </span>
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, fontWeight: 600, background: sc.bg, color: sc.c }}>
                            {c.status}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </aside>

        <section style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!detail ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
              {cards.length === 0 ? 'Add a gift card to begin.' : 'Select a gift card on the left.'}
            </div>
          ) : (
            <CardDetail data={detail} onAct={(action) => setModal(action)} />
          )}
        </section>
      </div>

      {modal === 'new' && <NewGiftCardModal platforms={platforms} onClose={() => setModal(null)} onSaved={onSaved} onCreatePlatform={async (data) => {
        const r = await finoCreateGcPlatform(data); await reload(); return r.data.platform;
      }} />}
      {modal === 'use' && detail && <UseModal card={detail.card} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'transfer' && detail && <TransferModal fromCard={detail.card} cards={cards} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'edit' && detail && (
        <EditModal title={`Edit ${detail.card.card_label || 'Gift Card'}`}
          fields={[
            { key: 'cardLabel', label: 'Label' },
            { key: 'expiryDate', label: 'Expiry Date', type: 'date' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ]}
          initialValues={{
            cardLabel: detail.card.card_label || '',
            expiryDate: detail.card.expiry_date || '',
            notes: detail.card.notes || '',
          }}
          onClose={() => setModal(null)}
          onSubmit={(patch) => finoUpdateGiftCard(detail.card.id, patch).then(onSaved)}
        />
      )}
      {modal === 'delete' && detail && (
        <DeleteConfirmModal title={`Delete ${detail.card.card_label || 'Gift Card'}`}
          description="Reverses every linked ledger group: original purchase, all usages, and any transfers in/out. The bank/cash that paid for it will recover the paid amount."
          confirmLabel="Delete & Reverse"
          onClose={() => setModal(null)}
          onConfirm={(reason) => finoDeleteGiftCard(detail.card.id, reason).then(() => { setSelId(null); onSaved(); })}
        />
      )}
      {modal?.kind === 'deleteUsage' && (
        <DeleteConfirmModal title="Reverse Usage"
          description={`Reverses usage of ${fmt(modal.row.amount_used)}. Card balance will increase.`}
          confirmLabel="Reverse"
          onClose={() => setModal(null)}
          onConfirm={(reason) => finoDeleteGcUsage(modal.row.id, reason).then(onSaved)}
        />
      )}
      {modal?.kind === 'deleteTransfer' && (
        <DeleteConfirmModal title="Reverse Transfer"
          description={`Reverses transfer of ${fmt(modal.row.amount)}.`}
          confirmLabel="Reverse"
          onClose={() => setModal(null)}
          onConfirm={(reason) => finoDeleteGcTransfer(modal.row.id, reason).then(onSaved)}
        />
      )}
    </div>
  );
}

// ─── Detail panel ────────────────────────────────────────────────────────────
function CardDetail({ data, onAct }) {
  const { card, usages, transfersIn, transfersOut } = data;
  const sc = STATUS_COLORS[card.status] || STATUS_COLORS.active;
  const canAct = !['deleted', 'cancelled'].includes(card.status);
  return (
    <>
      <div style={{ padding: 18, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Gift size={18} color={card.platform?.display_color} />
              {card.card_label || 'Gift Card'}
              <span style={{ marginLeft: 6, fontSize: 10, padding: '3px 8px', borderRadius: 12, fontWeight: 600, background: sc.bg, color: sc.c }}>
                {card.status}
              </span>
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {card.platform?.name || 'Unknown'} · Purchased {card.purchase_date}
              {card.expiry_date ? ` · Expires ${card.expiry_date}` : ''}
              {card.card_number_last4 ? ` · ····${card.card_number_last4}` : ''}
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
              <Stat label="Face Value"     value={fmt(card.face_value)} />
              <Stat label="Paid"           value={fmt(card.paid_amount)} />
              <Stat label="Discount"       value={fmt(card.discount_amount)} color="var(--success)" />
              <Stat label="Current Balance" value={fmt(card.current_balance)} highlight />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {canAct && (
              <>
                <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }} onClick={() => onAct('use')}>
                  <ShoppingBag size={13} /> Use Balance
                </button>
                <button className="btn btn-sm" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--info)' }} onClick={() => onAct('transfer')}>
                  <ArrowLeftRight size={13} /> Transfer
                </button>
              </>
            )}
            <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => onAct('edit')}>
              <Pencil size={13} />
            </button>
            <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => onAct('delete')} style={{ color: 'var(--danger)' }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Usage History</h3>
        {usages.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No usages yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12, marginBottom: 18 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Date</th>
                <th style={{ padding: '6px 8px' }}>Description</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '6px 8px', width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {usages.map(u => (
                <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 8 }}>{u.usage_date}</td>
                  <td style={{ padding: 8 }}>{u.description || '—'}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>−{fmt(u.amount_used)}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>
                    <RowMenu items={[
                      { label: 'Reverse usage', icon: <Trash2 size={12} />, danger: true,
                        onClick: () => onAct({ kind: 'deleteUsage', row: u }) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Transfers</h3>
        {(transfersIn.length + transfersOut.length) === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No transfers.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Date</th>
                <th style={{ padding: '6px 8px' }}>Direction</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '6px 8px' }}>Reason</th>
                <th style={{ padding: '6px 8px', width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {[...transfersOut.map(t => ({ ...t, dir: 'out' })), ...transfersIn.map(t => ({ ...t, dir: 'in' }))]
                .sort((a, b) => b.transfer_date.localeCompare(a.transfer_date))
                .map(t => (
                  <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 8 }}>{t.transfer_date}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                        background: t.dir === 'out' ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.10)',
                        color: t.dir === 'out' ? 'var(--danger)' : 'var(--success)' }}>
                        {t.dir === 'out' ? 'Out' : 'In'}
                      </span>
                    </td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{fmt(t.amount)}</td>
                    <td style={{ padding: 8, color: 'var(--text-secondary)' }}>{t.reason || '—'}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>
                      <RowMenu items={[
                        { label: 'Reverse transfer', icon: <Trash2 size={12} />, danger: true,
                          onClick: () => onAct({ kind: 'deleteTransfer', row: t }) },
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

function Stat({ label, value, highlight, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: highlight ? 18 : 14, fontWeight: highlight ? 800 : 600, color: color || (highlight ? 'var(--accent)' : 'var(--text-primary)') }}>{value}</div>
    </div>
  );
}

// ─── Modal primitives ────────────────────────────────────────────────────────
function ModalShell({ title, onClose, children, width = 480 }) {
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
function ErrBox({ msg }) { return msg ? <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginTop: 8 }}>{msg}</div> : null; }

// ─── New Gift Card Modal ─────────────────────────────────────────────────────
function NewGiftCardModal({ platforms, onClose, onSaved, onCreatePlatform }) {
  const [banks, setBanks] = useState([]);
  const [ccs, setCcs] = useState([]);
  const [showAddPlat, setShowAddPlat] = useState(false);
  const [newPlatName, setNewPlatName] = useState('');
  const [newPlatColor, setNewPlatColor] = useState('#888888');
  const [f, setF] = useState({
    platformId: '',
    cardLabel: '', cardNumberLast4: '',
    faceValue: '', paidAmount: '',
    purchaseDate: today(),
    paidViaAccountId: '',
    expiryDate: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  useEffect(() => {
    finoListBanks().then(({ data }) => {
      setBanks(data.accounts || []);
      if (data.accounts?.[0]) set('paidViaAccountId', data.accounts[0].linked_account_id);
    }).catch(() => setBanks([]));
    finoListCC().then(({ data }) => setCcs(data.cards || []))
      .catch(() => setCcs([]));
    if (platforms[0]) set('platformId', platforms[0].id);
  }, []);

  const discount = useMemo(() => {
    const face = Number(f.faceValue) || 0;
    const paid = Number(f.paidAmount) || 0;
    return face - paid;
  }, [f.faceValue, f.paidAmount]);

  const submit = async () => {
    setErr(null);
    const face = Number(f.faceValue), paid = Number(f.paidAmount);
    if (!(face > 0))  return setErr('Face value must be > 0');
    if (!(paid > 0))  return setErr('Paid amount must be > 0');
    if (paid > face)  return setErr('Paid amount cannot exceed face value');
    if (!f.platformId) return setErr('Select a platform');
    if (!f.paidViaAccountId) return setErr('Select bank/cash');
    setSaving(true);
    try {
      await finoCreateGiftCard({ ...f, faceValue: face, paidAmount: paid });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  const addPlatform = async () => {
    if (!newPlatName.trim()) return;
    try {
      const p = await onCreatePlatform({ name: newPlatName.trim(), displayColor: newPlatColor });
      set('platformId', p.id);
      setShowAddPlat(false); setNewPlatName('');
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
  };

  return (
    <ModalShell title="New Gift Card" onClose={onClose}>
      <Field label="Platform *">
        <div style={{ display: 'flex', gap: 6 }}>
          <select className="input" style={{ flex: 1 }} value={f.platformId} onChange={e => set('platformId', e.target.value)}>
            <option value="">— select —</option>
            {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn btn-sm" onClick={() => setShowAddPlat(s => !s)}>+ Platform</button>
        </div>
        {showAddPlat && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input className="input" placeholder="Platform name" value={newPlatName} onChange={e => setNewPlatName(e.target.value)} />
            <input className="input" type="color" style={{ width: 56, padding: 2 }} value={newPlatColor} onChange={e => setNewPlatColor(e.target.value)} />
            <button className="btn btn-sm btn-primary" onClick={addPlatform}>Add</button>
          </div>
        )}
      </Field>
      <Field label="Card Label (optional)">
        <input className="input" value={f.cardLabel} onChange={e => set('cardLabel', e.target.value)} placeholder="Amazon GC #1" />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Last 4 / Code"><input className="input" value={f.cardNumberLast4} onChange={e => set('cardNumberLast4', e.target.value)} /></Field>
        <Field label="Purchase Date"><input className="input" type="date" value={f.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Face Value (₹) *"><input className="input" type="number" step="0.01" value={f.faceValue} onChange={e => set('faceValue', e.target.value)} /></Field>
        <Field label="Paid Amount (₹) *"><input className="input" type="number" step="0.01" value={f.paidAmount} onChange={e => set('paidAmount', e.target.value)} /></Field>
      </div>
      {Number(f.faceValue) > 0 && Number(f.paidAmount) > 0 && (
        <div style={{ background: discount > 0 ? 'rgba(34,197,94,0.10)' : 'var(--bg-page)', padding: 8, borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
          <b>Discount:</b> {fmt(discount)} {discount > 0 ? '(saving)' : discount < 0 ? '(invalid — paid > face)' : '(none)'}
        </div>
      )}
      <Field label="Paid Via *">
        <select className="input" value={f.paidViaAccountId} onChange={e => set('paidViaAccountId', e.target.value)}>
          <option value="">— select payment source —</option>
          {banks.length > 0 && <optgroup label="Bank Accounts">
            {banks.map(b => <option key={b.id} value={b.linked_account_id}>{b.account_name} ({b.bank_name})</option>)}
          </optgroup>}
          {ccs.length > 0 && <optgroup label="Credit Cards">
            {ccs.map(c => <option key={c.id} value={c.linked_account_id}>{c.card_label} · {c.bank_name}</option>)}
          </optgroup>}
        </select>
      </Field>
      <Field label="Expiry Date (optional)"><input className="input" type="date" value={f.expiryDate} onChange={e => set('expiryDate', e.target.value)} /></Field>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
          {saving ? 'Creating…' : 'Create Card'}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Use modal ────────────────────────────────────────────────────────────────
function UseModal({ card, onClose, onSaved }) {
  const [f, setF] = useState({
    usageDate: today(), amountUsed: '', description: '',
    expenseCategoryCode: '5700', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null);
    const amt = Number(f.amountUsed);
    if (!(amt > 0)) return setErr('Amount > 0');
    if (amt > Number(card.current_balance) + 0.01) return setErr(`Available: ${fmt(card.current_balance)}`);
    setSaving(true);
    try { await finoUseGiftCard(card.id, { ...f, amountUsed: amt }); onSaved(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title={`Use ${card.card_label || 'Gift Card'}`} onClose={onClose}>
      <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
        <b>Available:</b> {fmt(card.current_balance)} of {fmt(card.face_value)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Date"><input className="input" type="date" value={f.usageDate} onChange={e => set('usageDate', e.target.value)} /></Field>
        <Field label="Amount (₹) *"><input className="input" type="number" step="0.01" value={f.amountUsed} onChange={e => set('amountUsed', e.target.value)} /></Field>
      </div>
      <Field label="Description"><input className="input" value={f.description} onChange={e => set('description', e.target.value)} placeholder="Amazon order #..." /></Field>
      <Field label="Expense Category">
        <select className="input" value={f.expenseCategoryCode} onChange={e => set('expenseCategoryCode', e.target.value)}>
          {EXPENSE_CODES.map(o => <option key={o.code} value={o.code}>{o.label} ({o.code})</option>)}
        </select>
      </Field>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Record Usage'}</button>
      </div>
    </ModalShell>
  );
}

// ─── Transfer modal ──────────────────────────────────────────────────────────
function TransferModal({ fromCard, cards, onClose, onSaved }) {
  const others = cards.filter(c => c.id !== fromCard.id && !['deleted', 'cancelled'].includes(c.status));
  const [f, setF] = useState({
    transferDate: today(), fromCardId: fromCard.id,
    toCardId: others[0]?.id || '',
    amount: '', reason: 'consolidating', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null);
    const amt = Number(f.amount);
    if (!(amt > 0)) return setErr('Amount > 0');
    if (!f.toCardId) return setErr('Select destination card');
    if (amt > Number(fromCard.current_balance) + 0.01) return setErr(`Source balance: ${fmt(fromCard.current_balance)}`);
    setSaving(true);
    try { await finoGcTransfer({ ...f, amount: amt }); onSaved(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title="Transfer Between Gift Cards" onClose={onClose}>
      <Field label="From">
        <input className="input" disabled value={`${fromCard.card_label || fromCard.id.slice(0,6)} (${fmt(fromCard.current_balance)})`} />
      </Field>
      <Field label="To *">
        <select className="input" value={f.toCardId} onChange={e => set('toCardId', e.target.value)}>
          <option value="">— select —</option>
          {others.map(c => <option key={c.id} value={c.id}>{c.platform?.name} · {c.card_label || c.id.slice(0,6)} ({fmt(c.current_balance)})</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Date"><input className="input" type="date" value={f.transferDate} onChange={e => set('transferDate', e.target.value)} /></Field>
        <Field label="Amount (₹) *"><input className="input" type="number" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
      </div>
      <Field label="Reason">
        <select className="input" value={f.reason} onChange={e => set('reason', e.target.value)}>
          {TRANSFER_REASONS.map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>{saving ? 'Transferring…' : 'Transfer'}</button>
      </div>
    </ModalShell>
  );
}
