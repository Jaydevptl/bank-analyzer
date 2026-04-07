import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, Receipt,
  Activity, Target, RefreshCw, Briefcase
} from 'lucide-react';
import { getTradeSummary } from '../../services/api';

const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0);
const fmtShort = (n) => {
  if (Math.abs(n) >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n.toFixed(0)}`;
};

const PERIODS = [
  { id: 'day',     label: 'Today' },
  { id: 'month',   label: 'This Month' },
  { id: 'quarter', label: 'This Quarter' },
  { id: 'year',    label: 'This Year' },
  { id: 'all',     label: 'All Time' },
];

const CHART_COLORS = ['#F0C93A', '#1A1A2E', '#22C55E', '#EF4444', '#3B82F6', '#8B5CF6'];

function KpiCard({ label, value, Icon, borderColor, iconBg, sub }) {
  return (
    <div className="kpi-card" style={{ borderLeftColor: borderColor }}>
      <div className="kpi-icon" style={{ background: iconBg }}>
        <Icon size={20} color={borderColor} />
      </div>
      <div>
        <div className="kpi-value" style={{ color: typeof value === 'string' && value.startsWith('-') ? 'var(--danger)' : undefined }}>
          {value}
        </div>
        <div className="kpi-label">{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function SMDashboard() {
  const [period, setPeriod] = useState('all');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await getTradeSummary({ period });
      setSummary(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [period]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>;
  }

  if (!summary || summary.totalTrades === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Briefcase size={28} color="var(--accent)" /></div>
        <h3>No trades yet</h3>
        <p>Upload your broker statements to see your share market analytics</p>
      </div>
    );
  }

  // Charges donut data
  const chargesData = [
    { name: 'Brokerage', value: summary.totalBrokerage },
    { name: 'STT', value: summary.totalSTT },
    { name: 'GST', value: summary.totalGST },
    { name: 'Other', value: summary.totalOtherCharges },
  ].filter(d => d.value > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Period selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Share Market Dashboard</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{summary.period}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <button
              key={p.id}
              className={`btn btn-sm ${period === p.id ? 'btn-primary' : ''}`}
              onClick={() => setPeriod(p.id)}
            >{p.label}</button>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /></button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <KpiCard label="Total Invested (Buy)" value={fmt(summary.totalBuyValue)} Icon={Wallet}
          borderColor="#3B82F6" iconBg="rgba(59,130,246,0.10)" />
        <KpiCard label="Realized P&L"
          value={(summary.totalRealizedPnL >= 0 ? '+' : '') + fmt(summary.totalRealizedPnL)}
          Icon={summary.totalRealizedPnL >= 0 ? TrendingUp : TrendingDown}
          borderColor={summary.totalRealizedPnL >= 0 ? '#22C55E' : '#EF4444'}
          iconBg={summary.totalRealizedPnL >= 0 ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)'} />
        <KpiCard label="Net P&L (after charges)"
          value={(summary.netPnL >= 0 ? '+' : '') + fmt(summary.netPnL)}
          Icon={Activity}
          borderColor={summary.netPnL >= 0 ? '#22C55E' : '#EF4444'}
          iconBg={summary.netPnL >= 0 ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)'} />
        <KpiCard label="Total Charges Paid" value={fmt(summary.totalAllCharges)} Icon={Receipt}
          borderColor="#F59E0B" iconBg="rgba(245,158,11,0.10)" />
        <KpiCard label="Total Trades" value={summary.totalTrades} Icon={Briefcase}
          borderColor="#8B5CF6" iconBg="rgba(139,92,246,0.10)"
          sub={`${summary.profitTrades} profit / ${summary.lossTrades} loss`} />
        <KpiCard label="Win Rate" value={`${summary.winRate}%`} Icon={Target}
          borderColor="#06B6D4" iconBg="rgba(6,182,212,0.10)" />
      </div>

      {/* Charts row: Monthly P&L (left 60%) + Charges donut (right 40%) */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Buy vs Sell Value</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[{ name: summary.period, Buy: summary.totalBuyValue, Sell: summary.totalSellValue }]} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={fmtShort} axisLine={false} tickLine={false} width={60} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Buy" fill="#3B82F6" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Sell" fill="#22C55E" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Charges Breakdown</div>
          {chargesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={chargesData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {chargesData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No charges data
            </div>
          )}
        </div>
      </div>

      {/* Top Gainers / Losers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--success)' }}>Top 5 Gainers</div>
          {summary.topGainers.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No data</div>
          ) : (
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr><th>Symbol</th><th style={{ textAlign: 'right' }}>P&L</th></tr>
                </thead>
                <tbody>
                  {summary.topGainers.map(g => (
                    <tr key={g.symbol}>
                      <td style={{ fontWeight: 500 }}>{g.symbol}</td>
                      <td className="text-success" style={{ textAlign: 'right', fontWeight: 600 }}>+{fmt(g.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--danger)' }}>Top 5 Losers</div>
          {summary.topLosers.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No data</div>
          ) : (
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr><th>Symbol</th><th style={{ textAlign: 'right' }}>P&L</th></tr>
                </thead>
                <tbody>
                  {summary.topLosers.map(l => (
                    <tr key={l.symbol}>
                      <td style={{ fontWeight: 500 }}>{l.symbol}</td>
                      <td className="text-danger" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(l.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* By Broker / By Segment */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>By Broker</div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr><th>Broker</th><th>Trades</th><th>Value</th><th>Charges</th><th>P&L</th></tr>
              </thead>
              <tbody>
                {summary.byBroker.map(b => (
                  <tr key={b.broker}>
                    <td style={{ fontWeight: 500 }}>{b.broker}</td>
                    <td>{b.trades}</td>
                    <td>{fmtShort(b.totalValue)}</td>
                    <td className="text-warning">{fmtShort(b.charges)}</td>
                    <td className={b.pnl >= 0 ? 'text-success' : 'text-danger'} style={{ fontWeight: 600 }}>{fmtShort(b.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>By Segment</div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr><th>Segment</th><th>Trades</th><th>Charges</th><th>P&L</th></tr>
              </thead>
              <tbody>
                {summary.bySegment.map(s => (
                  <tr key={s.segment}>
                    <td style={{ fontWeight: 500 }}>{s.segment}</td>
                    <td>{s.trades}</td>
                    <td className="text-warning">{fmtShort(s.charges)}</td>
                    <td className={s.pnl >= 0 ? 'text-success' : 'text-danger'} style={{ fontWeight: 600 }}>{fmtShort(s.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
