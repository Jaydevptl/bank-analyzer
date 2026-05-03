import React, { useState, useEffect } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Calendar, BarChart3 } from 'lucide-react';
import { getDaywisePnL, getStockAccounts } from '../../services/api';

const fmt = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const formatDate = (d) => d && d !== 'unknown' ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' }) : '-';

export default function DayWisePnL() {
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountName, setAccountName] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (accountName !== 'all') params.accountName = accountName;
      const [res, accRes] = await Promise.all([
        getDaywisePnL(params),
        getStockAccounts(),
      ]);
      setData(res.data);
      setAccounts(accRes.data?.accounts || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [accountName]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, gap: 8, color: 'var(--text-muted)' }}>
        <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading...
      </div>
    );
  }

  if (!data || data.days?.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
        <BarChart3 size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
        <p style={{ fontWeight: 600, marginBottom: 4 }}>No P&L data yet</p>
        <p style={{ fontSize: 12 }}>Upload P&L Excel files or Ledger with trade entries to see day-wise breakdown.</p>
      </div>
    );
  }

  const { days, totals } = data;

  return (
    <div className="animate-fade-in">
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total Profit" value={`+${fmt(totals.totalProfit)}`} color="var(--success)" />
        <KpiCard label="Total Loss" value={fmt(totals.totalLoss)} color="var(--danger)" />
        <KpiCard label="Net P&L" value={`${totals.netPnL >= 0 ? '+' : ''}${fmt(totals.netPnL)}`} color={totals.netPnL >= 0 ? 'var(--success)' : 'var(--danger)'} />
        <KpiCard label="Profit Days" value={totals.profitDays} color="var(--success)" sub={`/ ${totals.totalDays} days`} />
        <KpiCard label="Loss Days" value={totals.lossDays} color="var(--danger)" sub={`/ ${totals.totalDays} days`} />
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <select
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
        >
          <option value="all">All Accounts</option>
          {accounts.map(a => <option key={a.account_name} value={a.account_name}>{a.account_name}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{days.length} trading days</span>
        <button className="btn btn-ghost btn-xs" onClick={load} style={{ gap: 4 }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Day-wise Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th style={{ textAlign: 'center' }}>Trades</th>
                <th style={{ textAlign: 'right' }}>Profit</th>
                <th style={{ textAlign: 'right' }}>Loss</th>
                <th style={{ textAlign: 'right' }}>Net P&L</th>
                <th style={{ width: 200 }}>Visual</th>
              </tr>
            </thead>
            <tbody>
              {days.map(day => {
                const maxVal = Math.max(...days.map(d => Math.max(d.profit, d.loss))) || 1;
                const profitPct = (day.profit / maxVal) * 100;
                const lossPct = (day.loss / maxVal) * 100;

                return (
                  <tr key={day.date}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={12} color="var(--text-muted)" />
                        {formatDate(day.date)}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 12 }}>{day.trades}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)', fontSize: 12 }}>
                      {day.profit > 0 ? `+${fmt(day.profit)}` : '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)', fontSize: 12 }}>
                      {day.loss > 0 ? `-${fmt(day.loss)}` : '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 13, color: day.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {day.net >= 0 ? '+' : ''}{fmt(day.net)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center', height: 20 }}>
                        <div style={{
                          height: 14, borderRadius: 3, background: 'var(--success)',
                          width: `${Math.max(profitPct * 0.9, day.profit > 0 ? 3 : 0)}%`,
                          transition: 'width 0.3s',
                        }} />
                        <div style={{
                          height: 14, borderRadius: 3, background: 'var(--danger)',
                          width: `${Math.max(lossPct * 0.9, day.loss > 0 ? 3 : 0)}%`,
                          transition: 'width 0.3s',
                        }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color, sub }) {
  return (
    <div className="card" style={{ padding: '14px 16px', borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color }}>
        {value}
        {sub && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>{sub}</span>}
      </div>
    </div>
  );
}
