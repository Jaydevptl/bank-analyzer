import React, { useState, useRef, useCallback } from 'react';
import {
  Upload, FileText, X, CheckCircle2, AlertCircle,
  Loader2, CloudUpload, FileSpreadsheet, ChevronDown, ChevronUp, Download
} from 'lucide-react';
import { uploadFiles } from '../services/api';

const getFileIcon = (name) => {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return <FileText size={16} color="#EF4444" />;
  if (['xlsx', 'xls'].includes(ext)) return <FileSpreadsheet size={16} color="#22C55E" />;
  return <FileText size={16} color="#3B82F6" />;
};

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function FileUpload({ onSuccess }) {
  const [files, setFiles]         = useState([]);
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const inputRef                  = useRef(null);

  const onDragOver  = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = ()  => setDragging(false);
  const onDrop      = (e) => { e.preventDefault(); setDragging(false); addFiles([...e.dataTransfer.files]); };

  const addFiles = useCallback((incoming) => {
    const valid = incoming.filter((f) => {
      const ext = f.name.split('.').pop().toLowerCase();
      return ['csv', 'xlsx', 'xls', 'pdf'].includes(ext);
    });
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...valid.filter((f) => !existingNames.has(f.name))];
    });
    setResult(null);
    setError(null);
  }, []);

  const removeFile = (name) => setFiles((prev) => prev.filter((f) => f.name !== name));

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    setResult(null);
    try {
      const { data } = await uploadFiles(files, setProgress);
      setResult(data);
      if (data.summary?.totalUnique > 0) {
        setTimeout(() => onSuccess?.(), 2000);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const allDuplicates = (result?.files || []).flatMap(f => f.duplicateDetails || []);
  const allErrors = (result?.files || []).flatMap(f => f.errorDetails || []);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }} className="animate-fade-in">

      {/* Drop Zone */}
      <div
        className={`drop-zone ${dragging ? 'active' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !files.length && inputRef.current?.click()}
      >
        <div className="drop-icon">
          <CloudUpload size={26} color="var(--accent)" />
        </div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            {dragging ? 'Drop files here' : 'Drag & drop bank statements'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Supports CSV, XLSX, XLS, PDF
          </p>
        </div>
        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }} style={{ marginTop: 8 }}>
          <Upload size={13} /> Browse Files
        </button>
        <input ref={inputRef} type="file" multiple accept=".csv,.xlsx,.xls,.pdf" style={{ display: 'none' }} onChange={(e) => addFiles([...e.target.files])} />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {files.length} FILE{files.length !== 1 ? 'S' : ''} QUEUED
            </span>
            <button className="btn btn-ghost btn-xs" onClick={() => setFiles([])}>Clear all</button>
          </div>

          {files.map((file) => (
            <div key={file.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-light)' }}>
              {getFileIcon(file.name)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatSize(file.size)}</div>
              </div>
              <button onClick={() => removeFile(file.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', display: 'flex' }}>
                <X size={14} />
              </button>
            </div>
          ))}

          {/* Progress */}
          {uploading && (
            <div style={{ padding: '10px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span>Processing...</span>
                <span>{progress}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Upload button */}
          {!uploading && !result && (
            <div style={{ padding: '12px 16px' }}>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px' }} onClick={handleUpload}>
                <Upload size={14} /> Process {files.length} File{files.length !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {uploading && (
            <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Detecting banks & extracting transactions...
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card" style={{ marginTop: 16, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'flex-start', borderLeft: '4px solid var(--danger)' }}>
          <AlertCircle size={16} color="var(--danger)" />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', marginBottom: 2 }}>Upload Failed</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{error}</div>
          </div>
        </div>
      )}

      {/* Upload Report */}
      {result && (
        <div className="card animate-fade-in" style={{ marginTop: 16, padding: 24 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
            <CheckCircle2 size={22} color="var(--success)" />
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)' }}>Upload Successful</span>
          </div>

          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total Entries', value: result.summary?.totalEntries, color: 'var(--text-primary)' },
              { label: 'Unique', value: result.summary?.totalUnique, color: 'var(--success)' },
              { label: 'Duplicates', value: result.summary?.totalDuplicates, color: 'var(--warning)' },
              { label: 'Errors', value: result.summary?.totalErrors || 0, color: 'var(--danger)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: 'var(--bg-page)', borderRadius: 'var(--radius-lg)',
                padding: '14px 16px', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color, marginBottom: 2 }}>{value ?? '-'}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Per-file breakdown table */}
          <div className="table-wrapper" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Bank</th>
                  <th>Account Holder</th>
                  <th>Account No</th>
                  <th>Rows</th>
                  <th>Unique</th>
                  <th>Duplicates</th>
                  <th>Errors</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {(result.files || []).map((f, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{f.fileName}</td>
                    <td><span className="badge badge-info">{f.bankName}</span></td>
                    <td>{f.accountHolder || '-'}</td>
                    <td style={{ fontSize: 11 }}>{f.accountNumber || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{f.totalRows}</td>
                    <td className="text-success" style={{ fontWeight: 600 }}>{f.uniqueEntries}</td>
                    <td className="text-warning" style={{ fontWeight: 600 }}>{f.duplicates}</td>
                    <td className="text-danger" style={{ fontWeight: 600 }}>{f.errors}</td>
                    <td>
                      {f.savedFileName ? (
                        <a href={`/api/reports/download/${encodeURIComponent(f.savedFileName)}`} className="btn btn-ghost btn-xs" style={{ color: 'var(--info)' }} title="Download">
                          <Download size={14} />
                        </a>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Expandable Duplicates */}
          {allDuplicates.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowDuplicates(!showDuplicates)} style={{ gap: 4 }}>
                {showDuplicates ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {allDuplicates.length} Duplicate{allDuplicates.length !== 1 ? 's' : ''} Found
              </button>
              {showDuplicates && (
                <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-page)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  {allDuplicates.map((d, i) => (
                    <div key={i} style={{ fontSize: 11, padding: '4px 0', borderBottom: i < allDuplicates.length - 1 ? '1px solid var(--border-light)' : 'none', color: 'var(--text-secondary)' }}>
                      <span className="text-warning" style={{ fontWeight: 600 }}>{d.amount}</span>
                      {' - '}
                      {(d.description || '').substring(0, 50)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Expandable Errors */}
          {allErrors.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowErrors(!showErrors)} style={{ gap: 4 }}>
                {showErrors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {allErrors.length} Error{allErrors.length !== 1 ? 's' : ''}
              </button>
              {showErrors && (
                <div style={{ marginTop: 8, padding: 12, background: 'var(--danger-bg)', borderRadius: 'var(--radius)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {allErrors.map((e, i) => (
                    <div key={i} style={{ fontSize: 11, padding: '4px 0', color: 'var(--danger)' }}>{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p style={{ marginTop: 14, fontSize: 11, color: 'var(--text-muted)' }}>
            Redirecting to Reports...
          </p>
        </div>
      )}

      {/* Supported formats */}
      <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['IndusInd Bank', 'Axis Bank', 'Kotak Mahindra', 'HDFC Bank', 'SBI', 'ICICI Bank'].map((b) => (
          <span key={b} className="badge badge-muted">{b}</span>
        ))}
      </div>
    </div>
  );
}
