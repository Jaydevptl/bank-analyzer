import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  TrendingUp, TrendingDown, Activity, Wallet,
  Building2, RefreshCw, AlertCircle, FileBarChart
} from 'lucide-react';
import { getStats, getBanks, getReports } from '../services/api';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0);

const fmtShort = (n) => {
  if (Math.abs(n) >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1_00_000)    return `${(n / 1_00_000).toFixed(1)}L`;
  if (Math.abs(n) >= 1_000)       return `${(n / 1_000).toFixed(1)}K`;
  return `${n.toFixed(0)}`;
};

const CHART_COLORS = ['#F0C93A', '#1A1A2E', '#22C55E', '#EF4444', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899'];

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '10px 14px',
      fontSize: 11, boxShadow: 'var(--shadow)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', gap: 8, alignItems: 'center', color: p.color, marginBottom: 2 }}>
          <span>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{fmtShort(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

function KpiCard({ label, value, sub, Icon, borderColor, iconBg }) {
  return (
    <div className="kpi-card" style={{ borderLeftColor: borderColor }}>
      <div className="kpi-icon" style={{ background: iconBg }}>
        <Icon size={20} color={borderColor} />
      </div>
      <div>
        <div className="kpi-value">{typeof value === 'number' && value > 999 ? `${fmt(value)}` : value}</div>
        <div className="kpi-label">{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats]       = useState(null);
  const [banks, setBanks]       = useState([]);
  const [reports, setReports]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [view, setView]         = useState('daily');
  const [selectedBank, setSelectedBank] = useState('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, banksRes, reportsRes] = await Promise.all([
        getStats({ bank: selectedBank === 'all' ? undefined : selectedBank }),
        getBanks(),
        getReports(),
      ]);
      setStats(statsRes.data);
      setBanks(banksRes.data.banks);
      setReports(reportsRes.data.reports || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [selectedBank]);

  if (!loading && !error && stats?.overall?.totalTransactions === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Wallet size={28} color="var(--accent)" /></div>
        <h3>No transactions yet</h3>
        <p>Upload bank statements to see your dashboard analytics</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
        <AlertCircle size={16} color="var(--danger)" />
        <span style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>
        <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>Retry</button>
      </div>
    );
  }

  const chartData = view === 'daily' ? (stats?.daily || []).slice(-30) : (stats?.monthly || []);
  const overall = stats?.overall || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <select className="input" value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="all">All Banks</option>
          {banks.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KpiCard label="Total Credit" value={overall.totalCredit} Icon={TrendingUp} borderColor="#22C55E" iconBg="rgba(34,197,94,0.10)" />
        <KpiCard label="Total Debit" value={overall.totalDebit} Icon={TrendingDown} borderColor="#EF4444" iconBg="rgba(239,68,68,0.10)" />
        <KpiCard label="Net Cash Flow" value={overall.netFlow} Icon={Activity} borderColor="#F0C93A" iconBg="rgba(240,201,58,0.12)" />
        <KpiCard label="Transactions" value={overall.totalTransactions} Icon={Wallet} borderColor="#1A1A2E" iconBg="rgba(26,26,46,0.08)" sub={`${banks.length} bank${banks.length !== 1 ? 's' : ''}`} />
      </div>

      {/* Cash Flow Chart */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Cash Flow</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Credit vs Debit over time</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['daily', 'monthly'].map((v) => (
              <button
                key={v}
                className={`btn btn-sm ${view === v ? 'btn-primary' : ''}`}
                onClick={() => setView(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="creditG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22C55E" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="debitG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey={view === 'daily' ? 'date' : 'month'}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickFormatter={(v) => view === 'daily' ? v.slice(5) : v.slice(0, 3)}
                axisLine={{ stroke: 'var(--border)' }} tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={fmtShort} axisLine={false} tickLine={false} width={60} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="credit" name="Credit" stroke="#22C55E" fill="url(#creditG)" strokeWidth={2} />
              <Area type="monotone" dataKey="debit" name="Debit" stroke="#EF4444" fill="url(#debitG)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bottom Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Category Breakdown */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Spending by Category</div>
          {loading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={(stats?.byCategory || []).filter((c) => c.debit > 0)}
                    dataKey="debit" nameKey="category"
                    cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}
                  >
                    {(stats?.byCategory || []).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [fmtShort(v), 'Debit']} contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {(stats?.byCategory || []).filter((c) => c.debit > 0).slice(0, 6).map((c, i) => (
                  <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{c.category}</span>
                    <span className="text-danger" style={{ fontSize: 11, fontWeight: 600 }}>{fmtShort(c.debit)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Monthly Bar + Bank */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Monthly Net Flow</div>
          {loading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats?.monthly || []} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={(v) => v.slice(0, 3)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={fmtShort} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="credit" name="Credit" fill="#22C55E" radius={[3, 3, 0, 0]} maxBarSize={30} />
                <Bar dataKey="debit" name="Debit" fill="#EF4444" radius={[3, 3, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Bank breakdown */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>By Bank</div>
            {(stats?.byBank || []).map((b, i) => (
              <div key={b.bank} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 11 }}>
                <Building2 size={12} color={CHART_COLORS[i % CHART_COLORS.length]} />
                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{b.bank}</span>
                <span className="text-success" style={{ fontSize: 10, fontWeight: 600 }}>+{fmtShort(b.credit)}</span>
                <span className="text-danger" style={{ fontSize: 10, fontWeight: 600 }}>-{fmtShort(b.debit)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Uploads */}
      {reports.length > 0 && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <FileBarChart size={16} color="var(--accent)" />
            <span style={{ fontSize: 15, fontWeight: 600 }}>Recent Uploads</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {reports.slice(0, 3).map((r) => (
              <div key={r.uploadId} style={{
                padding: 16, borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)', background: 'var(--bg-page)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {new Date(r.uploadedAt).toLocaleString()}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Files:</span> <strong>{r.totalFiles}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Entries:</span> <strong>{r.totalEntries}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Unique:</span> <strong className="text-success">{r.totalUnique}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Duplicates:</span> <strong className="text-danger">{r.totalDuplicates}</strong></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
