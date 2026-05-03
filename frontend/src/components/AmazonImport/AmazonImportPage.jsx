import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, X, Trash2, AlertCircle, Package, ShoppingCart, RefreshCw, ArrowRight } from 'lucide-react';
import {
  finoAiDashboard,
  finoAiListHawala, finoAiCreateHawala, finoAiHawalaInrPaid, finoAiHawalaUsdReceived, finoAiCancelHawala, finoAiNextHawalaNumber,
  finoAiListCards, finoAiCreateCard, finoAiLoadCard, finoAiTransferCard, finoAiDeleteCard,
  finoAiListOrders, finoAiCreateOrder, finoAiDeleteOrder,
  finoAiListShipments, finoAiCreateShipment, finoAiGetShipment, finoAiLinkOrder, finoAiAllocate, finoAiShipmentReceived, finoAiCancelShipment, finoAiNextShipmentNumber,
  finoListBanks, finoListParties, finoListItems,
} from '../../services/api';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtUSD = (n) => '$' + Number(n || 0).toFixed(2);
const today  = () => new Date().toISOString().slice(0, 10);

const TABS = [
  { id: 'hawala',    label: 'Hawala' },
  { id: 'cards',     label: 'Cards' },
  { id: 'orders',    label: 'Orders' },
  { id: 'shipments', label: 'Shipments' },
];

export default function AmazonImportPage() {
  const [tab, setTab]           = useState('hawala');
  const [dashboard, setDash]    = useState(null);
  const [hawala, setHawala]     = useState([]);
  const [cards, setCards]       = useState([]);
  const [orders, setOrders]     = useState([]);
  const [shipments, setShips]   = useState([]);
  const [modal, setModal]       = useState(null);

  const reload = useCallback(async () => {
    try {
      const [d, h, c, o, s] = await Promise.all([
        finoAiDashboard(), finoAiListHawala(), finoAiListCards(), finoAiListOrders(), finoAiListShipments(),
      ]);
      setDash(d.data);
      setHawala(h.data.transactions || []);
      setCards(c.data.cards || []);
      setOrders(o.data.orders || []);
      setShips(s.data.shipments || []);
    } catch (_) {}
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const onSaved = () => { setModal(null); reload(); };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Amazon Import Business</h1>
      </div>

      {dashboard && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Hawala (INR)" value={fmtINR(dashboard.total_hawala_inr)} sub={fmtUSD(dashboard.total_hawala_usd)} />
          <SummaryCard label="Cards" value={dashboard.cards_count} sub={`Bal ${fmtUSD(dashboard.total_card_balance)}`} />
          <SummaryCard label="Orders" value={dashboard.orders_count} sub={`${dashboard.orders_in_transit} in transit`} />
          <SummaryCard label="Shipments" value={dashboard.shipments_count} sub={`${dashboard.shipments_in_transit} in transit`} />
          <SummaryCard label="Landed Cost" value={fmtINR(dashboard.total_landed_cost_inr)} />
          <SummaryCard label="Dead Weight Loss" value={fmtINR(dashboard.dead_weight_loss_inr)} fg="#ef4444" />
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

      {tab === 'hawala'    && <HawalaTab rows={hawala} onAct={setModal} />}
      {tab === 'cards'     && <CardsTab  rows={cards} onAct={setModal} />}
      {tab === 'orders'    && <OrdersTab rows={orders} onAct={setModal} />}
      {tab === 'shipments' && <ShipmentsTab rows={shipments} onAct={setModal} />}

      {/* Modals */}
      {modal?.kind === 'newHawala'    && <NewHawalaModal onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'newCard'      && <NewCardModal onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'loadCard'     && <LoadCardModal card={modal.row} hawala={hawala} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'transferCard' && <TransferCardModal cards={cards} initialFrom={modal.row} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'newOrder'     && <NewOrderModal cards={cards} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'newShipment'  && <NewShipmentModal onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'shipDetail'   && <ShipmentDetailModal shipmentId={modal.row.id} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'deleteHawala' && (
        <DeleteConfirmModal title={`Cancel ${modal.row.txn_number}`}
          description="This will reverse the ledger entry (bank ↑ / Amazon USD ↓) and refresh bank balance."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoAiCancelHawala(modal.row.id, reason); reload(); }} />
      )}
      {modal?.kind === 'deleteOrder'  && (
        <DeleteConfirmModal title={`Cancel order ${modal.row.order_number || modal.row.item_name}`}
          description="This reverses the inventory ledger entry, restores card balance, and rolls back the linked item's stock."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoAiDeleteOrder(modal.row.id, reason); reload(); }} />
      )}
      {modal?.kind === 'deleteCard'   && (
        <DeleteConfirmModal title={`Delete ${modal.row.card_label}`}
          description="Reverses every order ledger group, soft-deletes orders, marks card closed."
          warning="Card balance will be zeroed. Make sure orders aren't already received and resold."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoAiDeleteCard(modal.row.id, reason); reload(); }} />
      )}
      {modal?.kind === 'deleteShipment' && (
        <DeleteConfirmModal title={`Cancel ${modal.row.shipment_number}`}
          description="Unlinks all orders, undoes cost allocations, and reverses inventory value adjustments."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await finoAiCancelShipment(modal.row.id, reason); reload(); }} />
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

function Buttons({ onCancel, onSave, saving, label, disabled }) {
  return <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
    <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel}>Cancel</button>
    <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={onSave} disabled={saving || disabled}>
      {saving ? 'Saving…' : label}
    </button>
  </div>;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function HawalaTab({ rows, onAct }) {
  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={() => onAct({ kind: 'newHawala' })}><Plus size={13} /> New Hawala</button>
      </div>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No hawala transactions.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>#</th>
                <th style={{ padding: '8px 10px' }}>Date</th>
                <th style={{ padding: '8px 10px' }}>Agent</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>INR</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>USD</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate</th>
                <th style={{ padding: '8px 10px' }}>INR Paid</th>
                <th style={{ padding: '8px 10px' }}>USD Recv</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>{r.txn_number}</td>
                  <td style={{ padding: '8px 10px' }}>{r.txn_date}</td>
                  <td style={{ padding: '8px 10px' }}>{r.agent?.name || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtINR(r.inr_amount)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtUSD(r.usd_amount)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{Number(r.exchange_rate).toFixed(2)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {r.inr_paid_status === 'paid'
                      ? <span style={{ color: '#22c55e' }}>✅ {r.inr_paid_date || ''}</span>
                      : <button className="btn btn-ghost btn-xs" onClick={async () => { await finoAiHawalaInrPaid(r.id, { paidDate: today() }); window.location.reload(); }}>Mark Paid</button>}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {r.usd_received_status === 'received'
                      ? <span style={{ color: '#22c55e' }}>✅ {r.usd_received_date || ''}</span>
                      : <button className="btn btn-ghost btn-xs" onClick={async () => { await finoAiHawalaUsdReceived(r.id, { receivedDate: today() }); window.location.reload(); }}>Mark Recv</button>}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                      background: r.status === 'completed' ? 'rgba(34,197,94,0.15)' : r.status === 'cancelled' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      color: r.status === 'completed' ? '#22c55e' : r.status === 'cancelled' ? '#ef4444' : '#f59e0b',
                    }}>{r.status}</span>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <RowMenu items={[{
                      label: 'Cancel', icon: <Trash2 size={12} />, danger: true,
                      onClick: () => onAct({ kind: 'deleteHawala', row: r }),
                    }]} />
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

function CardsTab({ rows, onAct }) {
  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={() => onAct({ kind: 'newCard' })}><Plus size={13} /> New Card</button>
      </div>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No cards.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>Card</th>
                <th style={{ padding: '8px 10px' }}>Email</th>
                <th style={{ padding: '8px 10px' }}>Expiry</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Loaded</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Used</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Balance</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px', width: 200 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>{c.card_label}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{c.email || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{c.expiry_date || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtUSD(c.total_loaded)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtUSD(c.total_used)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: Number(c.current_balance_usd) > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    {fmtUSD(c.current_balance_usd)}
                  </td>
                  <td style={{ padding: '8px 10px' }}>{c.status}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => onAct({ kind: 'loadCard', row: c })}>Load</button>
                    <button className="btn btn-ghost btn-xs" onClick={() => onAct({ kind: 'transferCard', row: c })}>Transfer</button>
                    <button className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }} onClick={() => onAct({ kind: 'deleteCard', row: c })}><Trash2 size={11} /></button>
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

function OrdersTab({ rows, onAct }) {
  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={() => onAct({ kind: 'newOrder' })}><Plus size={13} /> New Order</button>
      </div>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No orders.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>Order#</th>
                <th style={{ padding: '8px 10px' }}>Date</th>
                <th style={{ padding: '8px 10px' }}>Card</th>
                <th style={{ padding: '8px 10px' }}>Item</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Qty</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>USD</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>INR</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Landed</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(o => (
                <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{o.order_number || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{o.order_date}</td>
                  <td style={{ padding: '8px 10px' }}>{o.card?.card_label}</td>
                  <td style={{ padding: '8px 10px' }}>{o.item_name}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{o.item_qty}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtUSD(o.total_usd)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>{Number(o.exchange_rate_applied || 0).toFixed(2)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtINR(o.total_inr)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtINR(o.landed_cost_inr || o.total_inr)}</td>
                  <td style={{ padding: '8px 10px' }}>{o.order_status}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <RowMenu items={[{
                      label: 'Cancel', icon: <Trash2 size={12} />, danger: true,
                      onClick: () => onAct({ kind: 'deleteOrder', row: o }),
                    }]} />
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

function ShipmentsTab({ rows, onAct }) {
  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={() => onAct({ kind: 'newShipment' })}><Plus size={13} /> New Shipment</button>
      </div>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No shipments.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>Ship#</th>
                <th style={{ padding: '8px 10px' }}>Date</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Billed kg</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actual kg</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Dead kg</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Cost/g (B)</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Cost/g (A)</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Cost</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px', width: 200 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>{s.shipment_number}</td>
                  <td style={{ padding: '8px 10px' }}>{s.ship_date}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{Number(s.billed_weight_kg).toFixed(2)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{Number(s.actual_weight_kg).toFixed(2)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--warning)' }}>{Number(s.dead_weight_kg || 0).toFixed(2)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>₹{Number(s.cost_per_gram_billed || 0).toFixed(4)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>₹{Number(s.cost_per_gram_actual || 0).toFixed(4)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtINR(s.total_landed_cost_inr || s.shipping_cost_inr)}</td>
                  <td style={{ padding: '8px 10px' }}>{s.received_status}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => onAct({ kind: 'shipDetail', row: s })}>Detail</button>
                    <button className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }} onClick={() => onAct({ kind: 'deleteShipment', row: s })}><Trash2 size={11} /></button>
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

// ─── Modals ──────────────────────────────────────────────────────────────────

function NewHawalaModal({ onClose, onSaved }) {
  const [number, setNumber] = useState('');
  const [date, setDate]     = useState(today());
  const [agents, setAgents] = useState([]);
  const [banks, setBanks]   = useState([]);
  const [agentId, setAgentId]   = useState('');
  const [agentName, setAgentName] = useState('');
  const [bankId, setBankId]     = useState('');
  const [inr, setInr]       = useState('');
  const [usd, setUsd]       = useState('');
  const [rate, setRate]     = useState('');
  const [comm, setComm]     = useState(0);
  const [recAs, setRecAs]   = useState('amazon_gc');
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);

  useEffect(() => {
    finoAiNextHawalaNumber().then(r => setNumber(r.data.txn_number)).catch(() => {});
    finoListParties({ role: 'hawala_agent' }).then(r => setAgents(r.data.parties || [])).catch(() => setAgents([]));
    finoListBanks().then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : [])).catch(() => setBanks([]));
  }, []);

  // Auto-derive third field when 2 of (inr, usd, rate) entered
  useEffect(() => {
    const ni = Number(inr), nu = Number(usd), nr = Number(rate);
    if (ni > 0 && nu > 0 && !rate) setRate((ni / nu).toFixed(2));
    else if (ni > 0 && nr > 0 && !usd) setUsd((ni / nr).toFixed(2));
    else if (nu > 0 && nr > 0 && !inr) setInr((nu * nr).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inr, usd, rate]);

  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!agentId && !agentName.trim()) throw new Error('Agent required');
      if (!bankId) throw new Error('Bank required');
      await finoAiCreateHawala({
        txnNumber: number || undefined,
        txnDate: date,
        agentPartyId: agentId || undefined,
        agentName: agentId ? undefined : agentName.trim(),
        inrAmount: Number(inr), usdAmount: Number(usd), exchangeRate: Number(rate),
        agentCommission: Number(comm) || 0,
        paidViaBankId: bankId,
        receivedAs: recAs,
        notes: notes || undefined,
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title="New Hawala Transaction" onClose={onClose} maxWidth={520}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Hawala #"><input className="input" value={number} onChange={e => setNumber(e.target.value)} /></Field>
        <Field label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Agent"
        hint={agents.length === 0 ? 'No hawala agents found. Type a new name to auto-create.' : null}>
        {agents.length > 0 ? (
          <select className="input" value={agentId} onChange={e => setAgentId(e.target.value)} style={{ width: '100%' }}>
            <option value="">— Select agent —</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}{a.reliability_score ? ` ★${a.reliability_score}` : ''}</option>)}
          </select>
        ) : (
          <input className="input" value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Agent X" />
        )}
      </Field>
      <Field label="Bank Account">
        <select className="input" value={bankId} onChange={e => setBankId(e.target.value)} style={{ width: '100%' }}>
          <option value="">— Select bank —</option>
          {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="INR Amount"><input className="input" type="number" step="0.01" value={inr} onChange={e => setInr(e.target.value)} /></Field>
        <Field label="USD Amount"><input className="input" type="number" step="0.01" value={usd} onChange={e => setUsd(e.target.value)} /></Field>
        <Field label="Rate"><input className="input" type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Agent Commission (₹)"><input className="input" type="number" step="0.01" value={comm} onChange={e => setComm(e.target.value)} /></Field>
        <Field label="Received As">
          <select className="input" value={recAs} onChange={e => setRecAs(e.target.value)}>
            <option value="amazon_gc">Amazon GC</option>
            <option value="wire">Wire</option>
            <option value="paypal">PayPal</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </div>
      <Field label="Notes"><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Create" />
    </ModalShell>
  );
}

function NewCardModal({ onClose, onSaved }) {
  const [f, setF] = useState({ cardLabel: '', email: '', cardNumberLast4: '', expiryDate: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.cardLabel.trim()) throw new Error('Label required');
      await finoAiCreateCard(f);
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title="New Amazon US Card" onClose={onClose}>
      <Field label="Label"><input className="input" value={f.cardLabel} onChange={e => set('cardLabel', e.target.value)} placeholder="Card #1" /></Field>
      <Field label="Email"><input className="input" value={f.email} onChange={e => set('email', e.target.value)} /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Last 4"><input className="input" value={f.cardNumberLast4} onChange={e => set('cardNumberLast4', e.target.value)} /></Field>
        <Field label="Expiry"><input className="input" type="date" value={f.expiryDate} onChange={e => set('expiryDate', e.target.value)} /></Field>
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Create" />
    </ModalShell>
  );
}

function LoadCardModal({ card, hawala, onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [hid, setHid]       = useState('');
  const [date, setDate]     = useState(today());
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!(Number(amount) > 0)) throw new Error('Amount > 0');
      await finoAiLoadCard(card.id, { amount: Number(amount), hawalaTransactionId: hid || null, loadDate: date, notes: notes || undefined });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title={`Load ${card.card_label}`} onClose={onClose}>
      <div style={{ background: 'var(--bg-page)', padding: 8, borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
        Current balance: <b>{fmtUSD(card.current_balance_usd)}</b>
      </div>
      <Field label="Amount (USD)"><input className="input" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
      <Field label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      <Field label="Source Hawala (optional)">
        <select className="input" value={hid} onChange={e => setHid(e.target.value)} style={{ width: '100%' }}>
          <option value="">— None —</option>
          {hawala.filter(h => h.status !== 'cancelled' && h.received_as === 'amazon_gc').map(h => (
            <option key={h.id} value={h.id}>{h.txn_number} · {fmtUSD(h.usd_amount)} · {h.txn_date}</option>
          ))}
        </select>
      </Field>
      <Field label="Notes"><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Load" />
    </ModalShell>
  );
}

function TransferCardModal({ cards, initialFrom, onClose, onSaved }) {
  const [fromId, setFromId] = useState(initialFrom?.id || '');
  const [toId, setToId]     = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate]     = useState(today());
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);
  const from = cards.find(c => c.id === fromId);
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!fromId || !toId) throw new Error('Both cards required');
      if (!(Number(amount) > 0)) throw new Error('Amount > 0');
      await finoAiTransferCard(fromId, { toCardId: toId, amount: Number(amount), transferDate: date });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title="Card-to-Card Transfer" onClose={onClose}>
      <Field label="From">
        <select className="input" value={fromId} onChange={e => setFromId(e.target.value)} style={{ width: '100%' }}>
          <option value="">— Select —</option>
          {cards.filter(c => !c.is_deleted).map(c => <option key={c.id} value={c.id}>{c.card_label} · {fmtUSD(c.current_balance_usd)}</option>)}
        </select>
      </Field>
      <Field label="To">
        <select className="input" value={toId} onChange={e => setToId(e.target.value)} style={{ width: '100%' }}>
          <option value="">— Select —</option>
          {cards.filter(c => !c.is_deleted && c.id !== fromId).map(c => <option key={c.id} value={c.id}>{c.card_label} · {fmtUSD(c.current_balance_usd)}</option>)}
        </select>
      </Field>
      <Field label={`Amount (USD)${from ? ` — Max ${fmtUSD(from.current_balance_usd)}` : ''}`}>
        <input className="input" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
      </Field>
      <Field label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Transfer" />
    </ModalShell>
  );
}

function NewOrderModal({ cards, onClose, onSaved }) {
  const [items, setItems] = useState([]);
  const [f, setF] = useState({
    cardId: '', orderNumber: '', orderDate: today(),
    itemName: '', itemQty: 1, itemPriceUsd: '', shippingUsd: 0, taxUsd: 0,
    exchangeRateApplied: 84, linkedItemId: '', notes: '',
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { finoListItems().then(r => setItems(r.data.items || [])).catch(() => setItems([])); }, []);
  const totalUsd = round((Number(f.itemQty) || 0) * (Number(f.itemPriceUsd) || 0) + (Number(f.shippingUsd) || 0) + (Number(f.taxUsd) || 0));
  const totalInr = round(totalUsd * (Number(f.exchangeRateApplied) || 0));
  function round(n) { return Math.round(Number(n || 0) * 100) / 100; }

  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.cardId)        throw new Error('Card required');
      if (!f.itemName.trim()) throw new Error('Item name required');
      if (!(Number(f.itemQty) > 0)) throw new Error('Qty > 0');
      if (!(Number(f.itemPriceUsd) >= 0)) throw new Error('Price >= 0');
      if (!(Number(f.exchangeRateApplied) > 0)) throw new Error('Exchange rate > 0');
      await finoAiCreateOrder({
        ...f,
        itemQty: Number(f.itemQty),
        itemPriceUsd: Number(f.itemPriceUsd),
        shippingUsd: Number(f.shippingUsd),
        taxUsd: Number(f.taxUsd),
        exchangeRateApplied: Number(f.exchangeRateApplied),
        linkedItemId: f.linkedItemId || null,
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title="New Amazon Order" onClose={onClose} maxWidth={580}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Card">
          <select className="input" value={f.cardId} onChange={e => set('cardId', e.target.value)}>
            <option value="">— Select —</option>
            {cards.filter(c => !c.is_deleted).map(c => <option key={c.id} value={c.id}>{c.card_label} · {fmtUSD(c.current_balance_usd)}</option>)}
          </select>
        </Field>
        <Field label="Order #"><input className="input" value={f.orderNumber} onChange={e => set('orderNumber', e.target.value)} placeholder="113-456-789" /></Field>
        <Field label="Date"><input className="input" type="date" value={f.orderDate} onChange={e => set('orderDate', e.target.value)} /></Field>
      </div>
      <Field label="Item Name"><input className="input" value={f.itemName} onChange={e => set('itemName', e.target.value)} placeholder="CeraVe SA Cleanser 12oz" /></Field>
      <Field label="Linked Inventory Item (optional)" hint="If linked, stock will increase automatically.">
        <select className="input" value={f.linkedItemId} onChange={e => set('linkedItemId', e.target.value)} style={{ width: '100%' }}>
          <option value="">— None —</option>
          {items.filter(it => it.type === 'product').map(it => <option key={it.id} value={it.id}>{it.name}{it.weight_grams ? ` · ${it.weight_grams}g` : ''}</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Qty"><input className="input" type="number" step="0.01" value={f.itemQty} onChange={e => set('itemQty', e.target.value)} /></Field>
        <Field label="Price USD"><input className="input" type="number" step="0.01" value={f.itemPriceUsd} onChange={e => set('itemPriceUsd', e.target.value)} /></Field>
        <Field label="Ship USD"><input className="input" type="number" step="0.01" value={f.shippingUsd} onChange={e => set('shippingUsd', e.target.value)} /></Field>
        <Field label="Tax USD"><input className="input" type="number" step="0.01" value={f.taxUsd} onChange={e => set('taxUsd', e.target.value)} /></Field>
        <Field label="Rate"><input className="input" type="number" step="0.01" value={f.exchangeRateApplied} onChange={e => set('exchangeRateApplied', e.target.value)} /></Field>
      </div>
      <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
        Total USD: <b>{fmtUSD(totalUsd)}</b> · Total INR: <b style={{ color: 'var(--accent)' }}>{fmtINR(totalInr)}</b>
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Create" />
    </ModalShell>
  );
}

function NewShipmentModal({ onClose, onSaved }) {
  const [number, setNumber] = useState('');
  const [date, setDate]     = useState(today());
  const [billed, setBilled] = useState('');
  const [actual, setActual] = useState('');
  const [shipCost, setShipCost] = useState('');
  const [customs, setCustoms] = useState(0);
  const [other, setOther] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { finoAiNextShipmentNumber().then(r => setNumber(r.data.shipment_number)).catch(() => {}); }, []);
  const dead = (Number(billed) || 0) - (Number(actual) || 0);
  const cpgB = Number(billed) > 0 ? (Number(shipCost) || 0) / (Number(billed) * 1000) : 0;
  const cpgA = Number(actual) > 0 ? (Number(shipCost) || 0) / (Number(actual) * 1000) : 0;
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!(Number(billed) > 0)) throw new Error('Billed weight > 0');
      if (!(Number(actual) > 0)) throw new Error('Actual weight > 0');
      if (Number(actual) > Number(billed) + 0.001) throw new Error('Actual cannot exceed billed');
      if (!(Number(shipCost) >= 0)) throw new Error('Shipping cost >= 0');
      await finoAiCreateShipment({
        shipmentNumber: number || undefined, shipDate: date,
        billedWeightKg: Number(billed), actualWeightKg: Number(actual),
        shippingCostInr: Number(shipCost), customsDutyInr: Number(customs) || 0, otherChargesInr: Number(other) || 0,
        notes: notes || undefined,
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title="New Shipment" onClose={onClose} maxWidth={520}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Ship #"><input className="input" value={number} onChange={e => setNumber(e.target.value)} /></Field>
        <Field label="Ship Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Billed (kg)"><input className="input" type="number" step="0.01" value={billed} onChange={e => setBilled(e.target.value)} /></Field>
        <Field label="Actual (kg)"><input className="input" type="number" step="0.01" value={actual} onChange={e => setActual(e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Shipping (₹)"><input className="input" type="number" step="0.01" value={shipCost} onChange={e => setShipCost(e.target.value)} /></Field>
        <Field label="Customs (₹)"><input className="input" type="number" step="0.01" value={customs} onChange={e => setCustoms(e.target.value)} /></Field>
        <Field label="Other (₹)"><input className="input" type="number" step="0.01" value={other} onChange={e => setOther(e.target.value)} /></Field>
      </div>
      <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
        Dead weight: <b style={{ color: '#f59e0b' }}>{dead.toFixed(2)} kg</b>
        {' · '}Cost/g (billed): <b>₹{cpgB.toFixed(4)}</b>
        {' · '}Cost/g (actual): <b style={{ color: 'var(--accent)' }}>₹{cpgA.toFixed(4)}</b>
      </div>
      <Field label="Notes"><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      <ErrBox msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Create" />
    </ModalShell>
  );
}

function ShipmentDetailModal({ shipmentId, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [linkOrderId, setLinkOrderId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const reload = useCallback(async () => {
    try {
      const r = await finoAiGetShipment(shipmentId);
      setData(r.data);
      const all = await finoAiListOrders();
      setOrders((all.data.orders || []).filter(o => !o.shipment_id));
    } catch (_) {}
  }, [shipmentId]);
  useEffect(() => { reload(); }, [reload]);

  const linkOrder = async () => {
    if (!linkOrderId) return;
    try { await finoAiLinkOrder(shipmentId, linkOrderId); setLinkOrderId(''); reload(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); }
  };
  const allocate = async () => {
    setSaving(true);
    try { await finoAiAllocate(shipmentId); reload(); onSaved && (await Promise.resolve()); }
    catch (e) { setErr(e?.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };
  const markRecv = async () => {
    try { await finoAiShipmentReceived(shipmentId, { receivedDate: today() }); reload(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); }
  };

  if (!data) return <ModalShell title="Loading…" onClose={onClose}><div className="spinner" /></ModalShell>;
  const { shipment, orders: linked } = data;

  return (
    <ModalShell title={`Shipment ${shipment.shipment_number}`} onClose={onClose} maxWidth={760}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 14 }}>
        <SummaryCard label="Billed" value={`${Number(shipment.billed_weight_kg).toFixed(2)} kg`} />
        <SummaryCard label="Actual" value={`${Number(shipment.actual_weight_kg).toFixed(2)} kg`} />
        <SummaryCard label="Dead Weight" value={`${Number(shipment.dead_weight_kg).toFixed(2)} kg`} fg="#f59e0b" />
        <SummaryCard label="Total Cost" value={fmtINR(shipment.total_landed_cost_inr)} />
        <SummaryCard label="Cost/g (billed)" value={`₹${Number(shipment.cost_per_gram_billed).toFixed(4)}`} />
        <SummaryCard label="Cost/g (actual)" value={`₹${Number(shipment.cost_per_gram_actual).toFixed(4)}`} fg="var(--accent)" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select className="input" value={linkOrderId} onChange={e => setLinkOrderId(e.target.value)} style={{ flex: 1 }}>
          <option value="">— Pick an order to link —</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.order_number || o.item_name} · {o.item_qty} × {o.item_name} · {fmtUSD(o.total_usd)}</option>)}
        </select>
        <button className="btn btn-sm" onClick={linkOrder} disabled={!linkOrderId}>Link <ArrowRight size={12} /></button>
        <button className="btn btn-sm btn-primary" onClick={allocate} disabled={saving || (linked.length === 0)}>Allocate Costs</button>
        {shipment.received_status === 'in_transit' && <button className="btn btn-sm" onClick={markRecv}>Mark Received</button>}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
        Linked orders ({linked.length})
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {linked.length === 0 ? (
          <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>No orders linked yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead><tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
              <th style={{ padding: '6px 10px' }}>Item</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Qty</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Item Wt (g)</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Order INR</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Alloc Ship</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Alloc Customs</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Landed</th>
            </tr></thead>
            <tbody>
              {linked.map(o => (
                <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 10px' }}>{o.item_name}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{o.item_qty}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{o.item?.weight_grams || '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtINR(o.total_inr)}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtINR(o.allocated_shipping_inr || 0)}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtINR(o.allocated_customs_inr || 0)}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtINR(o.landed_cost_inr || o.total_inr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ErrBox msg={err} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Close</button>
      </div>
    </ModalShell>
  );
}
