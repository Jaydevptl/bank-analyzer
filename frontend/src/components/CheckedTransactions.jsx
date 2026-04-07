import React, { useState } from 'react';
import {
  Trash2, ArrowUp, ArrowDown, ChevronsUpDown,
  CheckSquare, FileSpreadsheet, Download
} from 'lucide-react';
import { format } from 'date-fns';
import { updateTransaction } from '../services/api';

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

const getCatStyle = (cat) => CATEGORY_COLORS[cat] || { bg: 'rgba(100,116,139,0.1)', color: '#64748B' };
const fmt = (n) => n ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n) : '—';

// ── Category Cell ──────────────────────────────────────────────────────────────

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
      <select className="select" defaultValue={txn.category} autoFocus
        style={{ fontSize: 11, padding: '3px 6px' }}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => setEditing(false)}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    );
  }

  return (
    <span className="badge" title="Click to edit" onClick={() => setEditing(true)}
      style={{ cursor: 'pointer', background: style.bg, color: style.color, border: `1px solid ${style.color}30`, fontSize: 9, padding: '2px 7px' }}>
      {saving ? '…' : txn.category || 'Uncategorized'}
    </span>
  );
}

// ── Description Cell ───────────────────────────────────────────────────────────

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
      <input className="input" value={value} autoFocus
        style={{ fontSize: 11, padding: '2px 6px', width: '100%', minWidth: 140 }}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setValue(txn.description); setEditing(false); } }} />
    );
  }

  return (
    <div title={`${txn.description}\n(Click to edit)`} onClick={() => setEditing(true)}
      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: saving ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: 'text', maxWidth: '100%' }}>
      {saving ? '…' : value}
    </div>
  );
}

// ── Sort Icon ──────────────────────────────────────────────────────────────────

function SortIcon({ field, sortBy, sortOrder }) {
  if (sortBy !== field) return <ChevronsUpDown size={12} color="var(--text-muted)" />;
  return sortOrder === 'asc' ? <ArrowUp size={12} color="var(--accent)" /> : <ArrowDown size={12} color="var(--accent)" />;
}

// ── Main Component ─────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'date',        label: 'Date'         },
  { key: 'description', label: 'Description'  },
  { key: 'debit',       label: 'Debit (₹)'    },
  { key: 'credit',      label: 'Credit (₹)'   },
  { key: 'balance',     label: 'Balance (₹)'  },
  { key: 'bankName',    label: 'Bank'         },
  { key: 'accountName', label: 'Account Name' },
  { key: 'category',    label: 'Category'     },
];

export default function CheckedTransactions({ checkedTxns, onUncheck, onUncheckAll, onUpdate }) {
  const [sortBy, setSortBy]       = useState('date');
  const [sortOrder, setSortOrder] = useState('asc');

  const toggleSort = (field) => {
    setSortBy(field);
    setSortOrder((prev) => sortBy === field && prev === 'asc' ? 'desc' : 'asc');
  };

  const sorted = [...checkedTxns].sort((a, b) => {
    let va = a[sortBy], vb = b[sortBy];
    if (sortBy === 'date') { va = new Date(va); vb = new Date(vb); }
    if (va < vb) return sortOrder === 'asc' ? -1 : 1;
    if (va > vb) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  // Totals
  const totals = checkedTxns.reduce(
    (acc, t) => ({ debit: acc.debit + (t.debit || 0), credit: acc.credit + (t.credit || 0) }),
    { debit: 0, credit: 0 }
  );

  // Export to CSV (client-side)
  const exportCSV = () => {
    const rows = [
      ['Date', 'Description', 'Debit', 'Credit', 'Balance', 'Bank', 'Account Name', 'Category'],
      ...sorted.map((t) => [
        format(new Date(t.date), 'dd/MM/yyyy'),
        t.description,
        t.debit || '',
        t.credit || '',
        t.balance || '',
        t.bankName,
        t.accountName || '',
        t.category,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `checked_transactions_${Date.now()}.csv`;
    a.click();
  };

  if (checkedTxns.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 16 }}>
        <CheckSquare size={48} color="var(--text-muted)" strokeWidth={1.5} />
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No checked transactions yet</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Go to <strong style={{ color: 'var(--text-secondary)' }}>Transactions</strong> and check the rows you want to track
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {[
          { label: 'Checked',     value: checkedTxns.length,                     color: 'var(--accent)',  mono: false },
          { label: 'Total Debit', value: `₹${fmt(totals.debit)}`,                color: 'var(--debit)',   mono: true  },
          { label: 'Total Credit',value: `₹${fmt(totals.credit)}`,               color: 'var(--credit)',  mono: true  },
          { label: 'Net Flow',    value: `₹${fmt(Math.abs(totals.credit - totals.debit))}`, color: totals.credit >= totals.debit ? 'var(--credit)' : 'var(--debit)', mono: true },
        ].map(({ label, value, color, mono }) => (
          <div key={label} className="card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: mono ? 'IBM Plex Mono, monospace' : undefined }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {checkedTxns.length} transaction{checkedTxns.length !== 1 ? 's' : ''} checked
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={exportCSV}>
            <FileSpreadsheet size={13} color="#34D399" /> Export CSV
          </button>
          <button className="btn btn-danger" onClick={() => { if (window.confirm('Uncheck all transactions?')) onUncheckAll(); }}>
            <Trash2 size={13} /> Uncheck All
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto', maxHeight: 600, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }} />
                {COLUMNS.map(({ key, label }) => (
                  <th key={key} onClick={() => toggleSort(key)}
                    style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {label}
                      <SortIcon field={key} sortBy={sortBy} sortOrder={sortOrder} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((txn) => (
                <tr key={txn._id}>
                  {/* Uncheck button */}
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked
                      onChange={() => onUncheck(txn._id)}
                      style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)' }}
                    />
                  </td>
                  <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {format(new Date(txn.date), 'dd MMM yyyy')}
                  </td>
                  <td style={{ maxWidth: 280, overflow: 'hidden' }}>
                    <DescriptionCell txn={txn} onUpdate={onUpdate} />
                  </td>
                  <td className="amount" style={{ color: txn.debit > 0 ? 'var(--debit)' : 'var(--text-muted)' }}>
                    {txn.debit > 0 ? fmt(txn.debit) : '—'}
                  </td>
                  <td className="amount" style={{ color: txn.credit > 0 ? 'var(--credit)' : 'var(--text-muted)' }}>
                    {txn.credit > 0 ? fmt(txn.credit) : '—'}
                  </td>
                  <td className="amount" style={{ color: 'var(--text-secondary)' }}>
                    {txn.balance ? fmt(txn.balance) : '—'}
                  </td>
                  <td><span className="tag" style={{ fontSize: 10 }}>{txn.bankName}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {txn.accountName || '—'}
                  </td>
                  <td><CategoryCell txn={txn} onUpdate={onUpdate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
