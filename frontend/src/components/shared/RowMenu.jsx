import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';

/**
 * Compact kebab menu. Pass `items: [{ label, icon, onClick, danger?, disabled? }]`.
 */
export default function RowMenu({ items = [] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', borderRadius: 4 }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 30,
          background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
          minWidth: 160, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', marginTop: 4,
        }}>
          {items.filter(Boolean).map((it, i) => (
            <button key={i} disabled={it.disabled}
              onClick={(e) => { e.stopPropagation(); if (!it.disabled) { setOpen(false); it.onClick?.(); } }}
              style={{
                width: '100%', padding: '8px 12px', border: 'none', background: 'transparent',
                cursor: it.disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
                fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
                color: it.disabled ? 'var(--text-muted)' : (it.danger ? 'var(--danger)' : 'var(--text-primary)'),
                opacity: it.disabled ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
