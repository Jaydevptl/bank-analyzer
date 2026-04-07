import React, { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Receipt, RefreshCw, AlertCircle } from 'lucide-react';
import { getTradeCharges } from '../../services/api';

const fmt = (n) => n ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '0';
const fmtShort = (n) => {
  if (Math.abs(n) >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n.toFixed(0)}`;
};

const COLORS = ['#F0C93A', '#EF4444', '#3B82F6', '#22C55E', '#8B5CF6', '#F59E0B'];

function SummaryCard({ label, value, color }) {
  return (
    <div className="card card-sm" style={{ borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{fmt(value)}</div>
    </div>
  );
}

export default function ChargesReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await getTradeCharges();
      setData(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>;
  }

  if (!data || data.grandTotal === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Receipt size={28} color="var(--accent)" /></div>
        <h3>No charges data</h3>
        <p>Upload broker statements to see charges breakdown</p>
      </div>
    );
  }

  const pieData = [
    { name: 'Brokerage', value: data.totalBrokerage },
    { name: 'STT', value: data.totalSTT },
    { name: 'GST', value: data.totalGST },
    { name: 'Stamp Duty', value: data.totalStampDuty },
    { name: 'SEBI', value: data.totalSEBI },
    { name: 'Other', value: data.totalExchange + data.totalOther },
  ].filter(d => d.value > 0);

  // Estimate savings if at 0% brokerage (zerodha equity delivery)
  const savedAtZero = data.totalBrokerage * 1.18; // brokerage + GST on it

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Charges Report</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Detailed breakdown of all trading charges</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /></button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <SummaryCard label="Brokerage" value={data.totalBrokerage} color="#F0C93A" />
        <SummaryCard label="STT" value={data.totalSTT} color="#EF4444" />
        <SummaryCard label="GST" value={data.totalGST} color="#3B82F6" />
        <SummaryCard label="Stamp Duty" value={data.totalStampDuty} color="#22C55E" />
        <SummaryCard label="Grand Total" value={data.grandTotal} color="#8B5CF6" />
      </div>

      {/* Savings note */}
      <div className="card" style={{
        padding: '14px 18px',
        background: 'rgba(34,197,94,0.06)',
        border: '1px solid rgba(34,197,94,0.2)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <AlertCircle size={18} color="var(--success)" />
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          You paid <strong style={{ color: 'var(--danger)' }}>₹{fmt(data.totalBrokerage)}</strong> in brokerage.
          With a 0% brokerage broker (e.g. Zerodha equity delivery), you would have saved approximately <strong style={{ color: 'var(--success)' }}>₹{fmt(savedAtZero)}</strong> (incl. GST).
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Charges Split</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Monthly Charges Trend</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.byMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={fmtShort} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="brokerage" stroke="#F0C93A" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="stt" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="total" stroke="#1A1A2E" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tables row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>By Broker</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Broker</th><th>Brokerage</th><th>STT</th><th>GST</th><th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.byBroker.map(b => (
                  <tr key={b.broker}>
                    <td style={{ fontWeight: 500 }}>{b.broker}</td>
                    <td>{fmt(b.brokerage)}</td>
                    <td>{fmt(b.stt)}</td>
                    <td>{fmt(b.gst)}</td>
                    <td style={{ fontWeight: 700 }} className="text-danger">{fmt(b.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>By Segment</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Segment</th><th>Brokerage</th><th>STT</th><th>GST</th><th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.bySegment.map(s => (
                  <tr key={s.segment}>
                    <td style={{ fontWeight: 500 }}>{s.segment}</td>
                    <td>{fmt(s.brokerage)}</td>
                    <td>{fmt(s.stt)}</td>
                    <td>{fmt(s.gst)}</td>
                    <td style={{ fontWeight: 700 }} className="text-danger">{fmt(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* By Month full table */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Month-wise Charges</div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Month</th><th>Brokerage</th><th>STT</th><th>GST</th><th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.byMonth.map(m => (
                <tr key={m.month}>
                  <td style={{ fontWeight: 500 }}>{m.month}</td>
                  <td>{fmt(m.brokerage)}</td>
                  <td>{fmt(m.stt)}</td>
                  <td>{fmt(m.gst)}</td>
                  <td style={{ fontWeight: 700 }} className="text-danger">{fmt(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
