import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Upload, FileText, Check, X, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
import {
  finoListUploads, finoGetUpload, finoCreateUpload,
  finoUpdateUploadedTxn, finoImportUploadTxns, finoSkipUploadTxns,
  finoDeleteUpload,
  finoListBanks, finoListCC,
} from '../../services/api';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);

const CATEGORIES = [
  'UPI Payment', 'Bank Transfer', 'Cash Withdrawal', 'Card Payment', 'Gift Cards',
  'CC Payment', 'Salary', 'EMI', 'Bank Interest', 'Bank Charges',
  'Subscriptions', 'Insurance', 'Utilities', 'Ads/Marketing',
  'Internal Transfer', 'Loan', 'Other',
];

const CONFIDENCE_COLOR = (c) => c >= 0.8 ? '#22c55e' : c >= 0.5 ? '#f59e0b' : '#ef4444';

export default function StatementUploadPage() {
  const [step, setStep]               = useState('upload'); // upload | review | done
  const [uploadType, setUploadType]   = useState('bank_statement');
  const [accountId, setAccountId]     = useState('');
  const [banks, setBanks]             = useState([]);
  const [ccs, setCcs]                 = useState([]);
  const [file, setFile]               = useState(null);
  const [csvContent, setCsvContent]   = useState('');
  const [uploading, setUploading]     = useState(false);
  const [err, setErr]                 = useState(null);
  const [parseResult, setParseResult] = useState(null); // { upload, parsed, matched }
  const [detail, setDetail]           = useState(null); // { upload, transactions }
  const [selected, setSelected]       = useState(new Set());
  const [history, setHistory]         = useState([]);
  const [importSummary, setImportSummary] = useState(null);

  const reloadHistory = useCallback(async () => {
    try {
      const r = await finoListUploads();
      setHistory(r.data.uploads || []);
    } catch (_) { setHistory([]); }
  }, []);

  useEffect(() => {
    finoListBanks()
      .then(r => setBanks(Array.isArray(r.data?.accounts) ? r.data.accounts : Array.isArray(r.data?.banks) ? r.data.banks : []))
      .catch(() => setBanks([]));
    finoListCC()
      .then(r => setCcs(Array.isArray(r.data?.cards) ? r.data.cards : []))
      .catch(() => setCcs([]));
    reloadHistory();
  }, [reloadHistory]);

  const onFile = (f) => {
    setErr(null);
    if (!f) { setFile(null); setCsvContent(''); return; }
    if (!/\.csv$/i.test(f.name)) { setErr('Please pick a .csv file'); return; }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setCsvContent(String(e.target.result || ''));
    reader.onerror = () => setErr('Could not read file');
    reader.readAsText(f);
  };

  const onUpload = async () => {
    setErr(null);
    if (!accountId) return setErr('Select an account');
    if (!csvContent) return setErr('Pick a CSV file');
    setUploading(true);
    try {
      const r = await finoCreateUpload({
        uploadType, accountId, fileName: file?.name, csvContent,
      });
      setParseResult(r.data);
      const det = await finoGetUpload(r.data.upload.id);
      setDetail(det.data);
      // Pre-select all unmatched
      const ids = new Set((det.data.transactions || [])
        .filter(t => t.match_status === 'unmatched')
        .map(t => t.id));
      setSelected(ids);
      setStep('review');
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally { setUploading(false); }
  };

  const reloadDetail = async () => {
    if (!detail?.upload?.id) return;
    const r = await finoGetUpload(detail.upload.id);
    setDetail(r.data);
  };

  const setRowCategory = async (txnId, cat) => {
    try {
      await finoUpdateUploadedTxn(txnId, { userCategory: cat });
      await reloadDetail();
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  };

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllUnmatched = () => {
    const ids = new Set((detail?.transactions || [])
      .filter(t => t.match_status === 'unmatched')
      .map(t => t.id));
    setSelected(ids);
  };

  const importSelected = async () => {
    if (selected.size === 0) return;
    setUploading(true);
    try {
      const r = await finoImportUploadTxns(detail.upload.id, [...selected]);
      await reloadDetail();
      await reloadHistory();
      // Compute import summary
      const det = await finoGetUpload(detail.upload.id);
      const txns = det.data.transactions || [];
      let dr = 0, cr = 0, importedCount = 0, matchedCount = 0, skippedCount = 0;
      for (const t of txns) {
        if (t.match_status === 'imported') {
          importedCount += 1;
          dr += Number(t.debit_amount  || 0);
          cr += Number(t.credit_amount || 0);
        } else if (t.match_status === 'matched')  matchedCount += 1;
        else if (t.match_status === 'skipped')   skippedCount += 1;
      }
      setImportSummary({
        imported: importedCount, matched: matchedCount, skipped: skippedCount,
        total_debits: dr, total_credits: cr,
        result: r.data,
      });
      setStep('done');
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
    finally { setUploading(false); }
  };

  const skipSelected = async () => {
    if (selected.size === 0) return;
    try {
      await finoSkipUploadTxns(detail.upload.id, [...selected]);
      await reloadDetail();
      setSelected(new Set());
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  };

  const reset = () => {
    setStep('upload');
    setFile(null); setCsvContent('');
    setParseResult(null); setDetail(null);
    setSelected(new Set()); setImportSummary(null);
    setErr(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Statement Import</h1>
        <StepIndicator step={step} />
      </div>

      {step === 'upload' && (
        <UploadStep
          uploadType={uploadType} setUploadType={setUploadType}
          accountId={accountId} setAccountId={setAccountId}
          banks={banks} ccs={ccs}
          file={file} csvContent={csvContent}
          onFile={onFile} onUpload={onUpload}
          uploading={uploading} err={err}
        />
      )}

      {step === 'review' && detail && (
        <ReviewStep
          parseResult={parseResult}
          detail={detail}
          selected={selected}
          onToggle={toggle}
          onSelectAllUnmatched={selectAllUnmatched}
          onSetCategory={setRowCategory}
          onImport={importSelected}
          onSkip={skipSelected}
          uploading={uploading}
          err={err}
          onBack={reset}
        />
      )}

      {step === 'done' && importSummary && (
        <DoneStep summary={importSummary} onAnother={reset} />
      )}

      {step === 'upload' && (
        <HistoryList history={history} onDelete={async (id) => {
          if (!confirm('Delete this upload? Imported ledger entries will be reversed.')) return;
          try { await finoDeleteUpload(id); await reloadHistory(); }
          catch (e) { alert(e?.response?.data?.error || e.message); }
        }} onView={async (id) => {
          const r = await finoGetUpload(id);
          setDetail(r.data);
          setSelected(new Set());
          setStep('review');
        }} />
      )}
    </div>
  );
}

function StepIndicator({ step }) {
  const steps = ['upload', 'review', 'done'];
  const labels = { upload: '1 · Upload', review: '2 · Review', done: '3 · Done' };
  const idx = steps.indexOf(step);
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {steps.map((s, i) => (
        <div key={s} style={{
          padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
          background: i <= idx ? 'var(--accent)' : 'var(--bg-surface)',
          color: i <= idx ? '#1A1A2E' : 'var(--text-muted)',
        }}>{labels[s]}</div>
      ))}
    </div>
  );
}

// ─── Step 1: Upload ──────────────────────────────────────────────────────────

function UploadStep({ uploadType, setUploadType, accountId, setAccountId, banks, ccs, file, csvContent, onFile, onUpload, uploading, err }) {
  const accounts = uploadType === 'bank_statement' ? banks : ccs;

  return (
    <div style={{ background: 'var(--bg-surface)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', marginBottom: 18 }}>
      <Field label="Account Type">
        <div style={{ display: 'flex', gap: 18 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
            <input type="radio" checked={uploadType === 'bank_statement'} onChange={() => { setUploadType('bank_statement'); setAccountId(''); }} />
            Bank Account
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
            <input type="radio" checked={uploadType === 'cc_statement'} onChange={() => { setUploadType('cc_statement'); setAccountId(''); }} />
            Credit Card
          </label>
        </div>
      </Field>

      <Field label="Select Account">
        <select className="input" value={accountId} onChange={e => setAccountId(e.target.value)} style={{ width: '100%', maxWidth: 480 }}>
          <option value="">— Select —</option>
          {uploadType === 'bank_statement'
            ? accounts.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.bank_name}){b.account_number_last4 ? ` ····${b.account_number_last4}` : ''}</option>)
            : accounts.map(c => <option key={c.id} value={c.id}>{c.card_label} · {c.bank_name}</option>)}
        </select>
      </Field>

      <Field label="CSV File">
        <label style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: 30, border: '2px dashed var(--border)', borderRadius: 10,
          cursor: 'pointer', background: 'var(--bg-page)',
        }}>
          <FileText size={28} style={{ opacity: 0.5 }} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>{file ? file.name : 'Click to browse for a CSV'}</div>
          {file && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(1)} KB · {csvContent.split('\n').length} lines</div>}
          {!file && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Supports HDFC, SBI, ICICI, Axis, Kotak — generic CSV with date / description / debit / credit columns</div>}
          <input type="file" accept=".csv" onChange={e => onFile(e.target.files?.[0])} style={{ display: 'none' }} />
        </label>
      </Field>

      {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
        <AlertCircle size={14} /> {err}
      </div>}

      <button className="btn btn-primary" onClick={onUpload} disabled={uploading || !file || !accountId} style={{ minWidth: 180, justifyContent: 'center' }}>
        <Upload size={14} /> {uploading ? 'Parsing…' : 'Upload & Parse'}
      </button>
    </div>
  );
}

// ─── Step 2: Review ──────────────────────────────────────────────────────────

function ReviewStep({ parseResult, detail, selected, onToggle, onSelectAllUnmatched, onSetCategory, onImport, onSkip, uploading, err, onBack }) {
  const txns = detail.transactions || [];
  const counts = useMemo(() => {
    const out = { matched: 0, unmatched: 0, imported: 0, skipped: 0 };
    for (const t of txns) out[t.match_status] = (out[t.match_status] || 0) + 1;
    return out;
  }, [txns]);

  return (
    <div style={{ background: 'var(--bg-surface)', padding: 18, borderRadius: 12, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Review Transactions — {txns.length} rows parsed</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>Auto-matched: <b style={{ color: 'var(--success)' }}>{counts.matched || 0}</b></span>
            <span>Unmatched: <b style={{ color: 'var(--warning)' }}>{counts.unmatched || 0}</b></span>
            <span>Imported: <b style={{ color: 'var(--accent)' }}>{counts.imported || 0}</b></span>
            <span>Skipped: <b style={{ color: 'var(--text-muted)' }}>{counts.skipped || 0}</b></span>
            {detail.upload.period_from && <span>Period: {detail.upload.period_from} → {detail.upload.period_to}</span>}
          </div>
        </div>
        <button className="btn btn-sm" onClick={onBack}>← Upload another</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={onSelectAllUnmatched}>Select All Unmatched</button>
        <button className="btn btn-sm btn-primary" disabled={uploading || selected.size === 0} onClick={onImport}>
          Import {selected.size > 0 ? `${selected.size} ` : ''}Selected
        </button>
        <button className="btn btn-sm" disabled={selected.size === 0} onClick={onSkip}>Skip Selected</button>
      </div>

      {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginBottom: 10 }}>{err}</div>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
              <th style={{ padding: '6px 8px', width: 28 }}></th>
              <th style={{ padding: '6px 8px' }}>Date</th>
              <th style={{ padding: '6px 8px' }}>Description</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Debit</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Credit</th>
              <th style={{ padding: '6px 8px' }}>Type</th>
              <th style={{ padding: '6px 8px' }}>Category</th>
              <th style={{ padding: '6px 8px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {txns.map(t => {
              const can = t.match_status === 'unmatched';
              const cat = t.user_category || t.detected_category || 'Other';
              return (
                <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <input type="checkbox" disabled={!can}
                      checked={selected.has(t.id)} onChange={() => onToggle(t.id)} />
                  </td>
                  <td style={{ padding: '6px 8px' }}>{t.txn_date}</td>
                  <td style={{ padding: '6px 8px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.description}>{t.description}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{t.debit_amount ? fmt(t.debit_amount) : ''}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: t.credit_amount ? 'var(--success)' : undefined }}>{t.credit_amount ? fmt(t.credit_amount) : ''}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6, background: 'var(--bg-page)', color: CONFIDENCE_COLOR(Number(t.detection_confidence || 0)), fontWeight: 600 }}>
                      ● {t.detected_type || 'unknown'}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <select className="input" style={{ fontSize: 11, padding: '2px 6px' }}
                      value={cat} disabled={!can}
                      onChange={e => onSetCategory(t.id, e.target.value)}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '6px 8px' }}><MatchStatus s={t.match_status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatchStatus({ s }) {
  const map = {
    matched:   { c: '#22c55e', label: '✅ matched (existing)' },
    imported:  { c: '#3b82f6', label: '✅ imported' },
    unmatched: { c: '#f59e0b', label: '⬜ unmatched' },
    skipped:   { c: '#94a3b8', label: '— skipped' },
  };
  const v = map[s] || map.unmatched;
  return <span style={{ fontSize: 10, color: v.c, fontWeight: 600 }}>{v.label}</span>;
}

// ─── Step 3: Done ────────────────────────────────────────────────────────────

function DoneStep({ summary, onAnother }) {
  const net = (Number(summary.total_credits) || 0) - (Number(summary.total_debits) || 0);
  return (
    <div style={{ background: 'var(--bg-surface)', padding: 28, borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
      <Check size={42} style={{ color: 'var(--success)', margin: '0 auto 10px', display: 'block' }} />
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Import Complete</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>The selected transactions have been added to the ledger.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 520, margin: '0 auto 16px' }}>
        <Stat label="Imported" value={summary.imported} color="var(--accent)" />
        <Stat label="Matched (existing)" value={summary.matched} color="var(--success)" />
        <Stat label="Skipped" value={summary.skipped} color="var(--text-muted)" />
      </div>

      <div style={{ display: 'inline-block', textAlign: 'left', padding: 12, background: 'var(--bg-page)', borderRadius: 8, fontSize: 12, marginBottom: 16 }}>
        <div>Total debits: <b style={{ color: 'var(--danger)' }}>{fmt(summary.total_debits)}</b></div>
        <div>Total credits: <b style={{ color: 'var(--success)' }}>{fmt(summary.total_credits)}</b></div>
        <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          Net: <b style={{ color: net >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(net)}</b>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={onAnother}><Upload size={14} /> Upload Another</button>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

// ─── Upload history ──────────────────────────────────────────────────────────

function HistoryList({ history, onDelete, onView }) {
  if (history.length === 0) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
        Upload History
      </div>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
              <th style={{ padding: '8px 10px' }}>Date</th>
              <th style={{ padding: '8px 10px' }}>File</th>
              <th style={{ padding: '8px 10px' }}>Type</th>
              <th style={{ padding: '8px 10px' }}>Period</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rows</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Matched</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Imported</th>
              <th style={{ padding: '8px 10px' }}>Status</th>
              <th style={{ padding: '8px 10px', width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {history.map(u => (
              <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{(u.created_at || '').slice(0, 10)}</td>
                <td style={{ padding: '8px 10px' }}>{u.file_name || '—'}</td>
                <td style={{ padding: '8px 10px', fontSize: 10, color: 'var(--text-muted)' }}>{u.upload_type}</td>
                <td style={{ padding: '8px 10px', fontSize: 10, color: 'var(--text-muted)' }}>{u.period_from || '—'} → {u.period_to || '—'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{u.parsed_rows || 0}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{u.matched_rows || 0}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{u.imported_rows || 0}</td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--bg-page)', fontWeight: 600 }}>{u.status}</span>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <button className="btn btn-ghost btn-xs" title="View" onClick={() => onView(u.id)}><RefreshCw size={11} /></button>
                  <button className="btn btn-ghost btn-xs" title="Delete + reverse" onClick={() => onDelete(u.id)} style={{ color: 'var(--danger)' }}><Trash2 size={11} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
