import React, { useState } from 'react';
import {
  X, Wallet, Upload, Download, AlertCircle, CheckCircle2,
  ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react';
import { addTransaction, bulkAddTransactions } from '../services/api';

const CATEGORIES = [
  'Salary', 'Amazon / E-commerce', 'Supplier Payment', 'Logistics',
  'Utilities', 'Advertising', 'Transfer', 'Fixed Deposit', 'Personal',
  'UPI Payment', 'Bank Charges', 'Interest', 'Tax / GST', 'Rent', 'Loan', 'Uncategorized',
];

const lbl = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };

const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

// ─── Add Single Cash Entry Modal ─────────────────────────────────────────────

export function AddCashModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    date: todayStr(),
    description: '',
    type: 'debit',
    amount: '',
    category: 'Uncategorized',
    accountHolder: '',
    referenceNo: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const amt = parseFloat(form.amount);
    if (!form.date || !form.description.trim() || !amt || amt <= 0) {
      setErr('Date, description aur valid amount zaroori hai');
      return;
    }
    setSaving(true);
    try {
      await addTransaction({
        date: form.date,
        description: form.description.trim(),
        debit: form.type === 'debit' ? amt : 0,
        credit: form.type === 'credit' ? amt : 0,
        bankName: 'Cash',
        accountHolder: form.accountHolder.trim(),
        category: form.category,
        referenceNo: form.referenceNo.trim(),
      });
      onSaved?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} className="card"
        style={{ width: '100%', maxWidth: 520, padding: 24, background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={18} /> Add Cash Entry
          </h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Date *</label>
              <input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} required />
            </div>
            <div>
              <label style={lbl}>Type *</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => set('type', 'debit')}
                  className="btn btn-sm" style={{
                    flex: 1,
                    background: form.type === 'debit' ? 'rgba(239,68,68,0.12)' : 'transparent',
                    color: form.type === 'debit' ? 'var(--danger)' : 'var(--text-secondary)',
                    border: `1px solid ${form.type === 'debit' ? 'var(--danger)' : 'var(--border)'}`,
                  }}>
                  <ArrowUpCircle size={13} /> Debit
                </button>
                <button type="button" onClick={() => set('type', 'credit')}
                  className="btn btn-sm" style={{
                    flex: 1,
                    background: form.type === 'credit' ? 'rgba(34,197,94,0.12)' : 'transparent',
                    color: form.type === 'credit' ? 'var(--success)' : 'var(--text-secondary)',
                    border: `1px solid ${form.type === 'credit' ? 'var(--success)' : 'var(--border)'}`,
                  }}>
                  <ArrowDownCircle size={13} /> Credit
                </button>
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Description *</label>
              <input className="input" value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="e.g. Office stationery, Tea & snacks" required />
            </div>

            <div>
              <label style={lbl}>Amount (₹) *</label>
              <input type="number" step="0.01" min="0" className="input"
                value={form.amount} onChange={(e) => set('amount', e.target.value)}
                placeholder="0.00" required />
            </div>
            <div>
              <label style={lbl}>Category</label>
              <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label style={lbl}>Account Holder</label>
              <input className="input" value={form.accountHolder}
                onChange={(e) => set('accountHolder', e.target.value)}
                placeholder="optional" />
            </div>
            <div>
              <label style={lbl}>Reference / Notes</label>
              <input className="input" value={form.referenceNo}
                onChange={(e) => set('referenceNo', e.target.value)}
                placeholder="optional" />
            </div>
          </div>

          {err && (
            <div style={{
              marginTop: 12, padding: '8px 10px', borderRadius: 6,
              background: 'rgba(239,68,68,0.10)', color: 'var(--danger)', fontSize: 12,
            }}>{err}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── CSV Helpers ──────────────────────────────────────────────────────────────

const TEMPLATE_HEADERS = ['date', 'description', 'debit', 'credit', 'category', 'holder', 'notes'];
const TEMPLATE_CSV = [
  TEMPLATE_HEADERS.join(','),
  '2026-04-15,Office stationery,500,0,Utilities,,Pen and paper',
  '2026-04-16,Cash deposit from sales,0,12000,Salary,,',
  '2026-04-18,Tea & snacks,150,0,Personal,,daily expense',
].join('\n');

function parseCSV(text) {
  const rows = [];
  let cur = '', row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some(c => c.trim() !== '')) rows.push(row);
        row = [];
      } else cur += ch;
    }
  }
  if (cur !== '' || row.length > 0) { row.push(cur); if (row.some(c => c.trim() !== '')) rows.push(row); }
  return rows;
}

function normalizeDate(s) {
  if (!s) return null;
  s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let yr = m[3]; if (yr.length === 2) yr = (parseInt(yr) > 50 ? '19' : '20') + yr;
    return `${yr}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  return null;
}

function parseNum(s) {
  if (s == null) return 0;
  const cleaned = String(s).replace(/[,\s₹]/g, '').trim();
  if (!cleaned) return 0;
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

const HEADER_ALIASES = {
  date: ['date', 'dt', 'txn date', 'transaction date'],
  description: ['description', 'desc', 'particular', 'particulars', 'perticular', 'perticulars', 'narration', 'details', 'name'],
  debit: ['debit', 'dr', 'withdrawal', 'paid', 'out'],
  credit: ['credit', 'cr', 'deposit', 'received', 'in'],
  category: ['category', 'cat', 'type'],
  holder: ['holder', 'account holder', 'account', 'party'],
  notes: ['notes', 'note', 'reference', 'ref', 'remark', 'remarks'],
  mode: ['mode', 'payment mode', 'method'],
};

function findHeaderIdx(headers, key) {
  const aliases = HEADER_ALIASES[key] || [key];
  for (const a of aliases) {
    const i = headers.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'cash_entries_template.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Bulk Cash CSV Upload Modal ──────────────────────────────────────────────

export function BulkCashUploadModal({ onClose, onDone }) {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      setErrors([{ line: 0, error: 'File khali hai ya headers nahi mile' }]);
      setParsed([]);
      return;
    }
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const iDate   = findHeaderIdx(headers, 'date');
    const iDesc   = findHeaderIdx(headers, 'description');
    const iDebit  = findHeaderIdx(headers, 'debit');
    const iCredit = findHeaderIdx(headers, 'credit');
    const iCat    = findHeaderIdx(headers, 'category');
    const iHolder = findHeaderIdx(headers, 'holder');
    const iNotes  = findHeaderIdx(headers, 'notes');
    const iMode   = findHeaderIdx(headers, 'mode');

    if (iDate < 0 || iDesc < 0) {
      setErrors([{ line: 0, error: `Required headers missing. Found: ${headers.join(', ')}. Need date + description (or aliases like Particular/Narration).` }]);
      setParsed([]);
      return;
    }

    const ok = [], errs = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const lineNo = r + 1;
      const rawDate = cells[iDate];
      const date = normalizeDate(rawDate);
      const desc = (cells[iDesc] || '').trim();
      const debit  = iDebit  >= 0 ? parseNum(cells[iDebit])  : 0;
      const credit = iCredit >= 0 ? parseNum(cells[iCredit]) : 0;
      const mode   = iMode   >= 0 ? (cells[iMode] || '').trim() : '';

      if (!date) { errs.push({ line: lineNo, error: `invalid/missing date: "${rawDate || ''}"` }); continue; }
      if (!desc) { errs.push({ line: lineNo, error: 'description khali hai' }); continue; }
      if (debit <= 0 && credit <= 0) { errs.push({ line: lineNo, error: 'debit ya credit > 0 hona chahiye' }); continue; }

      const bankName = !mode || /^cash$/i.test(mode) ? 'Cash' : mode;

      ok.push({
        date, description: desc, debit, credit, bankName,
        category: iCat >= 0 ? (cells[iCat] || '').trim() || 'Uncategorized' : 'Uncategorized',
        accountHolder: iHolder >= 0 ? (cells[iHolder] || '').trim() : '',
        referenceNo: iNotes >= 0 ? (cells[iNotes] || '').trim() : '',
      });
    }
    setParsed(ok);
    setErrors(errs);
  };

  const doImport = async () => {
    if (parsed.length === 0) return;
    setImporting(true);
    try {
      const { data } = await bulkAddTransactions(parsed);
      setResult({
        unique: data.unique || 0,
        duplicates: data.duplicates || 0,
        errors: data.errors || [],
      });
    } catch (e) {
      setResult({ unique: 0, duplicates: 0, errors: [{ line: 0, error: e?.response?.data?.error || e.message }] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} className="card"
        style={{ width: '100%', maxWidth: 720, padding: 24, background: 'var(--bg-surface)', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Upload size={18} /> Bulk Upload Cash Entries
          </h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>

        {!result && (
          <>
            <div style={{
              padding: 12, background: 'rgba(59,130,246,0.06)',
              borderRadius: 8, fontSize: 12, marginBottom: 14,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Steps:</div>
              <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Template download karo, ya apna existing format use karo</li>
                <li>Headers (case-insensitive): <code>date</code>, <code>description</code> (ya <code>Particular</code>/<code>Narration</code>), <code>debit</code>, <code>credit</code>, optional: <code>mode</code>, <code>category</code>, <code>holder</code>, <code>notes</code></li>
                <li>Date: <code>YYYY-MM-DD</code>, <code>DD/MM/YYYY</code>, <code>DD-MM-YYYY</code>, <code>DD.MM.YYYY</code> — sab chalenge</li>
                <li>Numbers: <code>8,00,000.00</code> Indian format chalega. Excel se → <b>Save As CSV</b> → upload</li>
              </ol>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button className="btn btn-sm" onClick={downloadTemplate}>
                <Download size={13} /> Download Template
              </button>
              <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
                <Upload size={13} /> {fileName ? 'Change File' : 'Choose CSV'}
                <input type="file" accept=".csv,text/csv"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  style={{ display: 'none' }} />
              </label>
              {fileName && <span style={{ fontSize: 12, alignSelf: 'center', color: 'var(--text-muted)' }}>{fileName}</span>}
            </div>

            {(parsed.length > 0 || errors.length > 0) && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{
                  flex: 1, padding: 10, borderRadius: 8,
                  background: 'rgba(34,197,94,0.08)', color: 'var(--success)',
                  fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <CheckCircle2 size={14} /> {parsed.length} valid rows ready
                </div>
                {errors.length > 0 && (
                  <div style={{
                    flex: 1, padding: 10, borderRadius: 8,
                    background: 'rgba(239,68,68,0.08)', color: 'var(--danger)',
                    fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <AlertCircle size={14} /> {errors.length} skipped
                  </div>
                )}
              </div>
            )}

            {errors.length > 0 && (
              <div style={{
                maxHeight: 120, overflow: 'auto', marginBottom: 12,
                border: '1px solid var(--border)', borderRadius: 6, padding: 8, fontSize: 11,
              }}>
                {errors.slice(0, 50).map((e, i) => (
                  <div key={i} style={{ color: 'var(--danger)' }}>
                    Line {e.line}: {e.error}
                  </div>
                ))}
                {errors.length > 50 && <div style={{ color: 'var(--text-muted)' }}>... +{errors.length - 50} more</div>}
              </div>
            )}

            {parsed.length > 0 && (
              <div style={{
                maxHeight: 240, overflow: 'auto', marginBottom: 14,
                border: '1px solid var(--border)', borderRadius: 6,
              }}>
                <table style={{ width: '100%', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 100).map((r, i) => (
                      <tr key={i}>
                        <td>{r.date}</td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</td>
                        <td style={{ color: r.debit > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{r.debit || '-'}</td>
                        <td style={{ color: r.credit > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{r.credit || '-'}</td>
                        <td>{r.category}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.length > 100 && (
                  <div style={{ padding: 8, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                    ...preview limited to 100 rows. Total: {parsed.length}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary btn-sm"
                disabled={importing || parsed.length === 0}
                onClick={doImport}>
                {importing ? 'Importing...' : `Import ${parsed.length} entries`}
              </button>
            </div>
          </>
        )}

        {result && (
          <>
            <div style={{
              padding: 16, borderRadius: 8, marginBottom: 14,
              background: result.unique > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              color: result.unique > 0 ? 'var(--success)' : 'var(--danger)',
              fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {result.unique > 0 ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              {result.unique} new entries → Pending
              {result.duplicates > 0 && `, ${result.duplicates} duplicates skipped`}
              {result.errors.length > 0 && `, ${result.errors.length} failed`}
            </div>
            {result.errors.length > 0 && (
              <div style={{
                maxHeight: 200, overflow: 'auto', marginBottom: 14,
                border: '1px solid var(--border)', borderRadius: 6, padding: 8, fontSize: 11,
              }}>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ color: 'var(--danger)' }}>Line {e.line}: {e.error}</div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={onDone}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
