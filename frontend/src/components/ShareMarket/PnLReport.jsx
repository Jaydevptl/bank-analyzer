import React, { useState, useEffect } from 'react';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { getTradePnL } from '../../services/api';

const fmt = (n) => n ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '0';
const VIEWS = ['monthly', 'quarterly', 'symbol'];

export default function PnLReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('monthly');
  const [pnlTypeFilter, setPnlTypeFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await getTradePnL();
      setData(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>;
  }

  if (!data || (data.symbolPnL.length === 0 && data.monthly.length === 0)) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><TrendingUp size={28} color="var(--accent)" /></div>
        <h3>No P&L data</h3>
        <p>Upload broker statements with both buy and sell trades to see realized P&L</p>
      </div>
    );
  }

  let filteredSymbols = data.symbolPnL;
  if (pnlTypeFilter === 'STCG') filteredSymbols = data.symbolPnL.filter(p => p.stcgPnL !== 0);
  else if (pnlTypeFilter === 'LTCG') filteredSymbols = data.symbolPnL.filter(p => p.ltcgPnL !== 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>P&L Report</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Realized P&L using FIFO method</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /></button>
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {VIEWS.map(v => (
          <button key={v} className={`btn btn-sm ${view === v ? 'btn-primary' : ''}`} onClick={() => setView(v)}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {/* Monthly view */}
      {view === 'monthly' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Monthly P&L</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th style={{ textAlign: 'right' }}>Buy Value</th>
                  <th style={{ textAlign: 'right' }}>Sell Value</th>
                  <th style={{ textAlign: 'right' }}>Realized P&L</th>
                  <th style={{ textAlign: 'right' }}>Charges</th>
                  <th style={{ textAlign: 'right' }}>Net P&L</th>
                  <th style={{ textAlign: 'right' }}>Trades</th>
                </tr>
              </thead>
              <tbody>
                {data.monthly.map(m => (
                  <tr key={m.period} style={{ background: m.netPnL >= 0 ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)' }}>
                    <td style={{ fontWeight: 600 }}>{m.period}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(m.buyValue)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(m.sellValue)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }} className={m.realizedPnL >= 0 ? 'text-success' : 'text-danger'}>
                      {m.realizedPnL >= 0 ? '+' : ''}{fmt(m.realizedPnL)}
                    </td>
                    <td style={{ textAlign: 'right' }} className="text-warning">{fmt(m.charges)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }} className={m.netPnL >= 0 ? 'text-success' : 'text-danger'}>
                      {m.netPnL >= 0 ? '+' : ''}{fmt(m.netPnL)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{m.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quarterly view */}
      {view === 'quarterly' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Quarterly P&L (Indian FY)</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Quarter</th>
                  <th style={{ textAlign: 'right' }}>Buy Value</th>
                  <th style={{ textAlign: 'right' }}>Sell Value</th>
                  <th style={{ textAlign: 'right' }}>Realized P&L</th>
                  <th style={{ textAlign: 'right' }}>Charges</th>
                  <th style={{ textAlign: 'right' }}>Net P&L</th>
                  <th style={{ textAlign: 'right' }}>Trades</th>
                </tr>
              </thead>
              <tbody>
                {data.quarterly.map(q => (
                  <tr key={q.period} style={{ background: q.netPnL >= 0 ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)' }}>
                    <td style={{ fontWeight: 600 }}>{q.period}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(q.buyValue)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(q.sellValue)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }} className={q.realizedPnL >= 0 ? 'text-success' : 'text-danger'}>
                      {q.realizedPnL >= 0 ? '+' : ''}{fmt(q.realizedPnL)}
                    </td>
                    <td style={{ textAlign: 'right' }} className="text-warning">{fmt(q.charges)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }} className={q.netPnL >= 0 ? 'text-success' : 'text-danger'}>
                      {q.netPnL >= 0 ? '+' : ''}{fmt(q.netPnL)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{q.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Symbol-wise view */}
      {view === 'symbol' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Symbol-wise P&L</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['all', 'STCG', 'LTCG'].map(t => (
                <button key={t} className={`btn btn-sm ${pnlTypeFilter === t ? 'btn-primary' : ''}`} onClick={() => setPnlTypeFilter(t)}>
                  {t === 'all' ? 'All' : t}
                </button>
              ))}
            </div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th style={{ textAlign: 'right' }}>Buy Qty</th>
                  <th style={{ textAlign: 'right' }}>Sell Qty</th>
                  <th style={{ textAlign: 'right' }}>Avg Buy</th>
                  <th style={{ textAlign: 'right' }}>Avg Sell</th>
                  <th style={{ textAlign: 'right' }}>Realized P&L</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Charges</th>
                  <th style={{ textAlign: 'right' }}>Net P&L</th>
                </tr>
              </thead>
              <tbody>
                {filteredSymbols.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No symbol P&L data</td></tr>
                ) : filteredSymbols.map(p => (
                  <tr key={p.symbol} style={{ background: p.netPnL >= 0 ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)' }}>
                    <td style={{ fontWeight: 600 }}>{p.symbol}</td>
                    <td style={{ textAlign: 'right' }}>{p.buyQty}</td>
                    <td style={{ textAlign: 'right' }}>{p.sellQty}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(p.avgBuyPrice)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(p.avgSellPrice)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }} className={p.realizedPnL >= 0 ? 'text-success' : 'text-danger'}>
                      {p.realizedPnL >= 0 ? '+' : ''}{fmt(p.realizedPnL)}
                    </td>
                    <td><span className="badge badge-info">{p.pnlType}</span></td>
                    <td style={{ textAlign: 'right' }} className="text-warning">{fmt(p.totalCharges)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }} className={p.netPnL >= 0 ? 'text-success' : 'text-danger'}>
                      {p.netPnL >= 0 ? '+' : ''}{fmt(p.netPnL)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
