import React, { useState, useEffect, useRef } from 'react';
import {
  Lock, Eye, EyeOff, KeyRound, Download, Upload, AlertTriangle,
  CheckCircle2, FileArchive, RefreshCw, Database, Files, AlertCircle,
  ShieldCheck
} from 'lucide-react';
import {
  credHasPassword, credSetPassword, credVerifyPassword,
  getBackupStats, downloadBackup, restoreBackup
} from '../services/api';

const fmtBytes = (b) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

// ─── Password Gate (same as Credentials page) ─────────────────────────────────

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
    try { await credSetPassword(password); onUnlock(); }
    catch { setError('Failed to set password'); }
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
          <ShieldCheck size={28} color="var(--accent)" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
          {hasPassword ? 'Enter Password' : 'Set a Password'}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24 }}>
          Backup contains sensitive data. {hasPassword ? 'Enter your password to access.' : 'Create a password to protect.'}
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
          <input
            className="input"
            type={showPw ? 'text' : 'password'}
            placeholder="Confirm Password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
            style={{ marginBottom: 12 }}
          />
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

// ─── Main Backup Page ─────────────────────────────────────────────────────────

function BackupContent() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreResult, setRestoreResult] = useState(null);
  const [restoreError, setRestoreError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const fileRef = useRef(null);

  const loadStats = async () => {
    setLoading(true);
    try {
      const { data } = await getBackupStats();
      setStats(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadStats(); }, []);

  const handleDownload = () => {
    setDownloading(true);
    downloadBackup();
    setTimeout(() => setDownloading(false), 3000);
  };

  const handleRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(
      `⚠️ WARNING: This will RESTORE data from backup.\n\n` +
      `Existing entries with the same ID will be OVERWRITTEN.\n` +
      `New entries from the backup will be ADDED.\n\n` +
      `Do you want to continue?`
    )) {
      e.target.value = '';
      return;
    }

    setRestoring(true);
    setRestoreProgress(0);
    setRestoreError(null);
    setRestoreResult(null);

    try {
      const { data } = await restoreBackup(file, setRestoreProgress);
      setRestoreResult(data);
      loadStats();
    } catch (err) {
      setRestoreError(err.response?.data?.error || err.message);
    } finally {
      setRestoring(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>;
  }

  const totalRows = stats ? Object.values(stats.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={20} color="var(--accent)" /> Backup & Restore
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            One-click backup of all your data + uploaded files
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadStats}><RefreshCw size={13} /></button>
      </div>

      {/* Info banner */}
      <div className="card" style={{
        padding: '14px 18px',
        background: 'rgba(59,130,246,0.06)',
        border: '1px solid rgba(59,130,246,0.2)',
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <AlertCircle size={18} color="var(--info)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          The backup ZIP contains <strong>everything</strong>: transactions, trades, credentials, reports, app settings,
          and original uploaded bank statement files. Store the file in a <strong>secure location</strong> (OneDrive Personal Vault,
          encrypted folder, password-protected USB drive, etc.) since it contains sensitive financial data.
        </div>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div className="card card-sm" style={{ borderLeft: '4px solid var(--accent)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Transactions</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{stats?.counts.transactions || 0}</div>
        </div>
        <div className="card card-sm" style={{ borderLeft: '4px solid var(--info)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Trades</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--info)' }}>{stats?.counts.trades || 0}</div>
        </div>
        <div className="card card-sm" style={{ borderLeft: '4px solid var(--success)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Credentials</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>{stats?.counts.credentials || 0}</div>
        </div>
        <div className="card card-sm" style={{ borderLeft: '4px solid var(--warning)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Files</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--warning)' }}>{stats?.files.count || 0}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtBytes(stats?.files.totalSize || 0)}</div>
        </div>
      </div>

      {/* Backup contents preview */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileArchive size={16} color="var(--accent)" /> What's in the Backup
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {[
            { label: 'Bank Transactions', value: stats?.counts.transactions, icon: Database },
            { label: 'Stock Trades', value: stats?.counts.trades, icon: Database },
            { label: 'Bank Credentials', value: stats?.counts.credentials, icon: Lock },
            { label: 'Upload Reports (Bank)', value: stats?.counts.upload_reports, icon: Files },
            { label: 'Upload Reports (Trade)', value: stats?.counts.trade_upload_reports, icon: Files },
            { label: 'Recycle Bin Items', value: stats?.counts.recycle_bin, icon: Files },
            { label: 'Original Statement Files', value: stats?.files.count, icon: FileArchive, sub: fmtBytes(stats?.files.totalSize || 0) },
            { label: 'App Settings', value: '✓', icon: ShieldCheck },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} style={{
                padding: '10px 14px',
                background: 'var(--bg-page)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <Icon size={16} color="var(--text-muted)" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.label}</div>
                  {item.sub && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.sub}</div>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{item.value ?? 0}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Download backup */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-lg)', background: 'rgba(34,197,94,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Download size={18} color="var(--success)" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Download Backup</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>One ZIP file with everything</div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            Creates a complete backup ZIP including all {totalRows} database rows and {stats?.files.count || 0} original bank statement files.
          </p>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: 12 }}
            onClick={handleDownload}
            disabled={downloading}
          >
            <Download size={14} /> {downloading ? 'Generating...' : 'Download Backup ZIP'}
          </button>
        </div>

        {/* Restore backup */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-lg)', background: 'rgba(245,158,11,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Upload size={18} color="var(--warning)" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Restore from Backup</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Import a previous backup ZIP</div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            Restores all data from a backup ZIP. Existing entries with same ID get overwritten.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            style={{ display: 'none' }}
            onChange={handleRestore}
          />
          <button
            className="btn"
            style={{ width: '100%', justifyContent: 'center', padding: 12, borderColor: 'var(--warning)', color: 'var(--warning)' }}
            onClick={() => fileRef.current?.click()}
            disabled={restoring}
          >
            <Upload size={14} /> {restoring ? `Restoring... ${restoreProgress}%` : 'Choose Backup ZIP'}
          </button>
          {restoring && (
            <div className="progress-bar" style={{ marginTop: 10 }}>
              <div className="progress-fill" style={{ width: `${restoreProgress}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* Restore result */}
      {restoreError && (
        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid var(--danger)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertTriangle size={16} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)' }}>Restore Failed</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{restoreError}</div>
          </div>
        </div>
      )}

      {restoreResult && (
        <div className="card" style={{ padding: 24, borderLeft: '4px solid var(--success)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <CheckCircle2 size={20} color="var(--success)" />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)' }}>Restore Complete</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {Object.entries(restoreResult.counts).map(([key, val]) => (
              <div key={key} style={{ padding: 10, background: 'var(--bg-page)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)' }}>{val}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1').trim()}</div>
              </div>
            ))}
          </div>
          {restoreResult.errors && restoreResult.errors.length > 0 && (
            <div style={{ marginTop: 16, padding: 12, background: 'var(--danger-bg)', borderRadius: 'var(--radius)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', marginBottom: 6 }}>{restoreResult.errors.length} errors:</div>
              {restoreResult.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--danger)', padding: '2px 0' }}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Best practices */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Best Practices</div>
        <ul style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Take a backup <strong>weekly</strong> or after every major upload session</li>
          <li>Store backups in <strong>multiple locations</strong>: OneDrive + USB drive + email to yourself</li>
          <li>Use OneDrive's <strong>Personal Vault</strong> for extra encryption</li>
          <li>Test restore on a fresh Supabase project occasionally to verify backup integrity</li>
          <li>Backup file size grows with your data — currently <strong>{fmtBytes((stats?.files.totalSize || 0) + totalRows * 200)}</strong> approx.</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Export with password gate ────────────────────────────────────────────────

export default function BackupPage() {
  const [unlocked, setUnlocked] = useState(false);
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <BackupContent />;
}
