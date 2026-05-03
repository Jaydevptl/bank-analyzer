import React, { useState, useEffect } from 'react';
import { RefreshCw, DollarSign, Users } from 'lucide-react';
import { getOverview } from '../../services/api';

const fmt = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

export default function Overview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getOverview();
      setData(res.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, gap: 8, color: 'var(--text-muted)' }}>
        <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading...
      </div>
    );
  }

  if (!data || data.accounts?.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
        <Users size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
        <p style={{ fontWeight: 600, marginBottom: 4 }}>No accounts yet</p>
        <p style={{ fontSize: 12 }}>Upload Ledger or P&L Excel files in the Upload tab to get started.</p>
      </div>
    );
  }

  const { accounts } = data;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          Accounts ({accounts.length})
        </h3>
        <button className="btn btn-ghost btn-xs" onClick={load} style={{ gap: 4 }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Per-Account Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {accounts.map(acc => (
          <AccountCard key={acc.accountName} acc={acc} />
        ))}
      </div>
    </div>
  );
}

function AccountCard({ acc }) {
  const netColor = acc.netPnL >= 0 ? 'var(--success)' : 'var(--danger)';

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Account Name */}
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
        {acc.accountName}
      </div>

      {/* Net P&L */}
      {(acc.netPnL !== 0 || acc.totalTrades > 0 || acc.tradeProfit > 0 || acc.tradeLoss > 0) && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--radius)', marginBottom: 10,
          background: acc.netPnL >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Net P&L</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: netColor }}>
            {acc.netPnL >= 0 ? '+' : ''}{fmt(acc.netPnL)}
          </span>
        </div>
      )}

      {/* Net Fund */}
      {acc.ledgerEntries > 0 && (
        <>
          <div style={{
            padding: '12px 16px', borderRadius: 'var(--radius)', marginBottom: 10,
            background: 'rgba(59,130,246,0.06)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Net Fund</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--info)' }}>
              {fmt(acc.netFund)}
            </span>
          </div>

          {/* Current Balance */}
          <div style={{
            padding: '12px 16px', borderRadius: 'var(--radius)',
            background: 'rgba(240,201,58,0.06)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Current Balance</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>
              {fmt(acc.currentBalance)}
            </span>
          </div>
        </>
      )}

      {/* Empty */}
      {acc.netPnL === 0 && acc.ledgerEntries === 0 && acc.totalTrades === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
          No data yet.
        </div>
      )}
    </div>
  );
}
