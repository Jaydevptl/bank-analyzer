import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, X, CreditCard, ShoppingCart, Gift, Banknote, FileText,
  Pencil, Trash2, AlertTriangle, Coins, Receipt,
} from 'lucide-react';
import {
  finoListCC, finoGetCC, finoCreateCC, finoUpdateCC, finoDeleteCC,
  finoCcTxn, finoDeleteCcTxn, finoCcPoints,
  finoCcPayment, finoDeleteCcPayment,
  finoCcStatement, finoUpdateCcStmt, finoDeleteCcStmt,
  finoCcDashboard,
  finoListBanks, finoListParties, finoCreateParty,
} from '../../services/api';
import EditModal from '../shared/EditModal';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_COLORS = {
  active:    { bg: 'rgba(59,130,246,0.10)', c: 'var(--info)' },
  inactive:  { bg: 'rgba(100,100,100,0.15)', c: 'var(--text-muted)' },
  closed:    { bg: 'rgba(239,68,68,0.10)',  c: 'var(--danger)' },
  deleted:   { bg: 'rgba(239,68,68,0.10)',  c: 'var(--danger)' },
};
const TXN_COLORS = {
  spend:         { bg: 'rgba(239,68,68,0.10)', c: 'var(--danger)' },
  refund:        { bg: 'rgba(34,197,94,0.10)', c: 'var(--success)' },
  cashback:      { bg: 'rgba(34,197,94,0.10)', c: 'var(--success)' },
  reward_points: { bg: 'rgba(139,92,246,0.10)', c: '#8B5CF6' },
  interest:      { bg: 'rgba(245,158,11,0.10)', c: 'var(--warning)' },
  fee:           { bg: 'rgba(245,158,11,0.10)', c: 'var(--warning)' },
};
const NETWORK_OPTS  = ['visa', 'mastercard', 'amex', 'rupay', 'diners', 'other'];
const REWARD_OPTS   = ['cashback', 'points', 'miles'];
const EXPENSE_CODES = [
  { code: '5700', label: 'Misc Expense' },
  { code: '5500', label: 'Marketing / Ads' },
  { code: '5600', label: 'Office Expense' },
  { code: '5210', label: 'Cash Conversion Charge' },
  { code: '5220', label: 'Bank Charges / Fees' },
  { code: '5230', label: 'Shipping' },
  { code: '5240', label: 'Custom Duty' },
  { code: '5300', label: 'Salary' },
  { code: '5400', label: 'Office Rent' },
  { code: '5100', label: 'Purchases' },
];

export default function CreditCardsPage() {
  const [cards, setCards]       = useState([]);
  const [dashboard, setDash]    = useState(null);
  const [selId, setSelId]       = useState(null);
  const [detail, setDetail]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('transactions');
  const [modal, setModal]       = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [l, d] = await Promise.all([finoListCC(), finoCcDashboard()]);
      setCards(l.data.cards || []);
      setDash(d.data);
      if (!selId && l.data.cards?.length) setSelId(l.data.cards[0].id);
    } finally { setLoading(false); }
  }, [selId]);

  const loadDetail = useCallback((id) => {
    if (!id) return setDetail(null);
    finoGetCC(id).then(({ data }) => setDetail(data));
  }, []);

  useEffect(() => { reload(); }, []);
  useEffect(() => { loadDetail(selId); }, [selId, loadDetail]);

  const onSaved = () => { setModal(null); reload(); loadDetail(selId); };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Credit Cards</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setModal('new')}>
          <Plus size={13} /> Add Card
        </button>
      </div>

      {/* Dashboard summary */}
      {dashboard && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Active Cards" value={dashboard.total_active_cards} />
          <SummaryCard label="Total Limit"     value={fmt(dashboard.total_credit_limit)} />
          <SummaryCard label="Outstanding"     value={fmt(dashboard.total_outstanding)} color="var(--warning)" />
          <SummaryCard label="Cashback YTD"    value={fmt(dashboard.total_cashback_ytd)} color="var(--success)" />
          <SummaryCard label="Rewards YTD ₹"   value={fmt(dashboard.total_rewards_ytd)} color="#8B5CF6" />
          {dashboard.due_this_week.length > 0 && (
            <SummaryCard label="Due This Week" value={`${dashboard.due_this_week.length} card(s)`} color="var(--warning)" icon={<AlertTriangle size={14} />} />
          )}
          {dashboard.overdue.length > 0 && (
            <SummaryCard label="Overdue" value={`${dashboard.overdue.length} card(s)`} color="var(--danger)" icon={<AlertTriangle size={14} />} />
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 320px)' }}>
        <aside style={{ width: 320, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
            Cards ({cards.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? <div className="spinner" style={{ margin: '40px auto' }} /> : cards.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No credit cards yet.</div>
            ) : cards.map(c => {
              const active = selId === c.id;
              const sc = STATUS_COLORS[c.status] || STATUS_COLORS.active;
              const util = Number(c.credit_limit) > 0 ? (Number(c.current_outstanding) / Number(c.credit_limit)) * 100 : 0;
              const utilColor = util > 70 ? 'var(--danger)' : util > 30 ? 'var(--warning)' : 'var(--success)';
              return (
                <button key={c.id} onClick={() => setSelId(c.id)} style={{
                  width: '100%', padding: '12px 14px', border: 'none', cursor: 'pointer',
                  background: active ? 'var(--bg-hover)' : 'transparent',
                  borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                  textAlign: 'left', borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>
                      <CreditCard size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                      {c.card_label}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: Number(c.current_outstanding) > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {fmt(c.current_outstanding)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {c.bank_name}{c.card_number_last4 ? ` ····${c.card_number_last4}` : ''}{c.holder ? ` · ${c.holder.name}` : ''}
                    </span>
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, fontWeight: 600, background: sc.bg, color: sc.c }}>
                      {c.status}
                    </span>
                  </div>
                  {Number(c.credit_limit) > 0 && (
                    <div style={{ height: 3, background: 'var(--bg-page)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, util)}%`, height: '100%', background: utilColor }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <section style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!detail ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
              {cards.length === 0 ? 'Add a credit card to begin.' : 'Select a card on the left.'}
            </div>
          ) : (
            <CardDetail data={detail} tab={tab} setTab={setTab} onAct={(action) => setModal(action)} />
          )}
        </section>
      </div>

      {modal === 'new' && <NewCardModal onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'spend'    && detail && <TxnModal kind="spend"    card={detail.card} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'refund'   && detail && <TxnModal kind="refund"   card={detail.card} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'cashback' && detail && <TxnModal kind="cashback" card={detail.card} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'interest' && detail && <TxnModal kind="interest" card={detail.card} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'fee'      && detail && <TxnModal kind="fee"      card={detail.card} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'points'   && detail && <PointsModal card={detail.card} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'pay'      && detail && <PayModal card={detail.card} statements={detail.statements} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'statement'&& detail && <StatementModal card={detail.card} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'edit'     && detail && (
        <EditModal title={`Edit ${detail.card.card_label}`}
          fields={[
            { key: 'cardLabel',       label: 'Label' },
            { key: 'cardNumberLast4', label: 'Last 4' },
            { key: 'creditLimit',     label: 'Credit Limit', type: 'number' },
            { key: 'statementDay',    label: 'Statement Day (1-31)', type: 'number' },
            { key: 'dueDay',          label: 'Due Day (1-31)', type: 'number' },
            { key: 'pointValueInr',   label: 'Point Value INR', type: 'number' },
            { key: 'notes',           label: 'Notes', type: 'textarea' },
          ]}
          initialValues={{
            cardLabel: detail.card.card_label,
            cardNumberLast4: detail.card.card_number_last4 || '',
            creditLimit: detail.card.credit_limit ?? '',
            statementDay: detail.card.statement_day ?? '',
            dueDay: detail.card.due_day ?? '',
            pointValueInr: detail.card.point_value_inr ?? 0,
            notes: detail.card.notes || '',
          }}
          onClose={() => setModal(null)}
          onSubmit={(patch) => finoUpdateCC(detail.card.id, patch).then(onSaved)}
        />
      )}
      {modal === 'delete' && detail && (
        <DeleteConfirmModal title={`Delete ${detail.card.card_label}`}
          description="Reverses every transaction (spend/refund/cashback/interest/fee) and every payment linked to this card. Statements + rewards are hidden. Bank balances re-sync."
          confirmLabel="Delete & Reverse"
          onClose={() => setModal(null)}
          onConfirm={(reason) => finoDeleteCC(detail.card.id, reason).then(() => { setSelId(null); onSaved(); })}
        />
      )}
      {modal?.kind === 'deleteTxn' && (
        <DeleteConfirmModal title="Reverse Transaction"
          description={`Reverses ${modal.row.txn_type} of ${fmt(modal.row.amount)}. Card outstanding will adjust.`}
          confirmLabel="Reverse"
          onClose={() => setModal(null)}
          onConfirm={(reason) => finoDeleteCcTxn(modal.row.id, reason).then(onSaved)}
        />
      )}
      {modal?.kind === 'deletePay' && (
        <DeleteConfirmModal title="Reverse Payment"
          description={`Reverses payment of ${fmt(modal.row.amount)}. Card outstanding ↑, bank balance ↑.`}
          confirmLabel="Reverse"
          onClose={() => setModal(null)}
          onConfirm={(reason) => finoDeleteCcPayment(modal.row.id, reason).then(onSaved)}
        />
      )}
      {modal?.kind === 'deleteStmt' && (
        <DeleteConfirmModal title="Delete Statement"
          description="Statements are summary-only — no ledger entries to reverse. Linked payments stay (unlinked from this statement)."
          confirmLabel="Delete"
          onClose={() => setModal(null)}
          onConfirm={(reason) => finoDeleteCcStmt(modal.row.id, reason).then(onSaved)}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, icon }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || 'var(--text-primary)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

// ─── Detail panel ────────────────────────────────────────────────────────────
function CardDetail({ data, tab, setTab, onAct }) {
  const { card, transactions, payments, statements, rewards } = data;
  const sc = STATUS_COLORS[card.status] || STATUS_COLORS.active;
  const util = Number(card.credit_limit) > 0 ? (Number(card.current_outstanding) / Number(card.credit_limit)) * 100 : 0;
  const utilColor = util > 70 ? 'var(--danger)' : util > 30 ? 'var(--warning)' : 'var(--success)';
  const canAct = !['deleted', 'cancelled'].includes(card.status);

  return (
    <>
      <div style={{ padding: 18, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CreditCard size={18} />
              {card.card_label}
              <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 12, fontWeight: 600, background: sc.bg, color: sc.c }}>
                {card.status}
              </span>
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {card.bank_name}
              {card.card_network ? ` · ${card.card_network.toUpperCase()}` : ''}
              {card.card_number_last4 ? ` · ····${card.card_number_last4}` : ''}
              {card.holder ? ` · ${card.holder.name}` : ''}
              {card.statement_day ? ` · Stmt ${card.statement_day}` : ''}
              {card.due_day ? ` · Due ${card.due_day}` : ''}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
              <Stat label="Credit Limit"  value={fmt(card.credit_limit)} />
              <Stat label="Outstanding"   value={fmt(card.current_outstanding)} highlight color={Number(card.current_outstanding) > 0 ? 'var(--danger)' : 'var(--success)'} />
              <Stat label="Cashback YTD"  value={fmt(card.total_cashback_ytd)} small color="var(--success)" />
              <Stat label="Rewards YTD"   value={fmt(card.total_rewards_ytd)} small color="#8B5CF6" />
            </div>
            {Number(card.credit_limit) > 0 && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 6, background: 'var(--bg-page)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, util)}%`, height: '100%', background: utilColor }} />
                </div>
                <span style={{ fontSize: 11, color: utilColor, fontWeight: 700 }}>{util.toFixed(1)}%</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 360 }}>
            {canAct && (
              <>
                <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }} onClick={() => onAct('spend')}>
                  <ShoppingCart size={13} /> Spend
                </button>
                <button className="btn btn-sm" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--success)' }} onClick={() => onAct('cashback')}>
                  <Gift size={13} /> Cashback
                </button>
                <button className="btn btn-sm" onClick={() => onAct('points')} style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>
                  <Coins size={13} /> Points
                </button>
                <button className="btn btn-sm" onClick={() => onAct('refund')}>
                  <Receipt size={13} /> Refund
                </button>
                <button className="btn btn-sm" onClick={() => onAct('interest')}>Interest</button>
                <button className="btn btn-sm" onClick={() => onAct('fee')}>Fee</button>
                <button className="btn btn-sm btn-primary" onClick={() => onAct('pay')}>
                  <Banknote size={13} /> Pay
                </button>
                <button className="btn btn-sm" onClick={() => onAct('statement')}>
                  <FileText size={13} /> Stmt
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 14px 0', borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'transactions', label: `Transactions (${transactions.length})` },
          { id: 'statements',   label: `Statements (${statements.length})` },
          { id: 'payments',     label: `Payments (${payments.length})` },
          { id: 'rewards',      label: `Rewards (${rewards.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '6px 12px', border: 'none', cursor: 'pointer',
            background: tab === t.id ? 'var(--bg-page)' : 'transparent',
            borderRadius: '6px 6px 0 0',
            fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {tab === 'transactions' && <TransactionsTab rows={transactions} onAct={onAct} />}
        {tab === 'statements'   && <StatementsTab rows={statements} onAct={onAct} />}
        {tab === 'payments'     && <PaymentsTab rows={payments} onAct={onAct} />}
        {tab === 'rewards'      && <RewardsTab rows={rewards} />}
      </div>
    </>
  );
}

function TransactionsTab({ rows, onAct }) {
  if (rows.length === 0) return <Empty>No transactions yet.</Empty>;
  return (
    <table style={{ width: '100%', fontSize: 12 }}>
      <thead><Tr h={['Date', 'Description', 'Type', 'Amount', '']} /></thead>
      <tbody>
        {rows.map(r => {
          const tc = TXN_COLORS[r.txn_type] || TXN_COLORS.spend;
          return (
            <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: 8 }}>{r.txn_date}</td>
              <td style={{ padding: 8 }}>{r.description}</td>
              <td style={{ padding: 8 }}>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 600, background: tc.bg, color: tc.c }}>
                  {r.txn_type}
                </span>
              </td>
              <td style={{ padding: 8, textAlign: 'right', fontWeight: 600, color: tc.c }}>
                {(['refund','cashback'].includes(r.txn_type) ? '−' : '')}{fmt(r.amount)}
              </td>
              <td style={{ padding: 8, textAlign: 'right' }}>
                <RowMenu items={[
                  { label: 'Reverse', icon: <Trash2 size={12} />, danger: true,
                    onClick: () => onAct({ kind: 'deleteTxn', row: r }) },
                ]} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
function StatementsTab({ rows, onAct }) {
  if (rows.length === 0) return <Empty>No statements yet.</Empty>;
  return (
    <table style={{ width: '100%', fontSize: 12 }}>
      <thead><Tr h={['Period', 'Stmt Date', 'Due', 'Closing', 'Total Due', 'Paid', 'Status', '']} /></thead>
      <tbody>
        {rows.map(s => (
          <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={{ padding: 8 }}>{s.statement_period}</td>
            <td style={{ padding: 8 }}>{s.statement_date}</td>
            <td style={{ padding: 8 }}>{s.due_date}</td>
            <td style={{ padding: 8, textAlign: 'right' }}>{fmt(s.closing_balance)}</td>
            <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{fmt(s.total_amount_due)}</td>
            <td style={{ padding: 8, textAlign: 'right' }}>{fmt(s.paid_amount)}</td>
            <td style={{ padding: 8 }}>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                background: s.payment_status === 'paid' ? 'rgba(34,197,94,0.10)' :
                            s.payment_status === 'overdue' ? 'rgba(239,68,68,0.10)' :
                            s.payment_status === 'partial' ? 'rgba(245,158,11,0.10)' : 'rgba(100,100,100,0.15)',
                color: s.payment_status === 'paid' ? 'var(--success)' :
                       s.payment_status === 'overdue' ? 'var(--danger)' :
                       s.payment_status === 'partial' ? 'var(--warning)' : 'var(--text-muted)',
              }}>{s.payment_status}</span>
            </td>
            <td style={{ padding: 8, textAlign: 'right' }}>
              <RowMenu items={[
                { label: 'Delete', icon: <Trash2 size={12} />, danger: true,
                  onClick: () => onAct({ kind: 'deleteStmt', row: s }) },
              ]} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function PaymentsTab({ rows, onAct }) {
  if (rows.length === 0) return <Empty>No payments yet.</Empty>;
  return (
    <table style={{ width: '100%', fontSize: 12 }}>
      <thead><Tr h={['Date', 'Amount', 'Notes', '']} /></thead>
      <tbody>
        {rows.map(p => (
          <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={{ padding: 8 }}>{p.payment_date}</td>
            <td style={{ padding: 8, textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>−{fmt(p.amount)}</td>
            <td style={{ padding: 8 }}>{p.notes || '—'}</td>
            <td style={{ padding: 8, textAlign: 'right' }}>
              <RowMenu items={[
                { label: 'Reverse', icon: <Trash2 size={12} />, danger: true,
                  onClick: () => onAct({ kind: 'deletePay', row: p }) },
              ]} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function RewardsTab({ rows }) {
  if (rows.length === 0) return <Empty>No rewards yet.</Empty>;
  return (
    <table style={{ width: '100%', fontSize: 12 }}>
      <thead><Tr h={['Date', 'Type', 'Raw', 'INR Value', 'Status']} /></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={{ padding: 8 }}>{r.earn_date}</td>
            <td style={{ padding: 8 }}>{r.reward_type}</td>
            <td style={{ padding: 8, textAlign: 'right' }}>{r.raw_amount}</td>
            <td style={{ padding: 8, textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>{fmt(r.inr_value)}</td>
            <td style={{ padding: 8 }}>{r.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tr({ h }) {
  return (
    <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
      {h.map((x, i) => <th key={i} style={{ padding: '6px 8px', textAlign: i === h.length - 1 ? 'right' : (typeof x === 'string' && /Amount|Due|INR|Closing|Raw|Paid/.test(x) ? 'right' : 'left') }}>{x}</th>)}
    </tr>
  );
}
function Empty({ children }) {
  return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{children}</div>;
}
function Stat({ label, value, highlight, small, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: small ? 13 : (highlight ? 18 : 14), fontWeight: highlight ? 800 : 600, color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

// ─── Modal primitives ────────────────────────────────────────────────────────
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
function Err({ msg }) { return msg ? <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginTop: 8 }}>{msg}</div> : null; }
function Buttons({ onCancel, onSave, saving, label = 'Save' }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
      <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel}>Cancel</button>
      <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : label}
      </button>
    </div>
  );
}

// ─── New Card Modal ──────────────────────────────────────────────────────────
function NewCardModal({ onClose, onSaved }) {
  const [banks, setBanks] = useState([]);
  const [f, setF] = useState({
    cardLabel: '', cardHolderPartyId: '', holderName: '',
    bankName: '', cardNetwork: 'visa', cardNumberLast4: '',
    creditLimit: '', statementDay: '', dueDay: '',
    defaultPaymentBankId: '', rewardProgram: 'cashback', pointValueInr: 0,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  useEffect(() => { finoListBanks().then(({ data }) => setBanks(data.accounts || [])); }, []);

  const submit = async () => {
    setErr(null);
    if (!f.cardLabel.trim() || !f.bankName.trim()) return setErr('Card label + bank name required');
    if (['points', 'miles'].includes(f.rewardProgram) && !(Number(f.pointValueInr) > 0)) return setErr('Set point value INR > 0 for points/miles');
    setSaving(true);
    try {
      await finoCreateCC({
        ...f,
        creditLimit: Number(f.creditLimit) || null,
        statementDay: Number(f.statementDay) || null,
        dueDay: Number(f.dueDay) || null,
        pointValueInr: Number(f.pointValueInr) || 0,
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <Modal title="Add Credit Card" onClose={onClose}>
      <Field label="Card Label *"><input className="input" value={f.cardLabel} onChange={e => set('cardLabel', e.target.value)} placeholder="HDFC Millennia - Jaydev" /></Field>
      <Field label="Card Holder">
        <CardHolderPicker value={f.cardHolderPartyId} name={f.holderName}
          onChange={(id, name) => { set('cardHolderPartyId', id); set('holderName', name); }} />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Bank *"><input className="input" value={f.bankName} onChange={e => set('bankName', e.target.value)} placeholder="HDFC" /></Field>
        <Field label="Network">
          <select className="input" value={f.cardNetwork} onChange={e => set('cardNetwork', e.target.value)}>
            {NETWORK_OPTS.map(o => <option key={o}>{o}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Last 4"><input className="input" maxLength={4} value={f.cardNumberLast4} onChange={e => set('cardNumberLast4', e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Credit Limit (₹)"><input className="input" type="number" step="0.01" value={f.creditLimit} onChange={e => set('creditLimit', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Statement Day"><input className="input" type="number" min="1" max="31" value={f.statementDay} onChange={e => set('statementDay', e.target.value)} /></Field>
        <Field label="Due Day"><input className="input" type="number" min="1" max="31" value={f.dueDay} onChange={e => set('dueDay', e.target.value)} /></Field>
      </div>
      <Field label="Default Payment Bank">
        <select className="input" value={f.defaultPaymentBankId} onChange={e => set('defaultPaymentBankId', e.target.value)}>
          <option value="">— none —</option>
          {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Reward Program">
          <select className="input" value={f.rewardProgram} onChange={e => set('rewardProgram', e.target.value)}>
            {REWARD_OPTS.map(o => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Point Value (₹)"><input className="input" type="number" step="0.0001" value={f.pointValueInr} onChange={e => set('pointValueInr', e.target.value)} /></Field>
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <Err msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Add Card" />
    </Modal>
  );
}

function CardHolderPicker({ value, name, onChange }) {
  const [query, setQuery] = useState(name || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      finoListParties({ role: 'card_holder', search: query || undefined })
        .then(({ data }) => setResults(data.parties || []))
        .catch(() => finoListParties({ search: query || undefined }).then(({ data }) => setResults(data.parties || [])));
    }, 150);
    return () => clearTimeout(t);
  }, [query, open]);

  const pick = (p) => { onChange(p.id, p.name); setQuery(p.name); setOpen(false); };
  const create = async () => {
    if (!query.trim()) return;
    setCreating(true);
    try {
      const { data } = await finoCreateParty({ name: query.trim(), isCardHolder: true });
      pick(data.party);
    } finally { setCreating(false); }
  };

  return (
    <div style={{ position: 'relative' }}>
      <input className="input" value={query} placeholder="Type holder name..."
        onChange={e => { setQuery(e.target.value); setOpen(true); onChange('', e.target.value); }}
        onFocus={() => setOpen(true)} />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 110,
          background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
          marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {results.map(p => (
            <button key={p.id} onClick={() => pick(p)} style={{
              width: '100%', padding: '8px 12px', border: 'none', cursor: 'pointer',
              background: 'transparent', textAlign: 'left', fontSize: 12, color: 'var(--text-primary)',
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              {p.name}
            </button>
          ))}
          {query.trim() && !results.some(r => r.name.toLowerCase() === query.trim().toLowerCase()) && (
            <button onClick={create} disabled={creating} style={{
              width: '100%', padding: '8px 12px', border: 'none', cursor: 'pointer',
              background: 'var(--bg-page)', textAlign: 'left', fontSize: 12,
              color: 'var(--accent)', borderTop: '1px solid var(--border)',
            }}>
              {creating ? 'Creating…' : `+ Add "${query.trim()}" as new holder`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Txn modal (spend/refund/cashback/interest/fee) ──────────────────────────
function TxnModal({ kind, card, onClose, onSaved }) {
  const isCashback = kind === 'cashback';
  const isInterest = kind === 'interest';
  const isFee = kind === 'fee';
  const isExpenseLike = kind === 'spend' || kind === 'refund';

  const [f, setF] = useState({
    txnDate: today(), amount: '', description: '',
    expenseCategoryCode: kind === 'fee' ? '5220' : '5700',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null);
    const amt = Number(f.amount);
    if (!(amt > 0)) return setErr('Amount > 0');
    setSaving(true);
    try {
      await finoCcTxn(card.id, { ...f, amount: amt, txnType: kind });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  const titles = { spend: 'Record Spend', refund: 'Record Refund', cashback: 'Record Cashback', interest: 'Record Interest', fee: 'Record Fee' };

  return (
    <Modal title={`${titles[kind]} · ${card.card_label}`} onClose={onClose}>
      <div style={{ background: 'var(--bg-page)', padding: 8, borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
        Outstanding: <b>{fmt(card.current_outstanding)}</b>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Date"><input className="input" type="date" value={f.txnDate} onChange={e => set('txnDate', e.target.value)} /></Field>
        <Field label="Amount (₹) *"><input className="input" type="number" step="0.01" autoFocus value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
      </div>
      <Field label="Description"><input className="input" value={f.description} onChange={e => set('description', e.target.value)} placeholder={isCashback ? 'Cashback credit' : isInterest ? 'Interest charge' : isFee ? 'Annual fee' : 'Merchant / purpose'} /></Field>
      {isExpenseLike && (
        <Field label="Expense Category">
          <select className="input" value={f.expenseCategoryCode} onChange={e => set('expenseCategoryCode', e.target.value)}>
            {EXPENSE_CODES.map(o => <option key={o.code} value={o.code}>{o.label} ({o.code})</option>)}
          </select>
        </Field>
      )}
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <Err msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label={titles[kind].split(' ')[1]} />
    </Modal>
  );
}

// ─── Points modal (no ledger) ────────────────────────────────────────────────
function PointsModal({ card, onClose, onSaved }) {
  const [f, setF] = useState({ earnDate: today(), points: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const inrPreview = useMemo(() => {
    return (Number(f.points) || 0) * Number(card.point_value_inr || 0);
  }, [f.points, card.point_value_inr]);

  const submit = async () => {
    setErr(null);
    const pts = Number(f.points);
    if (!(pts > 0)) return setErr('Points > 0');
    if (!(Number(card.point_value_inr) > 0)) return setErr('Card has no point value INR set; edit card first');
    setSaving(true);
    try { await finoCcPoints(card.id, { earnDate: f.earnDate, points: pts }); onSaved(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <Modal title={`Add Reward Points · ${card.card_label}`} onClose={onClose}>
      <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
        Point value: <b>₹{Number(card.point_value_inr || 0).toFixed(4)}</b> per point
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Date"><input className="input" type="date" value={f.earnDate} onChange={e => set('earnDate', e.target.value)} /></Field>
        <Field label="Points *"><input className="input" type="number" step="1" value={f.points} onChange={e => set('points', e.target.value)} /></Field>
      </div>
      {Number(f.points) > 0 && (
        <div style={{ background: 'rgba(139,92,246,0.10)', padding: 8, borderRadius: 6, fontSize: 12, color: '#8B5CF6', marginBottom: 8 }}>
          INR value: <b>{fmt(inrPreview)}</b>
        </div>
      )}
      <Err msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Record Points" />
    </Modal>
  );
}

// ─── Pay modal ───────────────────────────────────────────────────────────────
function PayModal({ card, statements, onClose, onSaved }) {
  const [banks, setBanks] = useState([]);
  const [f, setF] = useState({
    paymentDate: today(), amount: '',
    paidViaBankId: card.default_payment_bank_id || '',
    linkedStatementId: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  useEffect(() => {
    finoListBanks().then(({ data }) => {
      setBanks(data.accounts || []);
      if (!f.paidViaBankId && data.accounts?.[0]) set('paidViaBankId', data.accounts[0].id);
    });
  }, []);

  const unpaidStmts = statements.filter(s => s.payment_status !== 'paid');

  const submit = async () => {
    setErr(null);
    const amt = Number(f.amount);
    if (!(amt > 0)) return setErr('Amount > 0');
    if (!f.paidViaBankId) return setErr('Select bank');
    setSaving(true);
    try { await finoCcPayment(card.id, { ...f, amount: amt, linkedStatementId: f.linkedStatementId || null }); onSaved(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <Modal title={`Pay ${card.card_label}`} onClose={onClose}>
      <div style={{ background: 'var(--bg-page)', padding: 8, borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
        Outstanding: <b>{fmt(card.current_outstanding)}</b>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Date"><input className="input" type="date" value={f.paymentDate} onChange={e => set('paymentDate', e.target.value)} /></Field>
        <Field label="Amount (₹) *"><input className="input" type="number" step="0.01" autoFocus value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
      </div>
      <Field label="Paid Via *">
        <select className="input" value={f.paidViaBankId} onChange={e => set('paidViaBankId', e.target.value)}>
          <option value="">— select bank —</option>
          {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
        </select>
      </Field>
      {unpaidStmts.length > 0 && (
        <Field label="Link to Statement (optional)">
          <select className="input" value={f.linkedStatementId} onChange={e => set('linkedStatementId', e.target.value)}>
            <option value="">— none —</option>
            {unpaidStmts.map(s => <option key={s.id} value={s.id}>{s.statement_period} · due {s.due_date} · {fmt(s.total_amount_due)}</option>)}
          </select>
        </Field>
      )}
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <Err msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Pay" />
    </Modal>
  );
}

// ─── Statement modal ─────────────────────────────────────────────────────────
function StatementModal({ card, onClose, onSaved }) {
  const [f, setF] = useState({
    statementPeriod: '', statementDate: today(), dueDate: today(),
    openingBalance: 0, totalSpend: 0, totalPayment: 0,
    totalCashback: 0, totalInterest: 0, totalFees: 0,
    closingBalance: 0, minAmountDue: 0, totalAmountDue: 0,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null);
    if (!f.statementPeriod.trim()) return setErr('Statement period required (e.g. "Apr 2026")');
    setSaving(true);
    try { await finoCcStatement(card.id, f); onSaved(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  const fields = [
    ['openingBalance','Opening'],['totalSpend','Total Spend'],['totalPayment','Total Payment'],
    ['totalCashback','Cashback'],['totalInterest','Interest'],['totalFees','Fees'],
    ['closingBalance','Closing'],['minAmountDue','Min Due'],['totalAmountDue','Total Due'],
  ];

  return (
    <Modal title={`Add Statement · ${card.card_label}`} onClose={onClose} width={560}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Period *"><input className="input" value={f.statementPeriod} onChange={e => set('statementPeriod', e.target.value)} placeholder="Apr 2026" /></Field>
        <Field label="Statement Date"><input className="input" type="date" value={f.statementDate} onChange={e => set('statementDate', e.target.value)} /></Field>
        <Field label="Due Date"><input className="input" type="date" value={f.dueDate} onChange={e => set('dueDate', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {fields.map(([k, label]) => (
          <Field key={k} label={label}>
            <input className="input" type="number" step="0.01" value={f[k]} onChange={e => set(k, e.target.value)} />
          </Field>
        ))}
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <Err msg={err} />
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Add Statement" />
    </Modal>
  );
}
