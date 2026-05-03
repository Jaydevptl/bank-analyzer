import React, { useEffect, useState, useCallback } from 'react';
import { Search, X, Lock } from 'lucide-react';
import { amzGetOrderSummary } from '../../services/api';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);

const STATUS_COLORS = {
  'Closed':             { bg: 'rgba(34,197,94,0.10)',  c: 'var(--success)' },
  'Cancelled':          { bg: 'rgba(239,68,68,0.10)',  c: 'var(--danger)' },
  'Pending':            { bg: 'rgba(245,158,11,0.10)', c: 'var(--warning)' },
  'Pending Fulfillment':{ bg: 'rgba(59,130,246,0.10)', c: 'var(--info)' },
  'Payment Confirmed':  { bg: 'rgba(139,92,246,0.10)', c: '#8B5CF6' },
};

const FLAG_COLORS = {
  unpaid:   { label: 'Unpaid',   c: 'var(--danger)' },
  partial:  { label: 'Partial',  c: 'var(--warning)' },
  overpaid: { label: 'Overpaid', c: 'var(--info)' },
};

export default function AmazonOrders() {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [status, setStatus]   = useState('all');
  const [flag, setFlag]       = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    amzGetOrderSummary()
      .then(({ data }) => setSummary(data.summary || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const statuses = [...new Set(summary.map(s => s.status).filter(Boolean))];
  const filtered = summary.filter(s => {
    if (search && !s.orderId.toLowerCase().includes(search.toLowerCase())) return false;
    if (status !== 'all' && s.status !== status) return false;
    if (flag !== 'all' && !s.flags.includes(flag)) return false;
    return true;
  });

  const totals = filtered.reduce((acc, s) => {
    acc.orderTotal += s.orderTotal;
    acc.paidTotal += s.paidTotal;
    return acc;
  }, { orderTotal: 0, paidTotal: 0 });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 17, margin: 0 }}>Orders</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            {filtered.length} orders • Order total: <b>{fmt(totals.orderTotal)}</b> • Paid: <b>{fmt(totals.paidTotal)}</b>
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <div style={{ position: 'relative', maxWidth: 220 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" placeholder="Search Order ID..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        <select className="input" value={status} onChange={e => setStatus(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="all">All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input" value={flag} onChange={e => setFlag(e.target.value)} style={{ maxWidth: 150 }}>
          <option value="all">All Orders</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial Payment</option>
          <option value="overpaid">Overpaid</option>
        </select>
        {(search || status !== 'all' || flag !== 'all') && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setStatus('all'); setFlag('all'); }}>
            <X size={13} /> Clear
          </button>
        )}
      </div>

      <div className="table-wrapper">
        <table style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Date</th>
              <th>Status</th>
              <th>Qty</th>
              <th>Order Total</th>
              <th>Paid</th>
              <th>Difference</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No orders.</td></tr>
            ) : filtered.map(s => {
              const sc = STATUS_COLORS[s.status] || { bg: 'rgba(100,100,100,0.1)', c: 'var(--text-muted)' };
              return (
                <tr key={s.orderId}>
                  <td style={{ fontSize: 11, fontFamily: 'monospace' }}>
                    {s.isClosed && <Lock size={11} style={{ marginRight: 4, color: 'var(--text-muted)' }} />}
                    {s.orderId}
                  </td>
                  <td style={{ fontSize: 11 }}>{s.orderDate || '-'}</td>
                  <td>
                    <span style={{ background: sc.bg, color: sc.c, padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600 }}>
                      {s.status || '—'}
                    </span>
                  </td>
                  <td>{s.quantity || 0}</td>
                  <td>{fmt(s.orderTotal)}</td>
                  <td style={{ color: s.paidTotal > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{fmt(s.paidTotal)}</td>
                  <td style={{ color: Math.abs(s.difference) < 0.01 ? 'var(--text-muted)' : (s.difference > 0 ? 'var(--warning)' : 'var(--info)') }}>
                    {fmt(s.difference)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {s.flags.map(f => {
                        const fc = FLAG_COLORS[f];
                        return (
                          <span key={f} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: 'var(--bg-page)', color: fc?.c || 'var(--text-muted)', fontWeight: 600 }}>
                            {fc?.label || f}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
