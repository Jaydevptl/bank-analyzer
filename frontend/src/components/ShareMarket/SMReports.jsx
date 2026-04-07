import React, { useState, useEffect } from 'react';
import { FileBarChart, ChevronDown, ChevronUp, RefreshCw, Calendar, Files } from 'lucide-react';
import { getTradeReports } from '../../services/api';

const fmt = (n) => n ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '0';

export default function SMReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await getTradeReports();
      setReports(data.reports || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>;
  }

  if (reports.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><FileBarChart size={28} color="var(--accent)" /></div>
        <h3>No upload reports yet</h3>
        <p>Upload broker statements to generate reports</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Upload Reports</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{reports.length} uploads</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /></button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reports.map(r => {
          const isExpanded = expandedId === r.uploadId;
          const brokers = [...new Set((r.files || []).map(f => f.broker))];
          return (
            <div key={r.uploadId} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                onClick={() => setExpandedId(isExpanded ? null : r.uploadId)}
                style={{
                  padding: '16px 20px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 16,
                  background: isExpanded ? 'var(--bg-hover)' : 'var(--bg-surface)',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--radius-lg)',
                  background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <FileBarChart size={18} color="var(--accent)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Upload {r.uploadId}</div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={11} /> {new Date(r.uploadedAt).toLocaleString()}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Files size={11} /> {(r.files || []).length} files
                    </span>
                    {brokers.length > 0 && (
                      <span>Brokers: {brokers.join(', ')}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{r.summary?.totalTrades || 0}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Trades</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--warning)' }}>{fmt(r.summary?.totalCharges || 0)}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Charges</div>
                  </div>
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', padding: 20 }}>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>File</th><th>Broker</th><th>Account Holder</th><th>Client ID</th>
                          <th>Trades</th><th>Buy</th><th>Sell</th><th>Brokerage</th><th>STT</th><th>Errors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(r.files || []).map((f, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 500 }}>{f.fileName}</td>
                            <td><span className="badge badge-info">{f.broker}</span></td>
                            <td>{f.accountHolder || '-'}</td>
                            <td style={{ fontSize: 11 }}>{f.accountId || '-'}</td>
                            <td style={{ fontWeight: 600 }}>{f.totalTrades}</td>
                            <td>{f.buyTrades}</td>
                            <td>{f.sellTrades}</td>
                            <td className="text-warning">{fmt(f.totalBrokerage)}</td>
                            <td>{fmt(f.totalSTT)}</td>
                            <td className="text-danger">{f.errors}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
