import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, ChevronLeft, ChevronRight, RefreshCw, X,
  ArrowUp, ArrowDown, ChevronsUpDown, Download,
  FileSpreadsheet, Undo2
} from 'lucide-react';
import { format } from 'date-fns';
import { getTransactions, updateTransaction, unverifyTransaction, exportExcel, exportPDF } from '../services/api';

const CATEGORIES = [
  'Salary', 'Amazon / E-commerce', 'Supplier Payment', 'Logistics',
  'Utilities', 'Advertising', 'Transfer', 'Fixed Deposit', 'Personal',
  'UPI Payment', 'Bank Charges', 'Interest', 'Tax / GST', 'Rent', 'Loan', 'Uncategorized',
];

const CATEGORY_COLORS = {
  'Salary': { bg: 'rgba(34,197,94,0.10)', color: '#22C55E' },
  'Amazon / E-commerce': { bg: 'rgba(59,130,246,0.10)', color: '#3B82F6' },
  'Supplier Payment': { bg: 'rgba(240,201,58,0.12)', color: '#F0C93A' },
  'Transfer': { bg: 'rgba(148,163,184,0.10)', color: '#94A3B8' },
  'UPI Payment': { bg: 'rgba(74,222,128,0.10)', color: '#4ADE80' },
  'Interest': { bg: 'rgba(232,121,249,0.10)', color: '#E879F9' },
  'Tax / GST': { bg: 'rgba(239,68,68,0.10)', color: '#EF4444' },
  'Uncategorized': { bg: 'rgba(139,139,139,0.10)', color: '#8B8B8B' },
};

const getCatStyle = (cat) => CATEGORY_COLORS[cat] || CATEGORY_COLORS['Uncategorized'];
const fmtNum = (n) => n ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '-';

const INIT_COLUMNS = [
  { key: 'date',        label: 'Date',        width: 100 },
  { key: 'description', label: 'Description', width: 300 },
  { key: 'debit',       label: 'Debit',       width: 110 },
  { key: 'credit',      label: 'Credit',      width: 110 },
  { key: 'balance',     label: 'Balance',     width: 110 },
  { key: 'bankName',    label: 'Bank',        width: 140 },
  { key: 'category',    label: 'Category',    width: 150 },
];

function CategoryCell({ txn, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const style = getCatStyle(txn.category);
  if (editing) {
    return (
      <select className="input" value={txn.category} autoFocus onBlur={() => setEditing(false)}
        onChange={async (e) => { const cat = e.target.value; setEditing(false); try { await updateTransaction(txn._id, { category: cat }); onUpdate(txn._id, { category: cat }); } catch {} }}
        style={{ fontSize: 11, padding: '3px 6px' }}>
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    );
  }
  return (
    <span onClick={() => setEditing(true)}
      style={{ background: style.bg, color: style.color, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {txn.category}
    </span>
  );
}

export default function VerifiedTable() {
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

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: pagination.limit, sortBy, sortOrder, status: 'verified' };
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

  const handleUpdate = (id, patch) => setTransactions(prev => prev.map(t => t._id === id ? { ...t, ...patch } : t));

  const handleUnverify = async (id) => {
    try { await unverifyTransaction(id); setTransactions(prev => prev.filter(t => t._id !== id)); setPagination(p => ({ ...p, total: p.total - 1 })); }
    catch (err) { console.error(err); }
  };

  const totalDebit = transactions.reduce((s, t) => s + (t.debit || 0), 0);
  const totalCredit = transactions.reduce((s, t) => s + (t.credit || 0), 0);
  const net = totalCredit - totalDebit;

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
      case 'category': return <CategoryCell txn={txn} onUpdate={handleUpdate} />;
      default: return '-';
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Verified Transactions</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{pagination.total} verified entries</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => exportExcel({ status: 'verified' })}><Download size={13} /> Excel</button>
          <button className="btn btn-sm" onClick={() => exportPDF({ status: 'verified' })}><FileSpreadsheet size={13} /> PDF</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div className="card card-sm" style={{ borderLeft: '4px solid var(--danger)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Debit</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--danger)' }}>{fmtNum(totalDebit)}</div>
        </div>
        <div className="card card-sm" style={{ borderLeft: '4px solid var(--success)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Credit</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--success)' }}>{fmtNum(totalCredit)}</div>
        </div>
        <div className="card card-sm" style={{ borderLeft: '4px solid var(--accent)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Net Flow</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: net >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtNum(net)}</div>
        </div>
      </div>

      <div className="filter-bar">
        <div style={{ position: 'relative', maxWidth: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" placeholder="Search verified transactions..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => load(1)} disabled={loading}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      <div className="table-wrapper">
        <table style={{ minWidth: columns.reduce((s, c) => s + c.width, 0) + 70 }}>
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
              <th style={{ width: 70 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No verified transactions yet. Verify from the Transactions page.</td></tr>
            ) : (
              transactions.map(txn => (
                <tr key={txn._id}>
                  {columns.map(col => (
                    <td key={col.key} style={{ maxWidth: col.width }}>{renderCell(txn, col)}</td>
                  ))}
                  <td>
                    <button className="btn btn-ghost btn-xs" onClick={() => handleUnverify(txn._id)} title="Move back to pending" style={{ color: 'var(--warning)' }}>
                      <Undo2 size={14} />
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
