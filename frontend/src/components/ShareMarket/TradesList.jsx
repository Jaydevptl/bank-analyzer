import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Download, ChevronLeft, ChevronRight, X,
  ArrowUp, ArrowDown, ChevronsUpDown, RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { getTrades, getTradeBrokers } from '../../services/api';

const SEGMENTS = ['Equity', 'F&O', 'Commodity', 'Currency', 'MF', 'Unknown'];
const fmtNum = (n) => n ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '-';

const INIT_COLUMNS = [
  { key: 'tradeDate',    label: 'Date',     width: 100 },
  { key: 'symbol',       label: 'Symbol',   width: 140 },
  { key: 'segment',      label: 'Segment',  width: 90 },
  { key: 'type',         label: 'Type',     width: 70 },
  { key: 'quantity',     label: 'Qty',      width: 80 },
  { key: 'price',        label: 'Price',    width: 110 },
  { key: 'amount',       label: 'Amount',   width: 130 },
  { key: 'brokerage',    label: 'Brokerage',width: 100 },
  { key: 'stt',          label: 'STT',      width: 90 },
  { key: 'totalCharges', label: 'Charges',  width: 100 },
  { key: 'broker',       label: 'Broker',   width: 110 },
  { key: 'accountHolder',label: 'Account',  width: 130 },
];

export default function TradesList() {
  const [trades, setTrades] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });

  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [broker, setBroker] = useState('all');
  const [segment, setSegment] = useState('all');
  const [type, setType] = useState('all');
  const [sortBy, setSortBy] = useState('tradeDate');
  const [sortOrder, setSortOrder] = useState('desc');
  const [columns, setColumns] = useState(INIT_COLUMNS);
  const resizingRef = useRef(null);

  const startResize = (e, colKey) => {
    e.preventDefault(); e.stopPropagation();
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
      const params = { page, limit: pagination.limit, sortBy, sortOrder };
      if (search) params.symbol = search;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (broker !== 'all') params.broker = broker;
      if (segment !== 'all') params.segment = segment;
      if (type !== 'all') params.type = type;

      const { data } = await getTrades(params);
      setTrades(data.trades);
      setPagination(data.pagination);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, startDate, endDate, broker, segment, type, sortBy, sortOrder, pagination.limit]);

  useEffect(() => { load(1); }, [search, startDate, endDate, broker, segment, type, sortBy, sortOrder]);
  useEffect(() => { getTradeBrokers().then(({ data }) => setBrokers(data.brokers)).catch(() => {}); }, []);

  const handleSort = (col) => {
    if (sortBy === col) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder('asc'); }
  };

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <ChevronsUpDown size={11} color="var(--text-muted)" />;
    return sortOrder === 'asc' ? <ArrowUp size={11} color="var(--accent)" /> : <ArrowDown size={11} color="var(--accent)" />;
  };

  const renderCell = (t, col) => {
    switch (col.key) {
      case 'tradeDate': return <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{format(new Date(t.tradeDate), 'dd/MM/yyyy')}</span>;
      case 'symbol': return <span style={{ fontWeight: 600, fontSize: 12 }}>{t.symbol}</span>;
      case 'segment': return <span className="badge badge-muted">{t.segment}</span>;
      case 'type': return (
        <span className={`badge ${t.type === 'BUY' ? 'badge-info' : 'badge-warning'}`}>{t.type}</span>
      );
      case 'quantity': return <span style={{ fontSize: 12 }}>{t.quantity}</span>;
      case 'price': return <span style={{ fontSize: 12 }}>{fmtNum(t.price)}</span>;
      case 'amount': return <span style={{ fontSize: 12, fontWeight: 600 }}>{fmtNum(t.amount)}</span>;
      case 'brokerage': return <span style={{ fontSize: 11, color: 'var(--warning)' }}>{fmtNum(t.brokerage)}</span>;
      case 'stt': return <span style={{ fontSize: 11 }}>{fmtNum(t.stt)}</span>;
      case 'totalCharges': return <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>{fmtNum(t.totalCharges)}</span>;
      case 'broker': return <span style={{ fontSize: 11 }}>{t.broker}</span>;
      case 'accountHolder': return <span style={{ fontSize: 11 }}>{t.accountHolder || '-'}</span>;
      default: return '-';
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>All Trades</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{pagination.total} trades</p>
        </div>
      </div>

      <div className="filter-bar">
        <div style={{ position: 'relative', maxWidth: 200 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" placeholder="Search symbol..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ maxWidth: 150 }} />
        <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ maxWidth: 150 }} />
        <select className="input" value={broker} onChange={(e) => setBroker(e.target.value)} style={{ maxWidth: 150 }}>
          <option value="all">All Brokers</option>
          {brokers.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="input" value={segment} onChange={(e) => setSegment(e.target.value)} style={{ maxWidth: 130 }}>
          <option value="all">All Segments</option>
          {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)} style={{ maxWidth: 110 }}>
          <option value="all">All Types</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
        {(search || startDate || endDate || broker !== 'all' || segment !== 'all' || type !== 'all') && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setStartDate(''); setEndDate(''); setBroker('all'); setSegment('all'); setType('all'); }}>
            <X size={13} /> Clear
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => load(1)}><RefreshCw size={13} /></button>
      </div>

      <div className="table-wrapper">
        <table style={{ minWidth: columns.reduce((s, c) => s + c.width, 0) }}>
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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            ) : trades.length === 0 ? (
              <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No trades found. Upload broker statements to begin.</td></tr>
            ) : (
              trades.map(t => (
                <tr key={t._id}>
                  {columns.map(col => (
                    <td key={col.key} style={{ maxWidth: col.width }}>{renderCell(t, col)}</td>
                  ))}
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
