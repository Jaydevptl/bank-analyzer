import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

/**
 * Generic delete-via-reversal confirmation.
 *
 * Props:
 *   title         — e.g. "Delete Loan"
 *   description   — short paragraph explaining the reversal
 *   warning       — optional extra warning bullet
 *   confirmLabel  — button label (default "Delete")
 *   onClose
 *   onConfirm(reason) — async; throws on error
 */
export default function DeleteConfirmModal({
  title = 'Delete', description, warning, confirmLabel = 'Delete', onClose, onConfirm,
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setErr(null); setSaving(true);
    try { await onConfirm(reason); onClose(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={18} /> {title}
          </h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>

        {description && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
            {description}
          </div>
        )}
        {warning && (
          <div style={{ background: 'rgba(245,158,11,0.10)', color: 'var(--warning)', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
            {warning}
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Reason (optional)</div>
          <input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Wrong date / duplicate / typo..." />
        </div>

        {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center', background: 'var(--danger)', color: 'white' }} onClick={submit} disabled={saving}>
            {saving ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
