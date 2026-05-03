import React, { useState } from 'react';
import { BarChart3, Upload, Eye, Calendar } from 'lucide-react';
import Overview from './Overview';
import DayWisePnL from './DayWisePnL';
import SMUpload from './SMUpload';

const TABS = [
  { id: 'overview', label: 'Overview', Icon: Eye },
  { id: 'daywise', label: 'Day-wise P&L', Icon: Calendar },
  { id: 'upload', label: 'Upload', Icon: Upload },
];

export default function ShareMarket() {
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadDone = () => {
    setRefreshKey(k => k + 1);
    setActiveTab('overview');
  };

  return (
    <div className="animate-fade-in">
      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 'var(--radius)',
              border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 13, fontWeight: activeTab === id ? 600 : 500,
              color: activeTab === id ? '#1A1A2E' : 'var(--text-secondary)',
              background: activeTab === id ? 'var(--accent)' : 'transparent',
              transition: 'all 0.2s',
            }}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Views */}
      {activeTab === 'overview' && <Overview key={`ov-${refreshKey}`} />}
      {activeTab === 'daywise' && <DayWisePnL key={`dw-${refreshKey}`} />}
      {activeTab === 'upload' && <SMUpload onDone={handleUploadDone} />}
    </div>
  );
}
