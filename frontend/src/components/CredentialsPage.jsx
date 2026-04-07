import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Lock, Eye, EyeOff, Plus, Trash2, Pencil, Search, Upload,
  RefreshCw, X, ArrowUp, ArrowDown, ChevronsUpDown, Save, KeyRound
} from 'lucide-react';
import {
  credHasPassword, credSetPassword, credVerifyPassword,
  getCredentials, addCredential, updateCredential, deleteCredential,
  bulkImportCredentials
} from '../services/api';

const FIELDS = [
  { key: 'name',        label: 'Name',          width: 140 },
  { key: 'bank',        label: 'Bank',          width: 130 },
  { key: 'accountType', label: 'Account Type',  width: 110 },
  { key: 'accountNo',   label: 'Account No.',   width: 140 },
  { key: 'crnNo',       label: 'CRN No.',       width: 110 },
  { key: 'ifsc',        label: 'IFSC',          width: 110 },
  { key: 'debitCardNo', label: 'Debit Card No.',width: 150 },
  { key: 'expiry',      label: 'Expiry',        width: 90 },
  { key: 'cvv',         label: 'CVV',           width: 60 },
  { key: 'username',    label: 'Username',      width: 120 },
  { key: 'password',    label: 'Password',      width: 120 },
  { key: 'phoneNo',     label: 'Phone No',      width: 120 },
  { key: 'used',        label: 'Used',          width: 100 },
  { key: 'pan',         label: 'PAN',           width: 110 },
  { key: 'cardPin',     label: 'Card Pin',      width: 80 },
  { key: 'mpin',        label: 'Mpin',          width: 80 },
  { key: 'dob',         label: 'DOB',           width: 100 },
  { key: 'link',        label: 'Link',          width: 150 },
];

const SENSITIVE_FIELDS = new Set(['cvv', 'password', 'cardPin', 'mpin']);
const EMPTY_ROW = Object.fromEntries(FIELDS.map(f => [f.key, '']));

// ─── Password Gate ────────────────────────────────────────────────────────────

function PasswordGate({ onUnlock }) {
  const [hasPassword, setHasPassword] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    credHasPassword().then(({ data }) => { setHasPassword(data.hasPassword); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleSetPassword = async () => {
    if (password.length < 1) { setError('Password is required'); return; }
    if (password !== confirmPw) { setError('Passwords do not match'); return; }
    setError('');
    try {
      await credSetPassword(password);
      onUnlock();
    } catch { setError('Failed to set password'); }
  };

  const handleVerify = async () => {
    if (!password) { setError('Enter password'); return; }
    setError('');
    try {
      const { data } = await credVerifyPassword(password);
      if (data.verified) onUnlock();
      else setError('Incorrect password');
    } catch { setError('Verification failed'); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="spinner" /></div>;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center', padding: 40 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <Lock size={28} color="var(--accent)" />
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
          {hasPassword ? 'Enter Password' : 'Set a Password'}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24 }}>
          {hasPassword ? 'This page is protected. Enter your password to access credentials.' : 'Create a password to protect your credentials page.'}
        </p>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            className="input"
            type={showPw ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (hasPassword ? handleVerify() : null)}
            style={{ paddingRight: 40 }}
          />
          <button onClick={() => setShowPw(!showPw)} style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex',
          }}>
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {!hasPassword && (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              className="input"
              type={showPw ? 'text' : 'password'}
              placeholder="Confirm Password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
            />
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: 10 }}
          onClick={hasPassword ? handleVerify : handleSetPassword}
        >
          <KeyRound size={14} />
          {hasPassword ? 'Unlock' : 'Set Password & Enter'}
        </button>
      </div>
    </div>
  );
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────

function CredentialModal({ credential, onSave, onClose }) {
  const [form, setForm] = useState(credential || { ...EMPTY_ROW });
  const [saving, setSaving] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch {}
    finally { setSaving(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div className="card" style={{ maxWidth: 700, width: '95%', maxHeight: '85vh', overflow: 'auto', padding: 28 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{credential ? 'Edit Credential' : 'Add New Credential'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {FIELDS.map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {f.label}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={SENSITIVE_FIELDS.has(f.key) && !showSensitive ? 'password' : 'text'}
                  value={form[f.key] || ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.label}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showSensitive} onChange={(e) => setShowSensitive(e.target.checked)} className="checkbox" />
            Show sensitive fields
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={14} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Credentials Page ────────────────────────────────────────────────────

function CredentialsTable() {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bankFilter, setBankFilter] = useState('all');
  const [columns, setColumns] = useState(FIELDS.map(f => ({ ...f })));
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [showSensitive, setShowSensitive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCred, setEditingCred] = useState(null);
  const resizingRef = useRef(null);
  const fileRef = useRef(null);

  const startResize = (e, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const col = columns.find(c => c.key === colKey);
    const startWidth = col.width;
    resizingRef.current = colKey;
    const onMouseMove = (ev) => {
      const diff = ev.clientX - startX;
      setColumns(prev => prev.map(c => c.key === colKey ? { ...c, width: Math.max(50, startWidth + diff) } : c));
    };
    const onMouseUp = () => { resizingRef.current = null; document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (bankFilter !== 'all') params.bank = bankFilter;
      const { data } = await getCredentials(params);
      setCredentials(data.credentials || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, bankFilter]);

  useEffect(() => { load(); }, [search, bankFilter]);

  const handleSort = (col) => {
    if (sortBy === col) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder('asc'); }
  };

  const sorted = [...credentials].sort((a, b) => {
    const va = (a[sortBy] || '').toString().toLowerCase();
    const vb = (b[sortBy] || '').toString().toLowerCase();
    return sortOrder === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const handleSave = async (form) => {
    if (editingCred) {
      const { data } = await updateCredential(editingCred.id, form);
      setCredentials(prev => prev.map(c => c.id === editingCred.id ? data.credential : c));
    } else {
      const { data } = await addCredential(form);
      setCredentials(prev => [data.credential, ...prev]);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this credential?')) return;
    try { await deleteCredential(id); setCredentials(prev => prev.filter(c => c.id !== id)); }
    catch (err) { console.error(err); }
  };

  const handleBulkImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { data } = await bulkImportCredentials(file);
      alert(`Imported ${data.imported} credentials`);
      load();
    } catch (err) {
      alert('Import failed: ' + (err.response?.data?.error || err.message));
    }
    e.target.value = '';
  };

  const banks = [...new Set(credentials.map(c => c.bank).filter(Boolean))];

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <ChevronsUpDown size={11} color="var(--text-muted)" />;
    return sortOrder === 'asc' ? <ArrowUp size={11} color="var(--accent)" /> : <ArrowDown size={11} color="var(--accent)" />;
  };

  const maskValue = (val) => {
    if (!val) return '-';
    if (val.length <= 2) return '**';
    return val[0] + '*'.repeat(val.length - 2) + val[val.length - 1];
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={20} color="var(--accent)" /> Bank Credentials
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{credentials.length} saved credentials</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
            <Upload size={13} /> Import Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleBulkImport} />
          <button className="btn btn-primary btn-sm" onClick={() => { setEditingCred(null); setModalOpen(true); }}>
            <Plus size={13} /> Add New
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div style={{ position: 'relative', maxWidth: 250 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" placeholder="Search name, bank, account..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        <select className="input" value={bankFilter} onChange={(e) => setBankFilter(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="all">All Banks</option>
          {banks.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showSensitive} onChange={(e) => setShowSensitive(e.target.checked)} className="checkbox" />
          Show sensitive
        </label>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table style={{ minWidth: columns.reduce((s, c) => s + c.width, 0) + 80 }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} className="resizable" style={{ width: col.width, minWidth: 50 }} onClick={() => handleSort(col.key)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col.label} <SortIcon col={col.key} />
                  </span>
                  <div className={`resize-handle ${resizingRef.current === col.key ? 'resizing' : ''}`}
                    onMouseDown={(e) => startResize(e, col.key)} onClick={(e) => e.stopPropagation()} />
                </th>
              ))}
              <th style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                No credentials saved. Click "Add New" to add one or "Import Excel" to bulk import.
              </td></tr>
            ) : (
              sorted.map(cred => (
                <tr key={cred.id}>
                  {columns.map(col => (
                    <td key={col.key} style={{ maxWidth: col.width, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}
                      title={SENSITIVE_FIELDS.has(col.key) && !showSensitive ? '' : (cred[col.key] || '')}
                    >
                      {col.key === 'link' && cred[col.key] ? (
                        <a href={cred[col.key].startsWith('http') ? cred[col.key] : `https://${cred[col.key]}`}
                          target="_blank" rel="noreferrer" style={{ color: 'var(--info)', fontSize: 11 }}>
                          {cred[col.key]}
                        </a>
                      ) : SENSITIVE_FIELDS.has(col.key) ? (
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: showSensitive ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {showSensitive ? (cred[col.key] || '-') : maskValue(cred[col.key])}
                        </span>
                      ) : (
                        cred[col.key] || '-'
                      )}
                    </td>
                  ))}
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => { setEditingCred(cred); setModalOpen(true); }} title="Edit">
                        <Pencil size={13} />
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => handleDelete(cred.id)} title="Delete" style={{ color: 'var(--danger)' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <CredentialModal
          credential={editingCred}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditingCred(null); }}
        />
      )}
    </div>
  );
}

// ─── Export (with password gate) ──────────────────────────────────────────────

export default function CredentialsPage() {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  return <CredentialsTable />;
}
