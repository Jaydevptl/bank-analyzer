import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Filter, Download, FileSpreadsheet,
  ChevronLeft, ChevronRight, RefreshCw, X,
  ArrowUp, ArrowDown, ChevronsUpDown, Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import {
  getTransactions, getBanks, updateTransaction,
  exportExcel, exportPDF, clearAllTransactions
} from '../services/api';

// ── Column Definitions ─────────────────────────────────────────────────────────

const INIT_COLUMNS = [
  { key: 'date',        label: 'Date',         width: 110 },
  { key: 'description', label: 'Description',  width: 270 },
  { key: 'debit',       label: 'Debit (₹)',    width: 110 },
  { key: 'credit',      label: 'Credit (₹)',   width: 110 },
  { key: 'balance',     label: 'Balance (₹)',  width: 120 },
  { key: 'bankName',    label: 'Bank',         width: 130 },
  { key: 'accountName', label: 'Account Name', width: 140 },
  { key: 'category',    label: 'Category',     width: 150 },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Salary', 'Amazon / E-commerce', 'Supplier Payment', 'Logistics',
  'Utilities', 'Advertising', 'Transfer', 'Fixed Deposit', 'Personal',
  'UPI Payment', 'Bank Charges', 'Interest', 'Tax / GST', 'Rent', 'Loan', 'Uncategorized',
];

const CATEGORY_COLORS = {
  'Salary':              { bg: 'rgba(52,211,153,0.1)',  color: '#34D399' },
  'Amazon / E-commerce': { bg: 'rgba(96,165,250,0.1)',  color: '#60A5FA' },
  'Supplier Payment':    { bg: 'rgba(251,191,36,0.1)',  color: '#FBBF24' },
  'Logistics':           { bg: 'rgba(251,146,60,0.1)',  color: '#FB923C' },
  'Utilities':           { bg: 'rgba(167,139,250,0.1)', color: '#A78BFA' },
  'Advertising':         { bg: 'rgba(244,114,182,0.1)', color: '#F472B6' },
  'Transfer':            { bg: 'rgba(148,163,184,0.1)', color: '#94A3B8' },
  'Fixed Deposit':       { bg: 'rgba(56,189,248,0.1)',  color: '#38BDF8' },
  'Personal':            { bg: 'rgba(45,212,191,0.1)',  color: '#2DD4BF' },
  'UPI Payment':         { bg: 'rgba(74,222,128,0.1)',  color: '#4ADE80' },
  'Interest':            { bg: 'rgba(232,121,249,0.1)', color: '#E879F9' },
  'Tax / GST':           { bg: 'rgba(248,113,113,0.1)', color: '#F87171' },
  'Uncategorized':       { bg: 'rgba(100,116,139,0.1)', color: '#64748B' },
};

const getCatStyle = (cat) =>
  CATEGORY_COLORS[cat] || { bg: 'rgba(100,116,139,0.1)', color: '#64748B' };

const fmt = (n) =>
  n ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n) : '—';

// ── Sort Icon ──────────────────────────────────────────────────────────────────

function SortIcon({ field, sortBy, sortOrder }) {
  if (sortBy !== field) return <ChevronsUpDown size={12} color="var(--text-muted)" />;
  return sortOrder === 'asc'
    ? <ArrowUp size={12} color="var(--accent)" />
    : <ArrowDown size={12} color="var(--accent)" />;
}

// ── Inline Category Editor ─────────────────────────────────────────────────────

function CategoryCell({ txn, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const style = getCatStyle(txn.category);

  const handleChange = async (cat) => {
    setSaving(true);
    try {
      await updateTransaction(txn._id, { category: cat });
      onUpdate(txn._id, { category: cat });
    } catch {}
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <select
        className="select"
        defaultValue={txn.category}
        autoFocus
        style={{ fontSize: 11, padding: '3px 6px' }}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => setEditing(false)}
      >
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    );
  }

  return (
    <span
      className="badge"
      title="Click to edit"
      onClick={() => setEditing(true)}
      style={{
        cursor: 'pointer',
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.color}30`,
        fontSize: 9,
        padding: '2px 7px',
      }}
    >
      {saving ? '…' : txn.category || 'Uncategorized'}
    </span>
  );
}

// ── Inline Description Editor ──────────────────────────────────────────────────

function DescriptionCell({ txn, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(txn.description);
  const [saving, setSaving]   = useState(false);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === txn.description) { setEditing(false); return; }
    setSaving(true);
    try {
      await updateTransaction(txn._id, { description: trimmed });
      onUpdate(txn._id, { description: trimmed });
    } catch {}
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className="input"
        value={value}
        autoFocus
        style={{ fontSize: 11, padding: '2px 6px', width: '100%', minWidth: 140 }}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') { setValue(txn.description); setEditing(false); }
        }}
      />
    );
  }

  return (
    <div
      title={`${txn.description}\n(Click to edit)`}
      onClick={() => setEditing(true)}
      style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontSize: 12,
        color: saving ? 'var(--text-muted)' : 'var(--text-secondary)',
        cursor: 'text',
        maxWidth: '100%',
      }}
    >
      {saving ? '…' : value}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TransactionTable({ checkedIds = new Set(), onToggleCheck = () => {}, onUpdateChecked = () => {} }) {
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination]     = useState({ page: 1, total: 0, pages: 1 });
  const [banks, setBanks]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [showFilters, setShowFilters]   = useState(false);

  // Column order + widths
  const [columns, setColumns] = useState(INIT_COLUMNS);

  // Drag-to-reorder state
  const [dragCol, setDragCol]   = useState(null);
  const [dragOver, setDragOver] = useState(null);

  // Resize ref
  const resizeRef = useRef(null);

  // Filters
  const [filters, setFilters] = useState({
    search: '', startDate: '', endDate: '',
    bank: 'all', category: 'all', type: 'all',
    minAmount: '', maxAmount: '',
    page: 1, limit: 50,
    sortBy: 'date', sortOrder: 'asc',
  });

  const setFilter = (key, val) =>
    setFilters((prev) => ({ ...prev, [key]: val, page: 1 }));

  const toggleSort = (field) => {
    setFilters((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'asc' ? 'desc' : 'asc',
      page: 1,
    }));
  };

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '' && v !== 'all')
      );
      const [txRes, bankRes] = await Promise.all([getTransactions(params), getBanks()]);
      setTransactions(txRes.data.transactions);
      setPagination(txRes.data.pagination);
      setBanks(bankRes.data.banks);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // ── Local state updates ───────────────────────────────────────────────────────

  const handleUpdate = (id, patch) => {
    setTransactions((prev) => prev.map((t) => (t._id === id ? { ...t, ...patch } : t)));
    onUpdateChecked(id, patch);
  };

  const handleClear = async () => {
    if (!window.confirm('Delete ALL transactions? This cannot be undone.')) return;
    await clearAllTransactions();
    load();
  };

  // ── Column Resize ─────────────────────────────────────────────────────────────

  const startResize = (e, colKey) => {
    e.stopPropagation();
    e.preventDefault();
    const col = columns.find((c) => c.key === colKey);
    resizeRef.current = { colKey, startX: e.clientX, startWidth: col.width };

    const onMouseMove = (ev) => {
      if (!resizeRef.current) return;
      const delta = ev.clientX - resizeRef.current.startX;
      const newWidth = Math.max(60, resizeRef.current.startWidth + delta);
      setColumns((prev) =>
        prev.map((c) => c.key === resizeRef.current.colKey ? { ...c, width: newWidth } : c)
      );
    };

    const onMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // ── Column Drag-to-Reorder ────────────────────────────────────────────────────

  const onDragStart = (e, key) => {
    setDragCol(key);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e, key) => {
    e.preventDefault();
    if (key !== dragCol) setDragOver(key);
  };

  const onDrop = (e, targetKey) => {
    e.preventDefault();
    if (!dragCol || dragCol === targetKey) return;
    setColumns((prev) => {
      const cols = [...prev];
      const fromIdx = cols.findIndex((c) => c.key === dragCol);
      const toIdx   = cols.findIndex((c) => c.key === targetKey);
      const [moved] = cols.splice(fromIdx, 1);
      cols.splice(toIdx, 0, moved);
      return cols;
    });
    setDragCol(null);
    setDragOver(null);
  };

  const onDragEnd = () => { setDragCol(null); setDragOver(null); };

  // ── Cell Renderer ─────────────────────────────────────────────────────────────

  const renderCell = (txn, col) => {
    switch (col.key) {
      case 'date':
        return (
          <td key={col.key} style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
            {format(new Date(txn.date), 'dd MMM yyyy')}
          </td>
        );
      case 'description':
        return (
          <td key={col.key} style={{ maxWidth: col.width, overflow: 'hidden' }}>
            <DescriptionCell txn={txn} onUpdate={handleUpdate} />
          </td>
        );
      case 'debit':
        return (
          <td key={col.key} className="amount" style={{ color: txn.debit > 0 ? 'var(--debit)' : 'var(--text-muted)' }}>
            {txn.debit > 0 ? fmt(txn.debit) : '—'}
          </td>
        );
      case 'credit':
        return (
          <td key={col.key} className="amount" style={{ color: txn.credit > 0 ? 'var(--credit)' : 'var(--text-muted)' }}>
            {txn.credit > 0 ? fmt(txn.credit) : '—'}
          </td>
        );
      case 'balance':
        return (
          <td key={col.key} className="amount" style={{ color: 'var(--text-secondary)' }}>
            {txn.balance ? fmt(txn.balance) : '—'}
          </td>
        );
      case 'bankName':
        return (
          <td key={col.key}>
            <span className="tag" style={{ fontSize: 10 }}>{txn.bankName}</span>
          </td>
        );
      case 'accountName':
        return (
          <td key={col.key} style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {txn.accountName || '—'}
          </td>
        );
      case 'category':
        return (
          <td key={col.key}>
            <CategoryCell txn={txn} onUpdate={handleUpdate} />
          </td>
        );
      default:
        return <td key={col.key}>—</td>;
    }
  };

  // ── Export params ─────────────────────────────────────────────────────────────

  const exportParams = Object.fromEntries(
    Object.entries(filters).filter(([k, v]) =>
      ['startDate', 'endDate', 'bank', 'category', 'search'].includes(k) && v && v !== 'all'
    )
  );

  const activeFilterCount = [
    filters.search, filters.startDate, filters.endDate,
    filters.bank !== 'all' && filters.bank,
    filters.category !== 'all' && filters.category,
    filters.type !== 'all' && filters.type,
    filters.minAmount, filters.maxAmount,
  ].filter(Boolean).length;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Search size={13} color="var(--text-muted)" style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          }} />
          <input
            className="input"
            placeholder="Search description…"
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            style={{ paddingLeft: 30 }}
          />
        </div>

        <button
          className={`btn ${activeFilterCount > 0 ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setShowFilters((p) => !p)}
        >
          <Filter size={13} />
          Filters
          {activeFilterCount > 0 && (
            <span style={{
              background: 'rgba(10,13,20,0.4)', borderRadius: '50%',
              width: 16, height: 16, fontSize: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
            }}>
              {activeFilterCount}
            </span>
          )}
        </button>

        <button className="btn btn-ghost" onClick={load} disabled={loading}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>

        {/* Reset columns */}
        <button className="btn btn-ghost" title="Reset column layout" onClick={() => setColumns(INIT_COLUMNS)}>
          ⊞
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => exportExcel(exportParams)}>
            <FileSpreadsheet size={13} color="#34D399" /> Excel
          </button>
          <button className="btn btn-outline" onClick={() => exportPDF(exportParams)}>
            <Download size={13} color="#F87171" /> PDF
          </button>
          <button className="btn btn-danger" onClick={handleClear}>
            <Trash2 size={13} /> Clear All
          </button>
        </div>
      </div>

      {/* ── Filter Panel ── */}
      {showFilters && (
        <div className="card fade-up" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {[
              { label: 'From Date',    type: 'date',   key: 'startDate' },
              { label: 'To Date',      type: 'date',   key: 'endDate'   },
              { label: 'Min Amount (₹)', type: 'number', key: 'minAmount', placeholder: '0'   },
              { label: 'Max Amount (₹)', type: 'number', key: 'maxAmount', placeholder: 'Any' },
            ].map(({ label, type, key, placeholder }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {label}
                </label>
                <input type={type} className="input" placeholder={placeholder || ''}
                  value={filters[key]} onChange={(e) => setFilter(key, e.target.value)} />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bank</label>
              <select className="select" value={filters.bank} onChange={(e) => setFilter('bank', e.target.value)}>
                <option value="all">All Banks</option>
                {banks.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Category</label>
              <select className="select" value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
                <option value="all">All Categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</label>
              <select className="select" value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
                <option value="all">All</option>
                <option value="credit">Credit Only</option>
                <option value="debit">Debit Only</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-ghost" style={{ width: '100%' }}
                onClick={() => setFilters((prev) => ({ ...prev, search: '', startDate: '', endDate: '', bank: 'all', category: 'all', type: 'all', minAmount: '', maxAmount: '', page: 1 }))}>
                <X size={13} /> Reset Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats Row ── */}
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', alignItems: 'center' }}>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{pagination.total.toLocaleString()} transactions</span>
        <span>·</span>
        <span>Page {pagination.page} of {pagination.pages}</span>
        <span>·</span>
        <select className="select" style={{ width: 'auto', fontSize: 11 }} value={filters.limit}
          onChange={(e) => setFilter('limit', parseInt(e.target.value))}>
          {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} per page</option>)}
        </select>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 10 }}>
          Drag headers to reorder · Drag right edge to resize · Click description to edit
        </span>
      </div>

      {/* ── Table ── */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto', maxHeight: 580, overflowY: 'auto' }}>
          <table className="data-table" style={{ tableLayout: 'fixed', width: 40 + columns.reduce((s, c) => s + c.width, 0) }}>
            <colgroup>
              <col style={{ width: 40 }} />
              {columns.map((col) => <col key={col.key} style={{ width: col.width }} />)}
            </colgroup>
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    title="Check all on this page"
                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)' }}
                    checked={transactions.length > 0 && transactions.every((t) => checkedIds.has(t._id))}
                    onChange={(e) => transactions.forEach((t) => {
                      if (e.target.checked !== checkedIds.has(t._id)) onToggleCheck(t);
                    })}
                  />
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    draggable
                    onDragStart={(e) => onDragStart(e, col.key)}
                    onDragOver={(e) => onDragOver(e, col.key)}
                    onDrop={(e) => onDrop(e, col.key)}
                    onDragEnd={onDragEnd}
                    onClick={() => toggleSort(col.key)}
                    style={{
                      cursor: 'grab',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      position: 'relative',
                      width: col.width,
                      background: dragOver === col.key ? 'rgba(99,102,241,0.15)' : undefined,
                      opacity: dragCol === col.key ? 0.4 : 1,
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                      {col.label}
                      <SortIcon field={col.key} sortBy={filters.sortBy} sortOrder={filters.sortOrder} />
                    </div>
                    {/* Resize handle */}
                    <div
                      onMouseDown={(e) => startResize(e, col.key)}
                      onClick={(e) => e.stopPropagation()}
                      draggable={false}
                      onDragStart={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0,
                        width: 6, cursor: 'col-resize',
                        background: 'transparent',
                        zIndex: 2,
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td><div className="skeleton" style={{ height: 12, width: 14, margin: 'auto' }} /></td>
                    {columns.map((col) => (
                      <td key={col.key}>
                        <div className="skeleton" style={{ height: 12, width: col.key === 'description' ? 200 : 70 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    No transactions match your filters.
                  </td>
                </tr>
              ) : (
                transactions.map((txn) => (
                  <tr key={txn._id} style={{ background: checkedIds.has(txn._id) ? 'rgba(99,102,241,0.07)' : undefined }}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={checkedIds.has(txn._id)}
                        onChange={() => onToggleCheck(txn)}
                        style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)' }}
                      />
                    </td>
                    {columns.map((col) => renderCell(txn, col))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ── */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
        <button className="btn btn-outline" style={{ padding: '6px 10px' }}
          disabled={filters.page <= 1}
          onClick={() => setFilters((p) => ({ ...p, page: p.page - 1 }))}>
          <ChevronLeft size={14} />
        </button>

        {Array.from({ length: Math.min(pagination.pages, 7) }, (_, i) => {
          const pg = i + 1;
          return (
            <button key={pg}
              className={`btn ${filters.page === pg ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '6px 10px', minWidth: 34, fontSize: 11 }}
              onClick={() => setFilters((p) => ({ ...p, page: pg }))}>
              {pg}
            </button>
          );
        })}

        {pagination.pages > 7 && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>…</span>}

        <button className="btn btn-outline" style={{ padding: '6px 10px' }}
          disabled={filters.page >= pagination.pages}
          onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
