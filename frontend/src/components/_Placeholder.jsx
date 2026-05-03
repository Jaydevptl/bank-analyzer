import React from 'react';
import { Construction } from 'lucide-react';

export default function Placeholder({ title, group }) {
  return (
    <div style={{ padding: 8 }}>
      {group && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          {group}
        </div>
      )}
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
        {title}
      </h1>
      <div style={{
        marginTop: 24, padding: 32, background: 'var(--bg-surface)',
        border: '1px dashed var(--border)', borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 14,
        color: 'var(--text-muted)',
      }}>
        <Construction size={28} color="var(--accent)" />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
            Coming in a later phase
          </div>
          <div style={{ fontSize: 12 }}>
            This module is part of the Fino roadmap. Sub-pages will be wired up as each phase ships.
          </div>
        </div>
      </div>
    </div>
  );
}
