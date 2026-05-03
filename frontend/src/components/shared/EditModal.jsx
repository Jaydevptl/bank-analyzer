import React, { useState } from 'react';
import { X } from 'lucide-react';

/**
 * Generic edit modal.
 *
 * Props:
 *   title           — modal title
 *   fields          — [{ key, label, type?: 'text'|'textarea'|'date'|'number', placeholder?, locked?, hint? }]
 *   initialValues   — { key: value }
 *   onClose
 *   onSubmit(values) — async; throws on error
 */
export default function EditModal({ title, fields, initialValues = {}, onClose, onSubmit }) {
  const [values, setValues] = useState({ ...initialValues });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setValues(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null);
    setSaving(true);
    try {
      const patch = {};
      for (const f of fields) {
        if (f.locked) continue;
        if (values[f.key] !== initialValues[f.key]) patch[f.key] = values[f.key];
      }
      if (!Object.keys(patch).length) return setErr('No changes to save');
      await onSubmit(patch);
      onClose();
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>

        {fields.map(f => (
          <div key={f.key} style={{ marginBottom: 10, opacity: f.locked ? 0.5 : 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
              {f.label} {f.locked && <span style={{ textTransform: 'none', color: 'var(--text-muted)' }}>· locked</span>}
            </div>
            {f.type === 'textarea' ? (
              <textarea className="input" rows={3} disabled={f.locked} placeholder={f.placeholder}
                value={values[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
            ) : (
              <input className="input" type={f.type || 'text'} disabled={f.locked} placeholder={f.placeholder}
                value={values[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
            )}
            {f.hint && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{f.hint}</div>}
          </div>
        ))}

        {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginTop: 8 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
