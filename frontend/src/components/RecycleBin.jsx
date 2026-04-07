import React, { useState, useEffect, useCallback } from 'react';
import {
  Trash2, RotateCcw, RefreshCw, AlertTriangle, X
} from 'lucide-react';
import { format } from 'date-fns';
import {
  getRecycleBin, restoreRecycleItem, restoreAllRecycle,
  permanentDeleteRecycle, emptyRecycleBin
} from '../services/api';

const fmtNum = (n) => n ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '-';

export default function RecycleBin() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'transaction', 'report'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter !== 'all') params.type = filter;
      const { data } = await getRecycleBin(params);
      setItems(data.items || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [filter]);

  const handleRestore = async (id) => {
    try { await restoreRecycleItem(id); setItems(prev => prev.filter(i => i.id !== id)); }
    catch (err) { alert('Restore failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Permanently delete? This cannot be undone.')) return;
    try { await permanentDeleteRecycle(id); setItems(prev => prev.filter(i => i.id !== id)); }
    catch (err) { console.error(err); }
  };

  const handleRestoreAll = async () => {
    if (!confirm('Restore all items from recycle bin?')) return;
    try { await restoreAllRecycle(); load(); }
    catch (err) { console.error(err); }
  };

  const handleEmpty = async () => {
    if (!confirm('Permanently delete ALL items in recycle bin? This cannot be undone.')) return;
    try { await emptyRecycleBin(); setItems([]); }
    catch (err) { console.error(err); }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trash2 size={20} color="var(--text-muted)" /> Recycle Bin
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{items.length} deleted items</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {items.length > 0 && (
            <>
              <button className="btn btn-success btn-sm" onClick={handleRestoreAll}>
                <RotateCcw size={13} /> Restore All
              </button>
              <button className="btn btn-danger btn-sm" onClick={handleEmpty}>
                <Trash2 size={13} /> Empty Bin
              </button>
            </>
          )}
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="filter-bar">
        {['all', 'transaction', 'report'].map(f => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'transaction' ? 'Transactions' : 'Reports'}
          </button>
        ))}
      </div>

      {/* Items */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Trash2 size={28} color="var(--text-muted)" /></div>
          <h3>Recycle bin is empty</h3>
          <p>Deleted transactions and reports will appear here</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Type</th>
                <th style={{ width: 130 }}>Deleted At</th>
                <th>Date</th>
                <th>Description / Details</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Bank</th>
                <th>Status</th>
                <th style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const d = item.data || {};
                const isReport = item.itemType === 'report';
                return (
                  <tr key={item.id}>
                    <td>
                      <span className={`badge ${isReport ? 'badge-info' : 'badge-muted'}`}>
                        {isReport ? 'Report' : 'Transaction'}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      {format(new Date(item.deletedAt), 'dd/MM/yy HH:mm')}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {d.date ? format(new Date(d.date), 'dd/MM/yyyy') : isReport ? (d.uploadedAt ? format(new Date(d.uploadedAt), 'dd/MM/yyyy') : '-') : '-'}
                    </td>
                    <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.description || d.uploadId || ''}>
                      {isReport ? `Upload: ${d.uploadId || ''}` : (d.description || '-')}
                    </td>
                    <td style={{ color: d.debit > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: d.debit > 0 ? 600 : 400 }}>
                      {isReport ? '-' : fmtNum(d.debit)}
                    </td>
                    <td style={{ color: d.credit > 0 ? 'var(--success)' : 'var(--text-muted)', fontWeight: d.credit > 0 ? 600 : 400 }}>
                      {isReport ? '-' : fmtNum(d.credit)}
                    </td>
                    <td style={{ fontSize: 11 }}>{d.bankName || d.bank_name || '-'}</td>
                    <td style={{ fontSize: 11 }}>{d.status || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => handleRestore(item.id)} title="Restore" style={{ color: 'var(--success)' }}>
                          <RotateCcw size={14} />
                        </button>
                        <button className="btn btn-ghost btn-xs" onClick={() => handleDelete(item.id)} title="Delete permanently" style={{ color: 'var(--danger)' }}>
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
