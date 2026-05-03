import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';

/**
 * Compact kebab menu. Pass `items: [{ label, icon, onClick, danger?, disabled? }]`.
 * Dropdown uses position:fixed so it floats above table stacking contexts.
 */
export default function RowMenu({ items = [] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const handleScroll = () => setOpen(false);
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [open]);

  const toggle = (e) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuWidth = 170;
      setPos({
        top: rect.bottom + 4,
        left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
      });
    }
    setOpen(o => !o);
  };

  return (
    <>
      <button ref={btnRef} onClick={toggle}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', borderRadius: 4 }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div ref={menuRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999,
          background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
          minWidth: 160, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
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
    </>
  );
}
