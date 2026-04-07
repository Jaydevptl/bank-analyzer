import React, { useState, useEffect } from 'react';
import { Briefcase, RefreshCw, Info } from 'lucide-react';
import { format } from 'date-fns';
import { getHoldings } from '../../services/api';

const fmt = (n) => n ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '0';

export default function Holdings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await getHoldings();
      setData(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>;
  }

  if (!data || data.holdings.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Briefcase size={28} color="var(--accent)" /></div>
        <h3>No active holdings</h3>
        <p>You don't have any unmatched buy positions. Upload broker statements to see current holdings.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Current Holdings</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Calculated from FIFO matching of buy/sell trades</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /></button>
      </div>

      {/* Info banner */}
      <div className="card" style={{
        padding: '14px 18px',
        background: 'rgba(59,130,246,0.06)',
        border: '1px solid rgba(59,130,246,0.2)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Info size={16} color="var(--info)" />
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Live prices not available. Upload latest broker statement for updated holdings. Holdings = unmatched buy positions (FIFO).
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <div className="card card-sm" style={{ borderLeft: '4px solid var(--accent)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Symbols Held</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{data.totalSymbols}</div>
        </div>
        <div className="card card-sm" style={{ borderLeft: '4px solid var(--info)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Amount Invested</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--info)' }}>₹{fmt(data.totalInvested)}</div>
        </div>
      </div>

      {/* Holdings table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th style={{ textAlign: 'right' }}>Quantity</th>
                <th style={{ textAlign: 'right' }}>Avg Buy Price</th>
                <th style={{ textAlign: 'right' }}>Total Invested</th>
                <th>Broker</th>
                <th>Account</th>
                <th>Last Buy Date</th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map(h => (
                <tr key={h.symbol + h.broker}>
                  <td style={{ fontWeight: 600 }}>{h.symbol}</td>
                  <td style={{ textAlign: 'right' }}>{h.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(h.avgBuyPrice)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(h.totalInvested)}</td>
                  <td><span className="badge badge-info">{h.broker || '-'}</span></td>
                  <td style={{ fontSize: 11 }}>{h.accountHolder || '-'}</td>
                  <td style={{ fontSize: 11 }}>{h.lastBuyDate ? format(new Date(h.lastBuyDate), 'dd/MM/yyyy') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
