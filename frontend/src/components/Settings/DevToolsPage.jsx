import React, { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { finoResetTestData } from '../../services/api';

export default function DevToolsPage() {
  const [confirmText, setConfirmText] = useState('');
  const [working, setWorking]         = useState(false);
  const [result, setResult]           = useState(null);
  const [err, setErr]                 = useState(null);

  const isDev = !!import.meta.env.DEV;

  const submit = async () => {
    setErr(null); setResult(null); setWorking(true);
    try {
      const { data } = await finoResetTestData('DELETE');
      setResult(data);
      setConfirmText('');
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
    finally { setWorking(false); }
  };

  return (
    <div style={{ padding: 8 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Dev Tools</h1>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        Dangerous operations. {isDev ? 'Development mode.' : <b style={{ color: 'var(--danger)' }}>WARNING: Production mode</b>}
      </p>

      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--danger)', borderRadius: 12, padding: 18, marginTop: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <AlertTriangle size={18} color="var(--danger)" />
          <h2 style={{ margin: 0, fontSize: 15, color: 'var(--danger)' }}>Reset Test Data</h2>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
          Permanently deletes all Phase 3 transaction data — banks, cash adjustments, fixed assets,
          loans, repayments, ledger entries, and user-added chart-of-accounts rows.<br />
          <b>Kept:</b> companies, parties, items, system COA rows. Existing BankLens features unaffected.
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
            Type <code>DELETE</code> to confirm
          </div>
          <input className="input" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="DELETE" />
        </div>

        {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginTop: 10 }}>{err}</div>}

        {result && (
          <div style={{ padding: 10, background: 'rgba(34,197,94,0.10)', color: 'var(--success)', borderRadius: 6, fontSize: 12, marginTop: 10 }}>
            <b>Reset complete.</b><br />
            <pre style={{ margin: '6px 0 0', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(result.cleared, null, 2)}
            </pre>
          </div>
        )}

        <button className="btn"
          style={{ marginTop: 14, background: 'var(--danger)', color: 'white' }}
          disabled={confirmText !== 'DELETE' || working}
          onClick={submit}>
          <Trash2 size={14} /> {working ? 'Resetting…' : 'Reset Test Data'}
        </button>
      </div>
    </div>
  );
}
