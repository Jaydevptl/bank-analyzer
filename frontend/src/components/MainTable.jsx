import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Download, FileSpreadsheet,
  ChevronLeft, ChevronRight, X,
  ArrowUp, ArrowDown, ChevronsUpDown, Trash2,
  CheckCircle2, CheckSquare, Undo2
} from 'lucide-react';
import { format } from 'date-fns';
import {
  getTransactions, getBanks, getAccountHolders, updateTransaction,
  exportExcel, exportPDF, clearAllTransactions,
  verifyTransaction, verifyAll, deleteTransaction, undoTransaction,
  getRecycleBin, restoreRecycleItem
} from '../services/api';

const CATEGORIES = [
  'Salary', 'Amazon / E-commerce', 'Supplier Payment', 'Logistics',
  'Utilities', 'Advertising', 'Transfer', 'Fixed Deposit', 'Personal',
  'UPI Payment', 'Bank Charges', 'Interest', 'Tax / GST', 'Rent', 'Loan', 'Uncategorized',
];

const CATEGORY_COLORS = {
  'Salary':              { bg: 'rgba(34,197,94,0.10)',  color: '#22C55E' },
  'Amazon / E-commerce': { bg: 'rgba(59,130,246,0.10)', color: '#3B82F6' },
  'Supplier Payment':    { bg: 'rgba(240,201,58,0.12)', color: '#F0C93A' },
  'Logistics':           { bg: 'rgba(251,146,60,0.10)', color: '#FB923C' },
  'Utilities':           { bg: 'rgba(139,92,246,0.10)', color: '#8B5CF6' },
  'Advertising':         { bg: 'rgba(244,114,182,0.10)', color: '#F472B6' },
  'Transfer':            { bg: 'rgba(148,163,184,0.10)', color: '#94A3B8' },
  'Fixed Deposit':       { bg: 'rgba(59,130,246,0.10)', color: '#38BDF8' },
  'Personal':            { bg: 'rgba(26,26,46,0.08)',   color: '#1A1A2E' },
  'UPI Payment':         { bg: 'rgba(74,222,128,0.10)', color: '#4ADE80' },
  'Interest':            { bg: 'rgba(232,121,249,0.10)', color: '#E879F9' },
  'Tax / GST':           { bg: 'rgba(239,68,68,0.10)',  color: '#EF4444' },
  'Uncategorized':       { bg: 'rgba(139,139,139,0.10)', color: '#8B8B8B' },
};

const getCatStyle = (cat) => CATEGORY_COLORS[cat] || CATEGORY_COLORS['Uncategorized'];
const fmtNum = (n) => n ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '-';

const INIT_COLUMNS = [
  { key: 'date',          label: 'Date',        width: 100 },
  { key: 'description',   label: 'Description', width: 280 },
  { key: 'debit',         label: 'Debit',       width: 110 },
  { key: 'credit',        label: 'Credit',      width: 110 },
  { key: 'balance',       label: 'Balance',     width: 110 },
  { key: 'bankName',      label: 'Bank',        width: 140 },
  { key: 'accountHolder', label: 'Account',     width: 140 },
  { key: 'category',      label: 'Category',    width: 150 },
];

function CategoryCell({ txn, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const style = getCatStyle(txn.category);
  if (editing) {
    return (
      <select className="input" value={txn.category} autoFocus onBlur={() => setEditing(false)}
        onChange={async (e) => { const cat = e.target.value; setEditing(false); try { await updateTransaction(txn._id, { category: cat }); onUpdate(txn._id, { category: cat }); } catch {} }}
        style={{ fontSize: 11, padding: '3px 6px' }}
      >
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
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

function DescriptionCell({ txn, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(txn.description);
  if (editing) {
    return (
      <input className="input" value={val} autoFocus onChange={(e) => setVal(e.target.value)}
        onBlur={async () => { setEditing(false); if (val !== txn.description) { try { await updateTransaction(txn._id, { description: val }); onUpdate(txn._id, { description: val }); } catch {} } }}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        style={{ fontSize: 12, padding: '3px 6px' }}
      />
    );
  }
  return (
    <span onClick={() => setEditing(true)} title={txn.description}
      style={{ cursor: 'pointer', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {txn.description}
    </span>
  );
}

export default function MainTable() {
  const [transactions, setTransactions] = useState([]);
  const [banks, setBanks] = useState([]);
  const [accountHolders, setAccountHolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [columns, setColumns] = useState(INIT_COLUMNS);

  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bank, setBank] = useState('all');
  const [accountHolder, setAccountHolder] = useState('all');
  const [category, setCategory] = useState('all');
  const [type, setType] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [verifying, setVerifying] = useState(false);

  // Undo stack: { id, action, previousState, txn }
  const [undoStack, setUndoStack] = useState([]);

  // Column resize refs
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
      const newWidth = Math.max(60, startWidth + diff);
      setColumns(prev => prev.map(c => c.key === colKey ? { ...c, width: newWidth } : c));
    };
    const onMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: pagination.limit, sortBy, sortOrder, status: 'pending' };
      if (search) params.search = search;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (bank !== 'all') params.bank = bank;
      if (accountHolder !== 'all') params.accountHolder = accountHolder;
      if (category !== 'all') params.category = category;
      if (type !== 'all') params.type = type;
      const { data } = await getTransactions(params);
      setTransactions(data.transactions);
      setPagination(data.pagination);
      setSelectedIds(new Set());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, startDate, endDate, bank, accountHolder, category, type, sortBy, sortOrder, pagination.limit]);

  useEffect(() => { load(1); }, [search, startDate, endDate, bank, accountHolder, category, type, sortBy, sortOrder]);
  useEffect(() => {
    getBanks().then(({ data }) => setBanks(data.banks)).catch(() => {});
    getAccountHolders().then(({ data }) => setAccountHolders(data.accountHolders)).catch(() => {});
  }, []);

  const handleSort = (col) => {
    if (sortBy === col) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder('asc'); }
  };

  const handleUpdate = (id, patch) => setTransactions(prev => prev.map(t => t._id === id ? { ...t, ...patch } : t));

  const toggleSelect = (id) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === transactions.length ? new Set() : new Set(transactions.map(t => t._id)));
  };

  const handleVerifySelected = async () => {
    if (selectedIds.size === 0) return;
    setVerifying(true);
    try { for (const id of selectedIds) await verifyTransaction(id); load(pagination.page); }
    catch (err) { console.error(err); }
    finally { setVerifying(false); }
  };

  const handleVerifyAll = async () => {
    if (!confirm('Verify ALL pending transactions?')) return;
    setVerifying(true);
    try { await verifyAll(); load(1); }
    catch (err) { console.error(err); }
    finally { setVerifying(false); }
  };

  const handleVerifySingle = async (id) => {
    const txn = transactions.find(t => t._id === id);
    try {
      await verifyTransaction(id);
      setTransactions(prev => prev.filter(t => t._id !== id));
      setPagination(p => ({ ...p, total: p.total - 1 }));
      if (txn) setUndoStack(prev => [{ id, action: 'verify', previousState: { status: 'pending' }, txn }, ...prev].slice(0, 20));
    }
    catch (err) { console.error(err); }
  };

  const handleDeleteSingle = async (id) => {
    const txn = transactions.find(t => t._id === id);
    try {
      await deleteTransaction(id);
      setTransactions(prev => prev.filter(t => t._id !== id));
      setPagination(p => ({ ...p, total: p.total - 1 }));
      if (txn) setUndoStack(prev => [{ id, action: 'delete', txn }, ...prev].slice(0, 20));
    }
    catch (err) { console.error(err); }
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[0];
    try {
      if (last.action === 'verify') {
        // Unverify: change status back to pending
        await undoTransaction(last.id, { status: 'pending' });
        load(pagination.page);
      } else if (last.action === 'delete') {
        // Find in recycle bin by original_id and restore
        const { data } = await getRecycleBin({ type: 'transaction' });
        const recycleItem = (data.items || []).find(i => i.originalId === last.id);
        if (recycleItem) {
          await restoreRecycleItem(recycleItem.id);
          load(pagination.page);
        }
      } else if (last.action === 'edit') {
        await undoTransaction(last.id, last.previousState);
        setTransactions(prev => prev.map(t => t._id === last.id ? { ...t, ...last.previousState } : t));
      }
      setUndoStack(prev => prev.slice(1));
    } catch (err) { console.error(err); }
  };

  const handleClearAll = async () => {
    if (!confirm('Move ALL transactions to recycle bin? Reports will be preserved.')) return;
    try { await clearAllTransactions(); load(1); } catch {}
  };

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <ChevronsUpDown size={11} color="var(--text-muted)" />;
    return sortOrder === 'asc' ? <ArrowUp size={11} color="var(--accent)" /> : <ArrowDown size={11} color="var(--accent)" />;
  };

  const renderCell = (txn, col) => {
    switch (col.key) {
      case 'date': return <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{format(new Date(txn.date), 'dd/MM/yyyy')}</span>;
      case 'description': return <DescriptionCell txn={txn} onUpdate={handleUpdate} />;
      case 'debit': return <span style={{ fontWeight: txn.debit > 0 ? 600 : 400, color: txn.debit > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{fmtNum(txn.debit)}</span>;
      case 'credit': return <span style={{ fontWeight: txn.credit > 0 ? 600 : 400, color: txn.credit > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{fmtNum(txn.credit)}</span>;
      case 'balance': return <span style={{ fontSize: 12 }}>{fmtNum(txn.balance)}</span>;
      case 'bankName': return <span style={{ fontSize: 11 }}>{txn.bankName}</span>;
      case 'accountHolder': return <span style={{ fontSize: 11 }}>{txn.accountHolder || txn.accountName || '-'}</span>;
      case 'category': return <CategoryCell txn={txn} onUpdate={handleUpdate} />;
      default: return '-';
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Pending Transactions</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{pagination.total} transactions</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {selectedIds.size > 0 && (
            <button className="btn btn-success btn-sm" onClick={handleVerifySelected} disabled={verifying}>
              <CheckCircle2 size={13} /> Verify {selectedIds.size} Selected
            </button>
          )}
          {undoStack.length > 0 && (
            <button className="btn btn-sm" onClick={handleUndo} title={`Undo: ${undoStack[0]?.action}`} style={{ color: 'var(--warning)' }}>
              <Undo2 size={13} /> Undo
            </button>
          )}
          <button className="btn btn-success btn-sm" onClick={handleVerifyAll} disabled={verifying}><CheckSquare size={13} /> Verify All</button>
          <button className="btn btn-sm" onClick={() => exportExcel({ status: 'pending' })}><Download size={13} /> Excel</button>
          <button className="btn btn-sm" onClick={() => exportPDF({ status: 'pending' })}><FileSpreadsheet size={13} /> PDF</button>
          <button className="btn btn-danger btn-sm" onClick={handleClearAll}><Trash2 size={13} /></button>
        </div>
      </div>

      <div className="filter-bar">
        <div style={{ position: 'relative', maxWidth: 220 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" placeholder="Search descriptions..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ maxWidth: 150 }} />
        <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ maxWidth: 150 }} />
        <select className="input" value={bank} onChange={(e) => setBank(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="all">All Banks</option>
          {banks.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="input" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="all">All Accounts</option>
          {accountHolders.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)} style={{ maxWidth: 120 }}>
          <option value="all">All Types</option>
          <option value="debit">Debit</option>
          <option value="credit">Credit</option>
        </select>
        {(search || startDate || endDate || bank !== 'all' || accountHolder !== 'all' || category !== 'all' || type !== 'all') && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setStartDate(''); setEndDate(''); setBank('all'); setAccountHolder('all'); setCategory('all'); setType('all'); }}>
            <X size={13} /> Clear
          </button>
        )}
      </div>

      <div className="table-wrapper">
        <table style={{ minWidth: columns.reduce((s, c) => s + c.width, 0) + 100 }}>
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
              <th style={{ width: 80 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 2} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={columns.length + 2} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No pending transactions</td></tr>
            ) : (
              transactions.map(txn => (
                <tr key={txn._id} style={{ background: selectedIds.has(txn._id) ? 'rgba(240,201,58,0.08)' : undefined }}>
                  <td><input type="checkbox" className="checkbox" checked={selectedIds.has(txn._id)} onChange={() => toggleSelect(txn._id)} /></td>
                  {columns.map(col => (
                    <td key={col.key} style={{ maxWidth: col.width }}>{renderCell(txn, col)}</td>
                  ))}
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => handleVerifySingle(txn._id)} title="Verify" style={{ color: 'var(--success)' }}>
                        <CheckCircle2 size={14} />
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => handleDeleteSingle(txn._id)} title="Delete" style={{ color: 'var(--danger)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
