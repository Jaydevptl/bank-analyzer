import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, X, TrendingUp, TrendingDown, Trash2, RefreshCw, AlertCircle } from 'lucide-react';
import {
  finoSmListBrokers, finoSmCreateBroker,
  finoSmListAccounts, finoSmGetAccount, finoSmCreateAccount, finoSmDeleteAccount,
  finoSmBuy, finoSmSell, finoSmDividend, finoSmDeleteTxn,
  finoSmUpdatePrice, finoSmBulkUpdatePrices,
  finoSmPnL, finoSmDashboard,
  finoListBanks,
} from '../../services/api';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmt   = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtN  = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

export default function ShareMarketPage() {
  const [accounts, setAccounts] = useState([]);
  const [dashboard, setDash]    = useState(null);
  const [selId, setSelId]       = useState(null);
  const [detail, setDetail]     = useState(null);
  const [tab, setTab]           = useState('holdings');
  const [modal, setModal]       = useState(null);
  const [pnlData, setPnlData]   = useState(null);

  const reload = useCallback(async () => {
    try {
      const [a, d] = await Promise.all([finoSmListAccounts(), finoSmDashboard()]);
      setAccounts(a.data.accounts || []);
      setDash(d.data);
      if (!selId && a.data.accounts?.length) setSelId(a.data.accounts[0].id);
    } catch (_) {}
  }, [selId]);

  const loadDetail = useCallback((id) => {
    if (!id) return setDetail(null);
    finoSmGetAccount(id).then(({ data }) => setDetail(data)).catch(() => setDetail(null));
  }, []);

  useEffect(() => { reload(); }, []);
  useEffect(() => { loadDetail(selId); }, [selId, loadDetail]);

  useEffect(() => {
    if (tab === 'pnl' && selId) {
      finoSmPnL(selId).then(r => setPnlData(r.data)).catch(() => setPnlData(null));
    }
  }, [tab, selId]);

  const onSaved = () => { setModal(null); reload(); loadDetail(selId); };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Share Market</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'newAccount' })}>
          <Plus size={13} /> Add Account
        </button>
      </div>

      {dashboard && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Accounts" value={dashboard.total_accounts} />
          <SummaryCard label="Invested" value={fmt(dashboard.total_invested)} />
          <SummaryCard label="Current Value" value={fmt(dashboard.total_current_value)} />
          <SummaryCard label="Unrealized P&L" value={fmt(dashboard.total_unrealized)}
            fg={dashboard.total_unrealized >= 0 ? '#22c55e' : '#ef4444'} />
          <SummaryCard label="Realized P&L" value={fmt(dashboard.total_realized)}
            fg={dashboard.total_realized >= 0 ? '#22c55e' : '#ef4444'} />
          <SummaryCard label="Dividends" value={fmt(dashboard.total_dividend)} fg="#22c55e" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, alignItems: 'start' }}>
        {/* Accounts list */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', maxHeight: '70vh', overflowY: 'auto' }}>
          {accounts.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No accounts yet.</div>
          ) : accounts.map(a => {
            const unrl = Number(a.unrealized_pnl || 0);
            return (
              <div key={a.id} onClick={() => setSelId(a.id)} style={{
                padding: 12, borderBottom: '1px solid var(--border)', cursor: 'pointer',
                background: selId === a.id ? 'var(--bg-hover)' : 'transparent',
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
                  {a.broker?.name} · {a.account_holder_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {a.client_id ? `Client: ${a.client_id}` : ''}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Invested: <b style={{ color: 'var(--text-primary)' }}>{fmt(a.total_invested)}</b></span>
                  <span style={{ color: unrl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                    {unrl >= 0 ? '↑' : '↓'} {fmt(Math.abs(unrl))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', minHeight: 300 }}>
          {!detail ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              <TrendingUp size={32} style={{ opacity: 0.4, margin: '0 auto 8px', display: 'block' }} />
              Select an account.
            </div>
          ) : (
            <AccountDetail
              detail={detail}
              tab={tab} setTab={setTab}
              pnlData={pnlData}
              onAct={(action) => setModal(action)}
            />
          )}
        </div>
      </div>

      {modal?.kind === 'newAccount' && (
        <NewAccountModal onClose={() => setModal(null)} onSaved={async (id) => { setModal(null); await reload(); if (id) setSelId(id); }} />
      )}
      {modal?.kind === 'buy' && detail && (
        <BuyModal account={detail.account} onClose={() => setModal(null)} onSaved={onSaved} />
      )}
      {modal?.kind === 'sell' && detail && (
        <SellModal account={detail.account} holdings={detail.holdings} onClose={() => setModal(null)} onSaved={onSaved} />
      )}
      {modal?.kind === 'dividend' && detail && (
        <DividendModal account={detail.account} holdings={detail.holdings} onClose={() => setModal(null)} onSaved={onSaved} />
      )}
      {modal?.kind === 'updatePrices' && detail && (
        <UpdatePricesModal holdings={detail.holdings} onClose={() => setModal(null)} onSaved={onSaved} />
      )}
      {modal?.kind === 'deleteAccount' && detail && (
        <DeleteConfirmModal title={`Delete ${detail.account.account_holder_name}`}
          description="This will reverse all stock buys, sells, and dividend ledger entries; remove all holdings; and refresh the linked bank balance."
          warning="Realized P&L history will be lost."
          confirmLabel="Delete Account"
          onClose={() => setModal(null)}
          onConfirm={async (reason) => {
            await finoSmDeleteAccount(detail.account.id, reason);
            setSelId(null);
            await reload();
          }}
        />
      )}
      {modal?.kind === 'deleteTxn' && (
        <DeleteConfirmModal title={`Delete ${modal.row.txn_type} ${modal.row.symbol || ''}`.trim()}
          description="This will reverse the ledger entry, restore holdings, and update account totals."
          confirmLabel="Delete"
          onClose={() => setModal(null)}
          onConfirm={async (reason) => {
            await finoSmDeleteTxn(modal.row.id, reason);
            await reload();
            loadDetail(selId);
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

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// ─── Detail panel ────────────────────────────────────────────────────────────

function AccountDetail({ detail, tab, setTab, pnlData, onAct }) {
  const { account, holdings, transactions } = detail;
  const isDeleted = account.is_deleted;

  return (
    <div>
      <div style={{ padding: 18, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>
              {account.broker?.name} · {account.account_holder_name}
            </h2>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {account.client_id ? `Client: ${account.client_id}` : ''}
              {account.pan ? ` · PAN: ${account.pan}` : ''}
              {account.bank ? ` · Bank: ${account.bank.account_name} (${account.bank.bank_name})` : ''}
            </div>
            <div style={{ display: 'flex', gap: 22, marginTop: 12, flexWrap: 'wrap' }}>
              <Stat label="Invested"        value={fmt(account.total_invested)} />
              <Stat label="Current"         value={fmt(account.current_value)} />
              <Stat label="Unrealized P&L"  value={fmt(account.unrealized_pnl)} color={Number(account.unrealized_pnl) >= 0 ? 'var(--success)' : 'var(--danger)'} />
              <Stat label="Realized P&L"    value={fmt(account.realized_pnl)} color={Number(account.realized_pnl) >= 0 ? 'var(--success)' : 'var(--danger)'} />
              <Stat label="Dividends"       value={fmt(account.total_dividend)} color="var(--success)" small />
            </div>
          </div>
          {!isDeleted && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }} onClick={() => onAct({ kind: 'buy' })}>Buy</button>
              <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }} onClick={() => onAct({ kind: 'sell' })}>Sell</button>
              <button className="btn btn-sm" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }} onClick={() => onAct({ kind: 'dividend' })}>Dividend</button>
              <button className="btn btn-sm" onClick={() => onAct({ kind: 'updatePrices' })}><RefreshCw size={12} /> Update ₹</button>
              <button className="btn btn-ghost btn-sm" title="Delete account" style={{ color: 'var(--danger)' }} onClick={() => onAct({ kind: 'deleteAccount' })}><Trash2 size={13} /></button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '8px 14px 0', borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'holdings',     label: `Holdings (${holdings.filter(h => Number(h.quantity) > 0).length})` },
          { id: 'transactions', label: `Transactions (${transactions.length})` },
          { id: 'pnl',          label: 'Realized P&L' },
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

      <div style={{ padding: 14 }}>
        {tab === 'holdings'     && <HoldingsTab rows={holdings} />}
        {tab === 'transactions' && <TransactionsTab rows={transactions} onAct={onAct} />}
        {tab === 'pnl'          && <PnLTab data={pnlData} />}
      </div>
    </div>
  );
}

function Stat({ label, value, color, small }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: small ? 14 : 16, fontWeight: 700, color: color || 'var(--text-primary)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function HoldingsTab({ rows }) {
  const active = rows.filter(r => Number(r.quantity) > 0);
  if (active.length === 0) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No holdings yet.</div>;
  return (
    <table style={{ width: '100%', fontSize: 12 }}>
      <thead>
        <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
          <th style={{ padding: '8px 10px' }}>Symbol</th>
          <th style={{ padding: '8px 10px' }}>Exch</th>
          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Qty</th>
          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Avg ₹</th>
          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Cur ₹</th>
          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Invested</th>
          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Current</th>
          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Unrealized</th>
        </tr>
      </thead>
      <tbody>
        {active.map(h => {
          const u = Number(h.unrealized_pnl || 0);
          return (
            <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 10px', fontWeight: 600 }}>{h.symbol}</td>
              <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{h.exchange || '—'}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtN(h.quantity)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(h.avg_buy_price)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{Number(h.current_price) > 0 ? fmt(h.current_price) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(h.invested_value)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(h.current_value)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: u > 0 ? '#22c55e' : u < 0 ? '#ef4444' : 'var(--text-muted)' }}>
                {u > 0 ? '↑ ' : u < 0 ? '↓ ' : ''}{fmt(Math.abs(u))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TransactionsTab({ rows, onAct }) {
  if (rows.length === 0) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No transactions.</div>;
  return (
    <table style={{ width: '100%', fontSize: 12 }}>
      <thead>
        <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
          <th style={{ padding: '8px 10px' }}>Date</th>
          <th style={{ padding: '8px 10px' }}>Type</th>
          <th style={{ padding: '8px 10px' }}>Symbol</th>
          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Qty</th>
          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Price</th>
          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
          <th style={{ padding: '8px 10px', textAlign: 'right' }}>P&L</th>
          <th style={{ padding: '8px 10px', width: 32 }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(t => {
          const cls = t.txn_type === 'buy' ? '#3b82f6' : t.txn_type === 'sell' ? '#ef4444' : '#22c55e';
          const r = Number(t.realized_pnl || 0);
          return (
            <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 10px' }}>{t.txn_date}</td>
              <td style={{ padding: '8px 10px' }}>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: 'var(--bg-page)', color: cls }}>
                  {t.txn_type}
                </span>
              </td>
              <td style={{ padding: '8px 10px', fontWeight: 600 }}>{t.symbol || '—'}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{t.quantity ? fmtN(t.quantity) : ''}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{t.price ? fmt(t.price) : ''}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmt(t.net_amount || t.amount)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', color: r > 0 ? '#22c55e' : r < 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: r !== 0 ? 700 : 500 }}>
                {t.txn_type === 'sell' ? (r > 0 ? '+' : '') + fmt(r) : '—'}
              </td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                <RowMenu items={[{
                  label: 'Delete', icon: <Trash2 size={12} />, danger: true,
                  onClick: () => onAct({ kind: 'deleteTxn', row: t }),
                }]} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PnLTab({ data }) {
  if (!data) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>;
  if ((data.trades || []).length === 0) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No realized trades yet.</div>;
  return (
    <div>
      <div style={{ marginBottom: 14, padding: 10, background: 'var(--bg-page)', borderRadius: 8, fontSize: 13 }}>
        Total Realized P&L:{' '}
        <b style={{ color: data.total_realized >= 0 ? '#22c55e' : '#ef4444', fontSize: 16 }}>
          {data.total_realized >= 0 ? '+' : ''}{fmt(data.total_realized)}
        </b>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Per Symbol</div>
      <table style={{ width: '100%', fontSize: 12, marginBottom: 14 }}>
        <thead>
          <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
            <th style={{ padding: '6px 10px' }}>Symbol</th>
            <th style={{ padding: '6px 10px', textAlign: 'right' }}>Sells</th>
            <th style={{ padding: '6px 10px', textAlign: 'right' }}>Qty Sold</th>
            <th style={{ padding: '6px 10px', textAlign: 'right' }}>Gross</th>
            <th style={{ padding: '6px 10px', textAlign: 'right' }}>Charges</th>
            <th style={{ padding: '6px 10px', textAlign: 'right' }}>Realized</th>
          </tr>
        </thead>
        <tbody>
          {data.perSymbol.map(s => (
            <tr key={s.symbol} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 10px', fontWeight: 600 }}>{s.symbol}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right' }}>{s.sells}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtN(s.qty_sold)}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmt(s.gross)}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(s.charges)}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: s.realized >= 0 ? '#22c55e' : '#ef4444' }}>
                {s.realized >= 0 ? '+' : ''}{fmt(s.realized)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── New Account Modal ──────────────────────────────────────────────────────

function NewAccountModal({ onClose, onSaved }) {
  const [brokers, setBrokers] = useState([]);
  const [banks, setBanks]     = useState([]);
  const [brokerId, setBrokerId]       = useState('');
  const [holderName, setHolderName]   = useState('');
  const [clientId, setClientId]       = useState('');
  const [pan, setPan]                 = useState('');
  const [bankId, setBankId]           = useState('');
  const [notes, setNotes]             = useState('');
  const [showAddBroker, setShowAddBroker] = useState(false);
  const [newBrokerName, setNewBrokerName] = useState('');
  const [newBrokerCode, setNewBrokerCode] = useState('');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState(null);

  useEffect(() => {
    finoSmListBrokers().then(r => setBrokers(r.data.brokers || [])).catch(() => setBrokers([]));
    finoListBanks().then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : [])).catch(() => setBanks([]));
  }, []);

  const addBroker = async () => {
    if (!newBrokerName.trim()) return;
    try {
      const r = await finoSmCreateBroker({ name: newBrokerName.trim(), code: newBrokerCode.trim() || null });
      const b = r.data.broker;
      setBrokers(s => [...s, b]); setBrokerId(b.id);
      setShowAddBroker(false); setNewBrokerName(''); setNewBrokerCode('');
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
  };

  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!brokerId) throw new Error('Broker required');
      if (!holderName.trim()) throw new Error('Holder name required');
      const r = await finoSmCreateAccount({
        brokerId, accountHolderName: holderName.trim(),
        clientId: clientId || undefined, pan: pan || undefined,
        linkedBankAccountId: bankId || undefined,
        notes: notes || undefined,
      });
      onSaved(r.data?.account?.id);
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title="Add Broker Account" onClose={onClose}>
      <Field label="Broker">
        <div style={{ display: 'flex', gap: 6 }}>
          <select className="input" style={{ flex: 1 }} value={brokerId} onChange={e => setBrokerId(e.target.value)}>
            <option value="">— Select broker —</option>
            {brokers.map(b => <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>)}
          </select>
          <button className="btn btn-sm" onClick={() => setShowAddBroker(s => !s)}>+ Broker</button>
        </div>
        {showAddBroker && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input className="input" placeholder="e.g. Zerodha" value={newBrokerName} onChange={e => setNewBrokerName(e.target.value)} />
            <input className="input" placeholder="Code (optional)" style={{ maxWidth: 120 }} value={newBrokerCode} onChange={e => setNewBrokerCode(e.target.value)} />
            <button className="btn btn-sm btn-primary" onClick={addBroker}>Add</button>
          </div>
        )}
      </Field>
      <Field label="Holder Name"><input className="input" value={holderName} onChange={e => setHolderName(e.target.value)} placeholder="Jaydev Patel" /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Client ID"><input className="input" value={clientId} onChange={e => setClientId(e.target.value)} /></Field>
        <Field label="PAN"><input className="input" value={pan} onChange={e => setPan(e.target.value.toUpperCase())} /></Field>
      </div>
      <Field label="Linked Bank Account"
        hint={banks.length === 0 ? 'No bank accounts found.' : 'Used as the cash source/destination for buy/sell/dividend.'}>
        <select className="input" value={bankId} onChange={e => setBankId(e.target.value)} style={{ width: '100%' }}>
          <option value="">— Select bank —</option>
          {banks.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</option>)}
        </select>
      </Field>
      <Field label="Notes"><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      {err && <ErrBox msg={err} />}
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Create" />
    </ModalShell>
  );
}

// ─── Buy / Sell / Dividend / Update Prices Modals ────────────────────────────

function BuyModal({ account, onClose, onSaved }) {
  const [f, setF] = useState({ txnDate: today(), symbol: '', exchange: 'NSE', quantity: '', price: '', brokerage: 0, stt: 0, otherCharges: 0, notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const amount = (Number(f.quantity) || 0) * (Number(f.price) || 0);
  const charges = (Number(f.brokerage) || 0) + (Number(f.stt) || 0) + (Number(f.otherCharges) || 0);
  const total = amount + charges;
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.symbol.trim()) throw new Error('Symbol required');
      if (!(Number(f.quantity) > 0)) throw new Error('Quantity > 0');
      if (!(Number(f.price)    > 0)) throw new Error('Price > 0');
      await finoSmBuy(account.id, { ...f, quantity: Number(f.quantity), price: Number(f.price) });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title={`Buy · ${account.broker?.name} - ${account.account_holder_name}`} onClose={onClose} maxWidth={520}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Date"><input className="input" type="date" value={f.txnDate} onChange={e => set('txnDate', e.target.value)} /></Field>
        <Field label="Symbol"><input className="input" value={f.symbol} onChange={e => set('symbol', e.target.value.toUpperCase())} placeholder="RELIANCE" /></Field>
        <Field label="Exchange">
          <select className="input" value={f.exchange} onChange={e => set('exchange', e.target.value)}>
            <option value="NSE">NSE</option><option value="BSE">BSE</option>
          </select>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Quantity"><input className="input" type="number" step="0.01" value={f.quantity} onChange={e => set('quantity', e.target.value)} /></Field>
        <Field label="Price (₹)"><input className="input" type="number" step="0.01" value={f.price} onChange={e => set('price', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Brokerage"><input className="input" type="number" step="0.01" value={f.brokerage} onChange={e => set('brokerage', e.target.value)} /></Field>
        <Field label="STT"><input className="input" type="number" step="0.01" value={f.stt} onChange={e => set('stt', e.target.value)} /></Field>
        <Field label="Other"><input className="input" type="number" step="0.01" value={f.otherCharges} onChange={e => set('otherCharges', e.target.value)} /></Field>
      </div>
      <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
        Amount: <b>{fmt(amount)}</b> · Charges: <b>{fmt(charges)}</b> · Total Cost: <b style={{ color: 'var(--accent)' }}>{fmt(total)}</b>
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      {err && <ErrBox msg={err} />}
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Buy" />
    </ModalShell>
  );
}

function SellModal({ account, holdings, onClose, onSaved }) {
  const active = holdings.filter(h => Number(h.quantity) > 0);
  const [f, setF] = useState({ txnDate: today(), symbol: active[0]?.symbol || '', exchange: active[0]?.exchange || 'NSE', quantity: '', price: '', brokerage: 0, stt: 0, otherCharges: 0, notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const holding = active.find(h => h.symbol === f.symbol);
  const cost = holding ? (Number(f.quantity) || 0) * Number(holding.avg_buy_price) : 0;
  const gross = (Number(f.quantity) || 0) * (Number(f.price) || 0);
  const charges = (Number(f.brokerage) || 0) + (Number(f.stt) || 0) + (Number(f.otherCharges) || 0);
  const realized = gross - charges - cost;
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.symbol) throw new Error('Symbol required');
      if (!(Number(f.quantity) > 0)) throw new Error('Quantity > 0');
      if (!(Number(f.price)    > 0)) throw new Error('Price > 0');
      if (holding && Number(f.quantity) > Number(holding.quantity) + 0.0001) throw new Error(`Only ${holding.quantity} available`);
      await finoSmSell(account.id, { ...f, quantity: Number(f.quantity), price: Number(f.price) });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title={`Sell · ${account.broker?.name} - ${account.account_holder_name}`} onClose={onClose} maxWidth={520}>
      <Field label="Symbol"
        hint={holding ? `Available: ${fmtN(holding.quantity)} @ avg ₹${holding.avg_buy_price}` : 'No holding selected'}>
        <select className="input" value={f.symbol} onChange={e => { const sel = active.find(a => a.symbol === e.target.value); set('symbol', e.target.value); if (sel) set('exchange', sel.exchange || 'NSE'); }}>
          <option value="">— Select holding —</option>
          {active.map(h => <option key={h.id} value={h.symbol}>{h.symbol} · {fmtN(h.quantity)} @ {fmt(h.avg_buy_price)}</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Date"><input className="input" type="date" value={f.txnDate} onChange={e => set('txnDate', e.target.value)} /></Field>
        <Field label="Quantity"><input className="input" type="number" step="0.01" value={f.quantity} onChange={e => set('quantity', e.target.value)} /></Field>
        <Field label="Price (₹)"><input className="input" type="number" step="0.01" value={f.price} onChange={e => set('price', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Brokerage"><input className="input" type="number" step="0.01" value={f.brokerage} onChange={e => set('brokerage', e.target.value)} /></Field>
        <Field label="STT"><input className="input" type="number" step="0.01" value={f.stt} onChange={e => set('stt', e.target.value)} /></Field>
        <Field label="Other"><input className="input" type="number" step="0.01" value={f.otherCharges} onChange={e => set('otherCharges', e.target.value)} /></Field>
      </div>
      <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
        Gross: <b>{fmt(gross)}</b> · Cost: <b>{fmt(cost)}</b> · Charges: <b>{fmt(charges)}</b>
        <div style={{ marginTop: 4 }}>Realized P&L: <b style={{ color: realized >= 0 ? '#22c55e' : '#ef4444', fontSize: 14 }}>{realized >= 0 ? '+' : ''}{fmt(realized)}</b></div>
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      {err && <ErrBox msg={err} />}
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Sell" />
    </ModalShell>
  );
}

function DividendModal({ account, holdings, onClose, onSaved }) {
  const active = holdings.filter(h => Number(h.quantity) > 0);
  const [f, setF] = useState({ txnDate: today(), symbol: active[0]?.symbol || '', amount: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!(Number(f.amount) > 0)) throw new Error('Amount > 0');
      await finoSmDividend(account.id, { ...f, amount: Number(f.amount) });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title={`Dividend · ${account.broker?.name} - ${account.account_holder_name}`} onClose={onClose}>
      <Field label="Date"><input className="input" type="date" value={f.txnDate} onChange={e => set('txnDate', e.target.value)} /></Field>
      <Field label="Symbol (optional)">
        <input className="input" list="sym-list" value={f.symbol} onChange={e => set('symbol', e.target.value.toUpperCase())} />
        <datalist id="sym-list">
          {active.map(h => <option key={h.id} value={h.symbol} />)}
        </datalist>
      </Field>
      <Field label="Amount (₹)"><input className="input" type="number" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      {err && <ErrBox msg={err} />}
      <Buttons onCancel={onClose} onSave={submit} saving={saving} label="Record" />
    </ModalShell>
  );
}

function UpdatePricesModal({ holdings, onClose, onSaved }) {
  const active = holdings.filter(h => Number(h.quantity) > 0);
  const [vals, setVals] = useState(() => Object.fromEntries(active.map(h => [h.id, String(h.current_price || '')])));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const submitAll = async () => {
    setErr(null); setSaving(true);
    try {
      const updates = active
        .map(h => ({ holdingId: h.id, currentPrice: Number(vals[h.id] || 0) }))
        .filter(u => u.currentPrice > 0);
      if (updates.length === 0) throw new Error('Enter at least one price');
      await finoSmBulkUpdatePrices(updates);
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title="Update Current Prices" onClose={onClose} maxWidth={560}>
      {active.length === 0 ? (
        <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>No active holdings.</div>
      ) : (
        <table style={{ width: '100%', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
              <th style={{ padding: '6px 10px' }}>Symbol</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Qty</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Avg ₹</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Current ₹</th>
            </tr>
          </thead>
          <tbody>
            {active.map(h => (
              <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 10px', fontWeight: 600 }}>{h.symbol}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtN(h.quantity)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmt(h.avg_buy_price)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                  <input className="input" type="number" step="0.01" style={{ textAlign: 'right', maxWidth: 120 }}
                    value={vals[h.id] || ''} onChange={e => setVals(s => ({ ...s, [h.id]: e.target.value }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {err && <ErrBox msg={err} />}
      <Buttons onCancel={onClose} onSave={submitAll} saving={saving} label="Update All" disabled={active.length === 0} />
    </ModalShell>
  );
}

// ─── Modal shell helpers ─────────────────────────────────────────────────────

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
