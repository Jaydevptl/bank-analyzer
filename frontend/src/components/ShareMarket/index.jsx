import React, { useState } from 'react';
import {
  LayoutDashboard, ArrowUpDown, FileBarChart,
  Receipt, Briefcase, Upload, Files
} from 'lucide-react';
import SMDashboard from './SMDashboard';
import TradesList from './TradesList';
import PnLReport from './PnLReport';
import ChargesReport from './ChargesReport';
import Holdings from './Holdings';
import SMUpload from './SMUpload';
import SMReports from './SMReports';

const SUB_NAV = [
  { id: 'dashboard', label: 'Dashboard',  Icon: LayoutDashboard },
  { id: 'trades',    label: 'Trades',     Icon: ArrowUpDown },
  { id: 'pnl',       label: 'P&L Report', Icon: FileBarChart },
  { id: 'charges',   label: 'Charges',    Icon: Receipt },
  { id: 'holdings',  label: 'Holdings',   Icon: Briefcase },
  { id: 'reports',   label: 'Reports',    Icon: Files },
  { id: 'upload',    label: 'Upload',     Icon: Upload },
];

export default function ShareMarket() {
  const [view, setView] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadSuccess = () => {
    setRefreshKey(k => k + 1);
    setView('reports');
  };

  return (
    <div className="animate-fade-in">
      {/* Sub navigation tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 24,
        padding: 4,
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        overflowX: 'auto',
      }}>
        {SUB_NAV.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px',
                borderRadius: 'var(--radius)',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font)',
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? '#1A1A2E' : 'var(--text-secondary)',
                background: active ? 'var(--accent)' : 'transparent',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon size={14} strokeWidth={active ? 2.5 : 2} />
              {label}
            </button>
          );
        })}
      </div>

      {/* View content */}
      {view === 'dashboard' && <SMDashboard key={`d-${refreshKey}`} />}
      {view === 'trades' && <TradesList key={`t-${refreshKey}`} />}
      {view === 'pnl' && <PnLReport key={`p-${refreshKey}`} />}
      {view === 'charges' && <ChargesReport key={`c-${refreshKey}`} />}
      {view === 'holdings' && <Holdings key={`h-${refreshKey}`} />}
      {view === 'reports' && <SMReports key={`r-${refreshKey}`} />}
      {view === 'upload' && <SMUpload onSuccess={handleUploadSuccess} />}
    </div>
  );
}
