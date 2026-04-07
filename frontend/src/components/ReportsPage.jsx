import React, { useState, useEffect } from 'react';
import { FileBarChart, ChevronDown, ChevronUp, RefreshCw, Calendar, Files, CheckCircle2, AlertTriangle, XCircle, Download, Trash2 } from 'lucide-react';
import { getReports } from '../services/api';
import axios from 'axios';

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await getReports();
      setReports(data.reports || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggle = (id) => setExpandedId(expandedId === id ? null : id);

  const handleDeleteReport = async (e, uploadId) => {
    e.stopPropagation();
    if (!confirm('Delete this upload report? It will move to recycle bin.')) return;
    try {
      await axios.delete(`/api/reports/${uploadId}`);
      setReports(prev => prev.filter(r => r.uploadId !== uploadId));
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.error || err.message));
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><FileBarChart size={28} color="var(--accent)" /></div>
        <h3>No upload reports yet</h3>
        <p>Upload bank statements to generate reports</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Upload Reports</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{reports.length} uploads</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reports.map((r) => (
          <div key={r.uploadId} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Report Header */}
            <div
              onClick={() => toggle(r.uploadId)}
              style={{
                padding: '16px 20px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 16,
                background: expandedId === r.uploadId ? 'var(--bg-hover)' : 'var(--bg-surface)',
                transition: 'background 0.15s',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 'var(--radius-lg)',
                background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <FileBarChart size={18} color="var(--accent)" />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                  Upload {r.uploadId}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={11} /> {new Date(r.uploadedAt).toLocaleString()}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Files size={11} /> {r.totalFiles} files
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{r.totalEntries}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)' }}>{r.totalUnique}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Unique</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--warning)' }}>{r.totalDuplicates}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Dupes</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: r.totalErrors > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{r.totalErrors}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Errors</div>
                </div>
                <button
                  onClick={(e) => handleDeleteReport(e, r.uploadId)}
                  title="Delete report"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', padding: 4, borderRadius: 'var(--radius)', opacity: 0.6, transition: 'opacity 0.15s' }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                >
                  <Trash2 size={15} />
                </button>
                {expandedId === r.uploadId ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
              </div>
            </div>

            {/* Expanded Details */}
            {expandedId === r.uploadId && (
              <div style={{ borderTop: '1px solid var(--border)', padding: 20 }}>
                {/* Per-file table */}
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>File Breakdown</div>
                <div className="table-wrapper" style={{ marginBottom: 16 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>File Name</th>
                        <th>Bank</th>
                        <th>Account Holder</th>
                        <th>Account No</th>
                        <th>Template</th>
                        <th>Rows</th>
                        <th>Unique</th>
                        <th>Duplicates</th>
                        <th>Errors</th>
                        <th>Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(r.files || []).map((f, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 500 }}>{f.fileName}</td>
                          <td><span className="badge badge-info">{f.bankName}</span></td>
                          <td>{f.accountHolder || '-'}</td>
                          <td style={{ fontSize: 11 }}>{f.accountNumber || '-'}</td>
                          <td style={{ fontSize: 11 }}>{f.templateUsed}</td>
                          <td style={{ fontWeight: 600 }}>{f.totalRows}</td>
                          <td className="text-success" style={{ fontWeight: 600 }}>{f.uniqueEntries}</td>
                          <td className="text-warning" style={{ fontWeight: 600 }}>{f.duplicates}</td>
                          <td className="text-danger" style={{ fontWeight: 600 }}>{f.errors}</td>
                          <td>
                            {f.savedFileName ? (
                              <a
                                href={`/api/reports/download/${encodeURIComponent(f.savedFileName)}`}
                                className="btn btn-ghost btn-xs"
                                style={{ color: 'var(--info)' }}
                                title="Download original file"
                              >
                                <Download size={14} />
                              </a>
                            ) : (
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>N/A</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Duplicate details */}
                {(r.files || []).some(f => (f.duplicateDetails || []).length > 0) && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={13} color="var(--warning)" /> Duplicate Details
                    </div>
                    <div style={{ padding: 12, background: 'rgba(245,158,11,0.06)', borderRadius: 'var(--radius)', border: '1px solid rgba(245,158,11,0.15)' }}>
                      {(r.files || []).flatMap(f => f.duplicateDetails || []).map((d, i) => (
                        <div key={i} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                          <span className="text-warning" style={{ fontWeight: 600 }}>{d.amount}</span>
                          {' - '}
                          {(d.description || '').substring(0, 60)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error details */}
                {(r.files || []).some(f => (f.errorDetails || []).length > 0) && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <XCircle size={13} color="var(--danger)" /> Error Details
                    </div>
                    <div style={{ padding: 12, background: 'var(--danger-bg)', borderRadius: 'var(--radius)', border: '1px solid rgba(239,68,68,0.15)' }}>
                      {(r.files || []).flatMap(f => f.errorDetails || []).map((e, i) => (
                        <div key={i} style={{ fontSize: 11, padding: '4px 0', color: 'var(--danger)' }}>{e}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
