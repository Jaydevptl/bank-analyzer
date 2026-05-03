import React, { useRef, useState } from 'react';
import { Upload, CheckCircle2, AlertCircle, FileText, X, AlertTriangle } from 'lucide-react';
import { amzUpload } from '../../services/api';

const fmtNum = (n) => new Intl.NumberFormat('en-US').format(n);

export default function AmazonUpload({ onSuccess }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const doUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      const { data } = await amzUpload(file, setProgress);
      setResult(data);
      onSuccess?.();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ padding: 14, background: 'rgba(59,130,246,0.08)', borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
        <b>Amazon Business Order Report</b> — upload your CSV export. Processing is <b>idempotent</b>: re-uploading the same file (or an updated file) will:
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Update order status (unless order is already Closed — those are locked)</li>
          <li>Only create transactions for rows with <code>Payment Amount</code></li>
          <li>Use <code>OrderID + Amount + Date</code> as unique key → no duplicate transactions</li>
          <li>Unmapped last-4 digits reported so you can add missing cards</li>
        </ul>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => !file && inputRef.current?.click()}
        style={{
          border: '2px dashed var(--border)',
          borderRadius: 12,
          padding: 32,
          textAlign: 'center',
          cursor: file ? 'default' : 'pointer',
          background: 'var(--bg-surface)',
        }}
      >
        {!file ? (
          <>
            <Upload size={28} color="var(--accent)" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Click to select Amazon CSV</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Only .csv from Amazon Business portal</div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
            <FileText size={20} color="var(--info)" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{file.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </span>
            <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); setError(null); }}>
              <X size={14} />
            </button>
          </div>
        )}
        <input
          ref={inputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>

      {file && !uploading && !result && (
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 12, padding: 12, justifyContent: 'center' }} onClick={doUpload}>
          <Upload size={14} /> Process Report
        </button>
      )}

      {uploading && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
            <span>Processing — this may take a minute for large files...</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      {error && (
        <div className="card" style={{ marginTop: 16, padding: 14, borderLeft: '4px solid var(--danger)', display: 'flex', gap: 10 }}>
          <AlertCircle size={18} color="var(--danger)" />
          <div>
            <b style={{ color: 'var(--danger)', fontSize: 13 }}>Upload Failed</b>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{error}</div>
          </div>
        </div>
      )}

      {result && (
        <div className="card" style={{ marginTop: 16, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <CheckCircle2 size={20} color="var(--success)" />
            <b style={{ color: 'var(--success)', fontSize: 15 }}>Processed Successfully</b>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Total Rows',         value: result.totalRows },
              { label: 'Orders Created',     value: result.ordersCreated,        color: 'var(--success)' },
              { label: 'Orders Updated',     value: result.ordersUpdated,        color: 'var(--info)' },
              { label: 'Orders Locked',      value: result.ordersLocked,         color: 'var(--text-muted)' },
              { label: 'New Transactions',   value: result.transactionsCreated,  color: 'var(--success)' },
              { label: 'Duplicate Txns',     value: result.transactionsDuplicate,color: 'var(--warning)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text-primary)' }}>{fmtNum(value)}</div>
              </div>
            ))}
          </div>

          {result.unmappedLast4?.length > 0 && (
            <div style={{ padding: 12, background: 'rgba(245,158,11,0.10)', borderRadius: 8, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <AlertTriangle size={14} color="var(--warning)" />
                <b style={{ fontSize: 12, color: 'var(--warning)' }}>Unmapped Payment Identifiers</b>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
                These last-4 digits had payments but no matching card. Add them in the <b>Cards</b> tab to include in balances.
              </div>
              <table style={{ width: '100%', fontSize: 11 }}>
                <thead>
                  <tr><th>Last 4</th><th>Transactions</th><th>Sample Product</th></tr>
                </thead>
                <tbody>
                  {result.unmappedLast4.map(u => (
                    <tr key={u.last4}>
                      <td><code>{u.last4}</code></td>
                      <td>{u.count}</td>
                      <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.sampleTitle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.errors?.length > 0 && (
            <div style={{ padding: 12, background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
              <b style={{ fontSize: 12, color: 'var(--danger)' }}>{result.errors.length} Errors</b>
              <div style={{ fontSize: 11, marginTop: 6, maxHeight: 160, overflow: 'auto' }}>
                {result.errors.slice(0, 20).map((e, i) => (
                  <div key={i} style={{ padding: '2px 0' }}>Line {e.line}: {e.error}</div>
                ))}
              </div>
            </div>
          )}

          <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => { setFile(null); setResult(null); }}>
            Upload another
          </button>
        </div>
      )}
    </div>
  );
}
