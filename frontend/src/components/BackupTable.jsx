import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, RefreshCw, Search,
  ArrowUp, ArrowDown, ChevronsUpDown, ShieldCheck, Download, FileSpreadsheet, RotateCcw, Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { getTransactions, exportExcel, exportPDF, restoreFromBackup, deleteTransaction } from '../services/api';

const fmtNum = (n) => n ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '-';

const INIT_COLUMNS = [
  { key: 'date',          label: 'Date',        width: 100 },
  { key: 'description',   label: 'Description', width: 320 },
  { key: 'debit',         label: 'Debit',       width: 110 },
  { key: 'credit',        label: 'Credit',      width: 110 },
  { key: 'balance',       label: 'Balance',     width: 110 },
  { key: 'bankName',      label: 'Bank',        width: 140 },
  { key: 'accountHolder', label: 'Account',     width: 140 },
  { key: 'category',      label: 'Category',    width: 140 },
  { key: 'sourceFile',    label: 'Source File',  width: 150 },
];

export default function BackupTable() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [search, setSearch] = useState('');
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

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleSelect = (id) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === transactions.length ? new Set() : new Set(transactions.map(t => t._id)));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} backup entries? They will move to recycle bin.`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selectedIds) {
        await deleteTransaction(id);
      }
      setSelectedIds(new Set());
      load(pagination.page);
    } catch (err) { console.error(err); }
    finally { setBulkDeleting(false); }
  };

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: pagination.limit, sortBy, sortOrder, status: 'backup' };
      if (search) params.search = search;
      const { data } = await getTransactions(params);
      setTransactions(data.transactions);
      setPagination(data.pagination);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, sortBy, sortOrder, pagination.limit]);

  useEffect(() => { load(1); }, [search, sortBy, sortOrder]);

  const handleSort = (col) => {
    if (sortBy === col) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder('asc'); }
  };

  const handleRestore = async (id) => {
    try {
      await restoreFromBackup(id);
      load(pagination.page);
    } catch (err) {
      alert('Restore failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteBackup = async (id) => {
    if (!confirm('Delete this backup entry? It will move to recycle bin.')) return;
    try {
      await deleteTransaction(id);
      setTransactions(prev => prev.filter(t => t._id !== id));
      setPagination(p => ({ ...p, total: p.total - 1 }));
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const totalDebit = transactions.reduce((s, t) => s + (t.debit || 0), 0);
  const totalCredit = transactions.reduce((s, t) => s + (t.credit || 0), 0);

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
      case 'balance': return <span style={{ fontSize: 12 }}>{fmtNum(txn.balance)}</span>;
      case 'bankName': return <span style={{ fontSize: 11 }}>{txn.bankName}</span>;
      case 'accountHolder': return <span style={{ fontSize: 11 }}>{txn.accountHolder || txn.accountName || '-'}</span>;
      case 'category': return <span style={{ fontSize: 11 }}>{txn.category}</span>;
      case 'sourceFile': return <span title={txn.sourceFile} style={{ fontSize: 11, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txn.sourceFile}</span>;
      default: return '-';
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={20} color="var(--info)" /> Backup Transactions
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{pagination.total} backup entries (read-only master records)</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {selectedIds.size > 0 && (
            <button className="btn btn-danger btn-sm" onClick={handleBulkDelete} disabled={bulkDeleting}>
              <Trash2 size={13} /> Delete {selectedIds.size} Selected
            </button>
          )}
          <button className="btn btn-sm" onClick={() => exportExcel({ status: 'backup' })}><Download size={13} /> Excel</button>
          <button className="btn btn-sm" onClick={() => exportPDF({ status: 'backup' })}><FileSpreadsheet size={13} /> PDF</button>
        </div>
      </div>

      {/* Info banner */}
      <div style={{
        padding: '12px 16px', marginBottom: 16,
        background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: 'var(--radius-lg)', fontSize: 12, color: 'var(--text-secondary)',
      }}>
        These are immutable backup copies of all uploaded transactions. They cannot be edited or deleted. Use this as your master record for auditing.
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div className="card card-sm" style={{ borderLeft: '4px solid var(--info)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Entries</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{pagination.total}</div>
        </div>
        <div className="card card-sm" style={{ borderLeft: '4px solid var(--danger)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Debit</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--danger)' }}>{fmtNum(totalDebit)}</div>
        </div>
        <div className="card card-sm" style={{ borderLeft: '4px solid var(--success)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Credit</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--success)' }}>{fmtNum(totalCredit)}</div>
        </div>
      </div>

      {/* Search */}
      <div className="filter-bar">
        <div style={{ position: 'relative', maxWidth: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" placeholder="Search backup transactions..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => load(1)} disabled={loading}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table style={{ minWidth: columns.reduce((s, c) => s + c.width, 0) + 160 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input type="checkbox" className="checkbox" checked={transactions.length > 0 && selectedIds.size === transactions.length} onChange={toggleSelectAll} />
              </th>
              {columns.map(col => (
                <th key={col.key} className="resizable" style={{ width: col.width, minWidth: 60 }} onClick={() => handleSort(col.key)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col.label} <SortIcon col={col.key} />
                  </span>
                  <div className={`resize-handle ${resizingRef.current === col.key ? 'resizing' : ''}`}
                    onMouseDown={(e) => startResize(e, col.key)} onClick={(e) => e.stopPropagation()} />
                </th>
              ))}
              <th style={{ width: 80 }}>Status</th>
              <th style={{ width: 70 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 3} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={columns.length + 3} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No backup transactions yet. Upload files to create backups.</td></tr>
            ) : (
              transactions.map(txn => {
                const isDeleted = txn.status === 'backup-deleted';
                return (
                  <tr key={txn._id} style={{ opacity: isDeleted ? 0.6 : 1, background: selectedIds.has(txn._id) ? 'rgba(240,201,58,0.08)' : isDeleted ? 'var(--danger-bg)' : undefined }}>
                    <td><input type="checkbox" className="checkbox" checked={selectedIds.has(txn._id)} onChange={() => toggleSelect(txn._id)} /></td>
                    {columns.map(col => (
                      <td key={col.key} style={{ maxWidth: col.width }}>{renderCell(txn, col)}</td>
                    ))}
                    <td>
                      {isDeleted ? (
                        <span className="badge badge-danger">Deleted</span>
                      ) : (
                        <span className="badge badge-success">Active</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {isDeleted && (
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={() => handleRestore(txn._id)}
                            title="Restore to Transactions"
                            style={{ color: 'var(--success)' }}
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleDeleteBackup(txn._id)}
                          title="Delete backup"
                          style={{ color: 'var(--danger)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {pagination.page} of {pagination.pages} ({pagination.total} total)</span>
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
          <select className="input" value={pagination.limit} onChange={(e) => setPagination(p => ({ ...p, limit: +e.target.value }))} style={{ maxWidth: 80 }}>
            {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
