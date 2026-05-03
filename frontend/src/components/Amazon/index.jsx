import React, { useState } from 'react';
import { LayoutDashboard, CreditCard, ShoppingCart, Upload, ArrowUpDown, FileBarChart } from 'lucide-react';
import AmazonDashboard from './Dashboard';
import AmazonCards from './Cards';
import AmazonUpload from './Upload';
import AmazonOrders from './Orders';
import AmazonTransactions from './Transactions';
import AmazonReports from './Reports';

const TABS = [
  { id: 'dashboard',    label: 'Dashboard',    Icon: LayoutDashboard },
  { id: 'cards',        label: 'Cards',        Icon: CreditCard },
  { id: 'orders',       label: 'Orders',       Icon: ShoppingCart },
  { id: 'transactions', label: 'Transactions', Icon: ArrowUpDown },
  { id: 'upload',       label: 'Upload Report',Icon: Upload },
  { id: 'reports',      label: 'Upload History', Icon: FileBarChart },
];

export default function Amazon() {
  const [tab, setTab] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey(k => k + 1);

  return (
    <div className="animate-fade-in">
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20,
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
      }}>
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === id ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: tab === id ? 600 : 500,
              whiteSpace: 'nowrap',
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'dashboard'    && <AmazonDashboard    key={`d-${refreshKey}`} />}
      {tab === 'cards'        && <AmazonCards        key={`c-${refreshKey}`} onChange={bump} />}
      {tab === 'orders'       && <AmazonOrders       key={`o-${refreshKey}`} />}
      {tab === 'transactions' && <AmazonTransactions key={`t-${refreshKey}`} />}
      {tab === 'upload'       && <AmazonUpload       key={`u-${refreshKey}`} onSuccess={bump} />}
      {tab === 'reports'      && <AmazonReports      key={`r-${refreshKey}`} />}
    </div>
  );
}
