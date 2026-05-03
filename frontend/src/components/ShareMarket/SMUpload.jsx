import React, { useState, useEffect, useRef } from 'react';
import { Upload, X, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { uploadTrades, getStockAccounts } from '../../services/api';

const FILE_TYPES = [
  { value: 'auto', label: 'Auto Detect' },
  { value: 'ledger', label: 'Ledger' },
  { value: 'pnl', label: 'P&L Report' },
];

export default function SMUpload({ onDone }) {
  const [files, setFiles] = useState([]);
  const [fileMeta, setFileMeta] = useState({});
  const [existingAccounts, setExistingAccounts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    getStockAccounts().then(({ data }) => setExistingAccounts(data.accounts || [])).catch(() => {});
  }, []);

  const handleFiles = (e) => {
    const newFiles = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...newFiles]);
    const newMeta = { ...fileMeta };
    newFiles.forEach(f => {
      if (!newMeta[f.name]) {
        newMeta[f.name] = { accountName: '', fileType: 'auto' };
      }
    });
    setFileMeta(newMeta);
    e.target.value = '';
  };

  const removeFile = (name) => {
    setFiles(prev => prev.filter(f => f.name !== name));
    const m = { ...fileMeta };
    delete m[name];
    setFileMeta(m);
  };

  const updateMeta = (name, key, val) => {
    setFileMeta(prev => ({ ...prev, [name]: { ...prev[name], [key]: val } }));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setProgress(0);
    setResults(null);
    try {
      const { data } = await uploadTrades(files, fileMeta, setProgress);
      setResults(data);
      setFiles([]);
      setFileMeta({});
      // Refresh accounts list
      getStockAccounts().then(({ data }) => setExistingAccounts(data.accounts || [])).catch(() => {});
    } catch (err) {
      setResults({ error: err.response?.data?.error || err.message });
    }
    setUploading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    const valid = droppedFiles.filter(f => /\.(csv|xlsx|xls)$/i.test(f.name));
    if (valid.length > 0) {
      setFiles(prev => [...prev, ...valid]);
      const newMeta = { ...fileMeta };
      valid.forEach(f => {
        if (!newMeta[f.name]) newMeta[f.name] = { accountName: '', fileType: 'auto' };
      });
      setFileMeta(newMeta);
    }
  };

  return (
    <div>
      {/* Drop Zone */}
      <div
        className="card"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
          border: '2px dashed var(--border)', borderRadius: 'var(--radius)',
          marginBottom: 20,
        }}
      >
        <Upload size={32} style={{ margin: '0 auto 12px', color: 'var(--accent)' }} />
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, color: 'var(--text-primary)' }}>
          Drag & drop Excel files
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Supports CSV, XLSX, XLS — Ledger & P&L reports
        </div>
        <input ref={fileRef} type="file" multiple accept=".csv,.xlsx,.xls" onChange={handleFiles} style={{ display: 'none' }} />
      </div>

      {/* File Queue */}
      {files.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {files.length} FILE{files.length > 1 ? 'S' : ''} QUEUED
            </span>
            <button className="btn btn-ghost btn-xs" onClick={() => { setFiles([]); setFileMeta({}); }}>Clear all</button>
          </div>

          {files.map(f => (
            <div key={f.name} style={{
              padding: '14px 16px', marginBottom: 10, borderRadius: 'var(--radius)',
              border: '1px solid var(--border)', background: 'var(--bg-surface)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileSpreadsheet size={16} color="var(--accent)" />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(f.size / 1024).toFixed(1)} KB</span>
                </div>
                <button className="btn btn-ghost btn-xs" onClick={() => removeFile(f.name)}>
                  <X size={14} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }}>
                    Account Name
                  </label>
                  <input
                    className="input"
                    list={`acc-${f.name}`}
                    placeholder="e.g. Zerodha - Jaydev"
                    value={fileMeta[f.name]?.accountName || ''}
                    onChange={(e) => updateMeta(f.name, 'accountName', e.target.value)}
                    style={{ fontSize: 12 }}
                  />
                  <datalist id={`acc-${f.name}`}>
                    {existingAccounts.map(a => <option key={a.account_name} value={a.account_name} />)}
                  </datalist>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }}>
                    File Type
                  </label>
                  <select
                    className="input"
                    value={fileMeta[f.name]?.fileType || 'auto'}
                    onChange={(e) => updateMeta(f.name, 'fileType', e.target.value)}
                    style={{ fontSize: 12 }}
                  >
                    {FILE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}

          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={uploading}
            style={{ width: '100%', marginTop: 8, fontWeight: 600 }}
          >
            {uploading ? `Uploading... ${progress}%` : `Upload ${files.length} File${files.length > 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Results */}
      {results && !results.error && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <CheckCircle2 size={18} color="var(--success)" />
            <span style={{ fontWeight: 600, color: 'var(--success)' }}>Upload Successful</span>
          </div>

          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>File</th>
                <th>Account</th>
                <th>Type</th>
                <th>Entries</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {(results.files || []).map((f, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 12 }}>{f.fileName}</td>
                  <td style={{ fontSize: 12 }}>{f.accountName || '-'}</td>
                  <td>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600,
                      background: f.fileType === 'ledger' ? 'rgba(59,130,246,0.1)' : 'rgba(34,197,94,0.1)',
                      color: f.fileType === 'ledger' ? 'var(--info)' : 'var(--success)',
                    }}>
                      {f.fileType === 'ledger' ? 'Ledger' : 'P&L'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, fontWeight: 600 }}>{f.entries}</td>
                  <td style={{ fontSize: 12, color: f.errors?.length > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {f.errors?.length || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {results.files?.some(f => f.errors?.length > 0) && (
            <div style={{ marginTop: 12 }}>
              {results.files.filter(f => f.errors?.length > 0).map((f, i) => (
                <div key={i} style={{ background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 6, fontSize: 12, color: 'var(--danger)', marginBottom: 4 }}>
                  {f.fileName}: {f.errors.join(', ')}
                </div>
              ))}
            </div>
          )}

          <button className="btn btn-primary btn-sm" onClick={onDone} style={{ marginTop: 16 }}>
            Go to Overview
          </button>
        </div>
      )}

      {results?.error && (
        <div className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)' }}>
          <AlertCircle size={16} /> {results.error}
        </div>
      )}
    </div>
  );
}
