import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, RefreshCw,
  ArrowUp, ArrowDown, ChevronsUpDown, Copy, Plus, Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { getTransactions, keepDuplicate } from '../services/api';
import axios from 'axios';

const fmtNum = (n) => n ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '-';

const INIT_COLUMNS = [
  { key: 'date',          label: 'Date',        width: 100 },
  { key: 'description',   label: 'Description', width: 300 },
  { key: 'debit',         label: 'Debit',       width: 110 },
  { key: 'credit',        label: 'Credit',      width: 110 },
  { key: 'bankName',      label: 'Bank',        width: 140 },
  { key: 'accountHolder', label: 'Account',     width: 140 },
  { key: 'sourceFile',    label: 'Source File',  width: 150 },
];

export default function DuplicatesTable() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [columns, setColumns] = useState(INIT_COLUMNS);
  const resizingRef = useRef(null);

  const startResize = (e, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const col = columns.find(c => c.key === colKey);
    const startWidth = col.width;
    resizingRef.current = colKey;
    const onMouseMove = (ev) => {
      const diff = ev.clientX - startX;
      setColumns(prev => prev.map(c => c.key === colKey ? { ...c, width: Math.max(60, startWidth + diff) } : c));
    };
    const onMouseUp = () => { resizingRef.current = null; document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: pagination.limit, sortBy, sortOrder, status: 'duplicate' };
      const { data } = await getTransactions(params);
      setTransactions(data.transactions);
      setPagination(data.pagination);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [sortBy, sortOrder, pagination.limit]);

  useEffect(() => { load(1); }, [sortBy, sortOrder]);

  const handleSort = (col) => {
    if (sortBy === col) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder('asc'); }
  };

  const handleDeleteAll = async () => {
    if (!confirm(`Delete all ${pagination.total} duplicate transactions permanently?`)) return;
    try {
      await axios.delete('/api/transactions/clear-duplicates');
      setTransactions([]);
      setPagination(p => ({ ...p, total: 0 }));
    } catch (err) { console.error(err); }
  };

  const handleKeep = async (id) => {
    try { await keepDuplicate(id); setTransactions(prev => prev.filter(t => t._id !== id)); setPagination(p => ({ ...p, total: p.total - 1 })); }
    catch (err) { console.error(err); }
  };

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <ChevronsUpDown size={11} color="var(--text-muted)" />;
    return sortOrder === 'asc' ? <ArrowUp size={11} color="var(--accent)" /> : <ArrowDown size={11} color="var(--accent)" />;
  };

  const renderCell = (txn, col) => {
    switch (col.key) {
      case 'date': return <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{format(new Date(txn.date), 'dd/MM/yyyy')}</span>;
      case 'description': return <span title={txn.description} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txn.description}</span>;
      case 'debit': return <span style={{ fontWeight: txn.debit > 0 ? 600 : 400, color: txn.debit > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{fmtNum(txn.debit)}</span>;
      case 'credit': return <span style={{ fontWeight: txn.credit > 0 ? 600 : 400, color: txn.credit > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{fmtNum(txn.credit)}</span>;
      case 'bankName': return <span style={{ fontSize: 11 }}>{txn.bankName}</span>;
      case 'accountHolder': return <span style={{ fontSize: 11 }}>{txn.accountHolder || txn.accountName || '-'}</span>;
      case 'sourceFile': return <span title={txn.sourceFile} style={{ fontSize: 11, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txn.sourceFile}</span>;
      default: return '-';
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Copy size={20} color="var(--warning)" /> Duplicate Transactions
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{pagination.total} duplicates detected</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {pagination.total > 0 && (
            <button className="btn btn-danger btn-sm" onClick={handleDeleteAll}>
              <Trash2 size={13} /> Delete All Duplicates
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => load(1)} disabled={loading}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
        </div>
      </div>

      <div style={{
        padding: '12px 16px', marginBottom: 16,
        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: 'var(--radius-lg)', fontSize: 12, color: 'var(--text-secondary)',
      }}>
        These transactions were detected as duplicates during upload. Click "Keep Anyway" to move a duplicate to pending.
      </div>

      <div className="table-wrapper">
        <table style={{ minWidth: columns.reduce((s, c) => s + c.width, 0) + 110 }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} className="resizable" style={{ width: col.width, minWidth: 60 }} onClick={() => handleSort(col.key)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col.label} <SortIcon col={col.key} />
                  </span>
                  <div className={`resize-handle ${resizingRef.current === col.key ? 'resizing' : ''}`}
                    onMouseDown={(e) => startResize(e, col.key)} onClick={(e) => e.stopPropagation()} />
                </th>
              ))}
              <th style={{ width: 110 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No duplicates found. Clean data!</td></tr>
            ) : (
              transactions.map(txn => (
                <tr key={txn._id}>
                  {columns.map(col => (
                    <td key={col.key} style={{ maxWidth: col.width }}>{renderCell(txn, col)}</td>
                  ))}
                  <td>
                    <button className="btn btn-sm" onClick={() => handleKeep(txn._id)} style={{ fontSize: 11 }}>
                      <Plus size={12} /> Keep Anyway
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {pagination.page} of {pagination.pages}</span>
          <div className="pagination">
            <button disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}><ChevronLeft size={14} /></button>
            {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => {
              const start = Math.max(1, Math.min(pagination.page - 2, pagination.pages - 4));
              const p = start + i;
              if (p > pagination.pages) return null;
              return <button key={p} className={p === pagination.page ? 'active' : ''} onClick={() => load(p)}>{p}</button>;
            })}
            <button disabled={pagination.page >= pagination.pages} onClick={() => load(pagination.page + 1)}><ChevronRight size={14} /></button>
          </div>
          <div />
        </div>
      )}
    </div>
  );
}
