import React, { useEffect, useState } from 'react';
import { amzGetDashboard } from '../../services/api';
import { CreditCard, ShoppingCart, ArrowUpDown, AlertTriangle } from 'lucide-react';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);

export default function AmazonDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    amzGetDashboard()
      .then(({ data }) => setData(data))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="spinner" style={{ margin: '40px auto' }} />;
  if (!data) return <div style={{ color: 'var(--text-muted)' }}>No data. Upload a report to start.</div>;

  const kpis = [
    { label: 'Cards',        value: data.totals.cards,          Icon: CreditCard,    color: 'var(--info)' },
    { label: 'Orders',       value: data.totals.orders,         Icon: ShoppingCart,  color: 'var(--accent)' },
    { label: 'Closed',       value: data.totals.ordersClosed,   Icon: ShoppingCart,  color: 'var(--success)' },
    { label: 'Transactions', value: data.totals.transactions,   Icon: ArrowUpDown,   color: 'var(--text-primary)' },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        {kpis.map(({ label, value, Icon, color }) => (
          <div key={label} className="card" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={18} color={color} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
            </div>
          </div>
        ))}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Total Purchases</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>{fmt(data.totals.totalPurchases)}</div>
        </div>
      </div>

      {/* Card Balances */}
      <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>Card Balances</h3>
      {data.balances.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20, background: 'var(--bg-page)', borderRadius: 8 }}>
          No cards yet. Go to <b>Cards</b> tab to add one.
        </div>
      ) : (
        <div className="table-wrapper" style={{ marginBottom: 20 }}>
          <table>
            <thead>
              <tr>
                <th>Card</th>
                <th>Last 4</th>
                <th>Opening</th>
                <th>Added</th>
                <th>Purchases</th>
                <th>Refunded</th>
                <th>Transfers (In/Out)</th>
                <th>Current Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.balances.map(b => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 600 }}>{b.card_name}</td>
                  <td><code>{b.last_4}</code></td>
                  <td>{fmt(b.opening_balance)}</td>
                  <td style={{ color: 'var(--success)' }}>{fmt(b.total_added)}</td>
                  <td style={{ color: 'var(--danger)' }}>{fmt(b.total_purchases)}</td>
                  <td style={{ color: 'var(--success)' }}>{fmt(b.total_refunded)}</td>
                  <td style={{ fontSize: 11 }}>{fmt(b.transfer_in)} / {fmt(b.transfer_out)}</td>
                  <td style={{ fontWeight: 700, color: Number(b.current_balance) < 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {fmt(b.current_balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Order Status */}
      <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>Orders by Status</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {Object.entries(data.statusCounts).map(([status, count]) => (
          <div key={status} className="card" style={{ padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{status}:</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{count}</span>
          </div>
        ))}
      </div>

      {/* Unmapped last4 */}
      {data.unmappedLast4.length > 0 && (
        <div className="card" style={{ padding: 14, borderLeft: '4px solid var(--warning)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={14} color="var(--warning)" />
            <b style={{ fontSize: 13 }}>Unmapped Payment Identifiers</b>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Add these as cards to include them in balance calculations:
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.unmappedLast4.map(u => (
              <span key={u.last4} className="badge" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--warning)' }}>
                {u.last4} — {fmt(u.total)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
