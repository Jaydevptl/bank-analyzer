import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, X, AlertTriangle, HandCoins, Receipt, Ban, RotateCcw, Pencil, Trash2 } from 'lucide-react';
import {
  finoListLoans, finoGetLoan, finoCreateLoan, finoLoanRepayment,
  finoLoanWriteOff, finoBorrowerSummary,
  finoListParties, finoCreateParty,
  finoListBanks,
  finoCancelLoan, finoDeleteLoan, finoUpdateLoan, finoDeleteRepayment,
} from '../../services/api';
import EditModal from '../shared/EditModal';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_COLORS = {
  active:           { bg: 'rgba(59,130,246,0.10)', c: 'var(--info)' },
  partially_repaid: { bg: 'rgba(245,158,11,0.10)', c: 'var(--warning)' },
  closed:           { bg: 'rgba(34,197,94,0.10)',  c: 'var(--success)' },
  defaulted:        { bg: 'rgba(239,68,68,0.10)',  c: 'var(--danger)' },
  written_off:      { bg: 'rgba(100,100,100,0.10)', c: 'var(--text-muted)' },
};

export default function LoansGivenPage() {
  const [loans, setLoans]       = useState([]);
  const [summary, setSummary]   = useState([]);
  const [selId, setSelId]       = useState(null);
  const [detail, setDetail]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([finoListLoans(), finoBorrowerSummary()]);
      setLoans(l.data.loans || []);
      setSummary(s.data.summary || []);
      if (!selId && l.data.loans?.length) setSelId(l.data.loans[0].id);
    } finally { setLoading(false); }
  }, [selId]);

  const loadDetail = useCallback((id) => {
    if (!id) return setDetail(null);
    finoGetLoan(id).then(({ data }) => setDetail(data));
  }, []);

  useEffect(() => { reload(); }, []);
  useEffect(() => { loadDetail(selId); }, [selId, loadDetail]);

  const onSaved = () => { setModal(null); reload(); loadDetail(selId); };

  const totals = useMemo(() => {
    const active = loans.filter(l => l.status !== 'closed' && l.status !== 'written_off');
    return {
      activeCount: active.length,
      disbursed: loans.reduce((s, l) => s + Number(l.principal_amount || 0), 0),
      repaid:    loans.reduce((s, l) => s + Number(l.total_repaid || 0), 0),
      outstanding: active.reduce((s, l) => s + Number(l.computed?.totalOutstanding || 0), 0),
    };
  }, [loans]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Loans Given</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setModal('new')}>
          <Plus size={13} /> New Loan
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        <SummaryCard label="Active Loans"      value={totals.activeCount} />
        <SummaryCard label="Total Disbursed"   value={fmt(totals.disbursed)} />
        <SummaryCard label="Total Repaid"      value={fmt(totals.repaid)}      color="var(--success)" />
        <SummaryCard label="Outstanding"       value={fmt(totals.outstanding)} color="var(--warning)" />
      </div>

      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 280px)' }}>
        {/* LEFT: borrower-grouped loan list */}
        <aside style={{ width: 340, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
            Loans by Borrower
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? <div className="spinner" style={{ margin: '40px auto' }} /> : loans.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No loans yet. Click "New Loan" to start.
              </div>
            ) : groupBy(loans, 'borrower_party_id').map(([bid, items]) => {
              const sumOut = items.reduce((s, l) => s + Number(l.computed?.totalOutstanding || 0), 0);
              const borrower = summary.find(s => s.borrower_party_id === bid);
              return (
                <div key={bid}>
                  <div style={{ padding: '8px 12px', background: 'var(--bg-page)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{borrower?.name || 'Unknown'}</span>
                    <span>{fmt(sumOut)}</span>
                  </div>
                  {items.map(l => {
                    const active = selId === l.id;
                    const isOverdue = l.expected_return_date && l.expected_return_date < today() && !['closed','written_off'].includes(l.status);
                    const sc = STATUS_COLORS[l.status] || STATUS_COLORS.active;
                    return (
                      <button key={l.id} onClick={() => setSelId(l.id)} style={{
                        width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
                        background: active ? 'var(--bg-hover)' : 'transparent',
                        borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                        textAlign: 'left', borderBottom: '1px solid var(--border)',
                        display: 'flex', flexDirection: 'column', gap: 4,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>
                            {l.loan_label || `Loan ${l.id.slice(0, 6)}`}
                            {isOverdue && <AlertTriangle size={11} color="var(--danger)" style={{ marginLeft: 4, verticalAlign: -1 }} />}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(l.computed?.totalOutstanding)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {l.disbursed_date} · {l.interest_rate_percent}% {l.interest_type}
                          </span>
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, fontWeight: 600, background: sc.bg, color: sc.c }}>
                            {l.status.replace('_', ' ')}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </aside>

        {/* RIGHT: loan detail */}
        <section style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!detail ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
              {loans.length === 0 ? 'Create a loan to begin.' : 'Select a loan on the left.'}
            </div>
          ) : (
            <LoanDetail data={detail} onAct={(action) => setModal(action)} />
          )}
        </section>
      </div>

      {modal === 'new'      && <NewLoanModal onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'repay'    && detail && <RepaymentModal loan={detail} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'writeoff' && detail && <WriteOffModal loan={detail} onClose={() => setModal(null)} onSaved={onSaved} />}

      {modal === 'cancel' && detail && (
        <DeleteConfirmModal title="Cancel Disbursement"
          description={`Reverses the disbursement ledger pair (Bank ↑, Loans Given ↓). Use this when the loan was created by mistake. Bank balance will recover ${fmt(detail.loan.principal_amount)}.`}
          warning="Allowed only when no repayments exist."
          confirmLabel="Cancel Loan"
          onClose={() => setModal(null)}
          onConfirm={(reason) => finoCancelLoan(detail.loan.id, reason).then(() => { setSelId(null); onSaved(); })}
        />
      )}
      {modal === 'editLoan' && detail && (
        <EditModal title="Edit Loan"
          fields={[
            { key: 'loanLabel',          label: 'Loan Label' },
            { key: 'expectedReturnDate', label: 'Expected Return Date', type: 'date' },
            { key: 'notes',              label: 'Notes', type: 'textarea' },
            { key: 'principalLocked',    label: 'Principal', locked: true, hint: 'Reverse repayments + cancel + recreate to change principal/rate/type/date.' },
          ]}
          initialValues={{
            loanLabel: detail.loan.loan_label || '',
            expectedReturnDate: detail.loan.expected_return_date || '',
            notes: detail.loan.notes || '',
            principalLocked: String(detail.loan.principal_amount),
          }}
          onClose={() => setModal(null)}
          onSubmit={(patch) => finoUpdateLoan(detail.loan.id, patch).then(onSaved)}
        />
      )}
      {modal === 'deleteLoan' && detail && (
        <DeleteConfirmModal title="Delete Loan"
          description="Reverses every ledger group attached to this loan (disbursement, repayments, write-off if any). The loan and its repayments are hidden from lists but remain in DB for audit."
          confirmLabel="Delete & Reverse All"
          onClose={() => setModal(null)}
          onConfirm={(reason) => finoDeleteLoan(detail.loan.id, reason).then(() => { setSelId(null); onSaved(); })}
        />
      )}
      {modal?.kind === 'deleteRepayment' && (
        <DeleteConfirmModal title="Reverse Repayment"
          description={`Reverses repayment of ${fmt(modal.repayment.amount_received)}. Loan outstanding will increase by this amount.`}
          confirmLabel="Reverse"
          onClose={() => setModal(null)}
          onConfirm={(reason) => finoDeleteRepayment(modal.repayment.id, reason).then(onSaved)}
        />
      )}
    </div>
  );
}

function groupBy(arr, key) {
  const m = new Map();
  for (const x of arr) {
    const k = x[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return [...m.entries()];
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || 'var(--text-primary)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function LoanDetail({ data, onAct }) {
  const { loan, borrower, repayments, computed } = data;
  const sc = STATUS_COLORS[loan.status] || STATUS_COLORS.active;
  const canAct = !['closed', 'written_off'].includes(loan.status);
  return (
    <>
      <div style={{ padding: 18, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              {borrower?.name || 'Unknown borrower'}
              <span style={{ marginLeft: 10, fontSize: 10, padding: '3px 8px', borderRadius: 12, fontWeight: 600, background: sc.bg, color: sc.c }}>
                {loan.status.replace('_', ' ')}
              </span>
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {loan.loan_label || '—'} · Disbursed {loan.disbursed_date}
              {loan.expected_return_date ? ` · Due ${loan.expected_return_date}` : ''}
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
              <Stat label="Principal"       value={fmt(loan.principal_amount)} />
              <Stat label="Rate"            value={`${loan.interest_rate_percent}% ${loan.interest_type}`} />
              <Stat label="Outstanding"     value={fmt(computed.totalOutstanding)} highlight />
              <Stat label="↳ Principal"     value={fmt(computed.outstandingPrincipal)} small />
              <Stat label="↳ Interest"      value={fmt(computed.interestOutstanding)} small color="var(--warning)" />
              <Stat label="Days"            value={computed.daysOutstanding} small />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {canAct && (
              <button className="btn btn-sm" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--success)' }} onClick={() => onAct('repay')}>
                <Receipt size={13} /> Record Repayment
              </button>
            )}
            <RowMenu items={[
              { label: 'Cancel Disbursement', icon: <RotateCcw size={12} />,
                disabled: loan.status !== 'active' || repayments.length > 0,
                onClick: () => onAct('cancel') },
              { label: 'Write Off', icon: <Ban size={12} />,
                disabled: !['active','partially_repaid'].includes(loan.status),
                onClick: () => onAct('writeoff') },
              { label: 'Edit', icon: <Pencil size={12} />,
                onClick: () => onAct('editLoan') },
              { label: 'Delete (reverse all)', icon: <Trash2 size={12} />, danger: true,
                onClick: () => onAct('deleteLoan') },
            ]} />
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 13 }}>Repayment History</h3>
        {repayments.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No repayments yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Date</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Interest</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Principal</th>
                <th style={{ padding: '6px 8px' }}>Notes</th>
                <th style={{ padding: '6px 8px', width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {repayments.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 8 }}>{r.repayment_date}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{fmt(r.amount_received)}</td>
                  <td style={{ padding: 8, textAlign: 'right', color: 'var(--warning)' }}>{fmt(r.interest_portion)}</td>
                  <td style={{ padding: 8, textAlign: 'right', color: 'var(--success)' }}>{fmt(r.principal_portion)}</td>
                  <td style={{ padding: 8, color: 'var(--text-secondary)' }}>{r.notes || '—'}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>
                    <RowMenu items={[
                      { label: 'Delete (reverse)', icon: <Trash2 size={12} />, danger: true,
                        onClick: () => onAct({ kind: 'deleteRepayment', repayment: r }) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, highlight, small, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{
        fontSize: small ? 13 : (highlight ? 18 : 14),
        fontWeight: highlight ? 800 : 600,
        color: color || (highlight ? 'var(--accent)' : 'var(--text-primary)'),
      }}>{value}</div>
    </div>
  );
}

// ───────────── Modal primitives ─────────────
function ModalShell({ title, onClose, children, width = 480 }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 22, width: '100%', maxWidth: width, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}
function ErrorBox({ msg }) { return msg ? <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginTop: 8 }}>{msg}</div> : null; }

// ───────────── New Loan Modal ─────────────
function NewLoanModal({ onClose, onSaved }) {
  const [banks, setBanks] = useState([]);
  const [f, setF] = useState({
    borrowerPartyId: '', borrowerName: '',
    loanLabel: '', principalAmount: '', disbursedDate: today(),
    interestRatePercent: '12', interestType: 'simple', compoundFrequency: 'monthly',
    disbursedViaAccountId: '', expectedReturnDate: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  useEffect(() => {
    finoListBanks().then(({ data }) => {
      setBanks(data.accounts || []);
      const first = data.accounts?.[0];
      if (first) set('disbursedViaAccountId', first.linked_account_id);
    });
  }, []);

  const submit = async () => {
    setErr(null);
    if (!f.borrowerPartyId) return setErr('Select a borrower');
    if (!Number(f.principalAmount)) return setErr('Principal required');
    if (!f.disbursedViaAccountId) return setErr('Select a bank/cash account');
    setSaving(true);
    try {
      await finoCreateLoan({
        ...f,
        principalAmount: Number(f.principalAmount),
        interestRatePercent: Number(f.interestRatePercent) || 0,
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title="New Loan" onClose={onClose}>
      <Field label="Borrower *">
        <BorrowerPicker
          value={f.borrowerPartyId}
          name={f.borrowerName}
          onChange={(id, name) => { set('borrowerPartyId', id); set('borrowerName', name); }}
        />
      </Field>
      <Field label="Loan Label (optional)">
        <input className="input" value={f.loanLabel} onChange={e => set('loanLabel', e.target.value)} placeholder="Personal loan / Vehicle loan" />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Principal (₹) *"><input className="input" type="number" step="0.01" value={f.principalAmount} onChange={e => set('principalAmount', e.target.value)} /></Field>
        <Field label="Disbursed Date"><input className="input" type="date" value={f.disbursedDate} onChange={e => set('disbursedDate', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Interest Rate %"><input className="input" type="number" step="0.0001" value={f.interestRatePercent} onChange={e => set('interestRatePercent', e.target.value)} /></Field>
        <Field label="Interest Type">
          <select className="input" value={f.interestType} onChange={e => set('interestType', e.target.value)}>
            <option value="simple">Simple</option>
            <option value="compound">Compound</option>
            <option value="none">None</option>
          </select>
        </Field>
      </div>
      {f.interestType === 'compound' && (
        <Field label="Compound Frequency">
          <select className="input" value={f.compoundFrequency} onChange={e => set('compoundFrequency', e.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly (treated as monthly in v1)</option>
            <option value="yearly">Yearly (treated as monthly in v1)</option>
          </select>
        </Field>
      )}
      <Field label="Disbursed Via *">
        <select className="input" value={f.disbursedViaAccountId} onChange={e => set('disbursedViaAccountId', e.target.value)}>
          <option value="">— select bank/cash —</option>
          {banks.map(b => <option key={b.id} value={b.linked_account_id}>{b.account_name} ({b.bank_name})</option>)}
        </select>
      </Field>
      <Field label="Expected Return Date (optional)"><input className="input" type="date" value={f.expectedReturnDate} onChange={e => set('expectedReturnDate', e.target.value)} /></Field>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrorBox msg={err} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
          {saving ? 'Disbursing…' : 'Disburse Loan'}
        </button>
      </div>
    </ModalShell>
  );
}

// ───────────── Borrower Picker (typeahead + inline create) ─────────────
function BorrowerPicker({ value, name, onChange }) {
  const [query, setQuery] = useState(name || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      finoListParties({ role: 'borrower', search: query || undefined }).then(({ data }) => setResults(data.parties || []));
    }, 150);
    return () => clearTimeout(t);
  }, [query, open]);

  const pick = (p) => { onChange(p.id, p.name); setQuery(p.name); setOpen(false); };

  const createBorrower = async () => {
    if (!query.trim()) return;
    setCreating(true);
    try {
      const { data } = await finoCreateParty({ name: query.trim(), isBorrower: true });
      pick(data.party);
    } finally { setCreating(false); }
  };

  return (
    <div style={{ position: 'relative' }}>
      <input className="input" value={query}
        placeholder="Type borrower name..."
        onChange={e => { setQuery(e.target.value); setOpen(true); onChange('', e.target.value); }}
        onFocus={() => setOpen(true)} />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 110,
          background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
          marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {results.map(p => (
            <button key={p.id} onClick={() => pick(p)} style={{
              width: '100%', padding: '8px 12px', border: 'none', cursor: 'pointer',
              background: 'transparent', textAlign: 'left', fontSize: 12,
              color: 'var(--text-primary)',
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              {p.name} {p.contact_phone ? <span style={{ color: 'var(--text-muted)' }}>· {p.contact_phone}</span> : null}
            </button>
          ))}
          {query.trim() && !results.some(r => r.name.toLowerCase() === query.trim().toLowerCase()) && (
            <button onClick={createBorrower} disabled={creating} style={{
              width: '100%', padding: '8px 12px', border: 'none', cursor: 'pointer',
              background: 'var(--bg-page)', textAlign: 'left', fontSize: 12,
              color: 'var(--accent)', borderTop: '1px solid var(--border)',
            }}>
              {creating ? 'Creating…' : `+ Add "${query.trim()}" as new borrower`}
            </button>
          )}
        </div>
      )}
      {!open && value && (
        <button onClick={() => setOpen(true)} style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11,
        }}>change</button>
      )}
    </div>
  );
}

// ───────────── Repayment Modal ─────────────
function RepaymentModal({ loan, onClose, onSaved }) {
  const [banks, setBanks] = useState([]);
  const [f, setF] = useState({
    repaymentDate: today(), amountReceived: '',
    receivedViaAccountId: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  useEffect(() => {
    finoListBanks().then(({ data }) => {
      setBanks(data.accounts || []);
      if (data.accounts?.[0]) set('receivedViaAccountId', data.accounts[0].linked_account_id);
    });
  }, []);

  // Local preview (matches backend logic for simple interest)
  const preview = useMemo(() => {
    const amt = Number(f.amountReceived) || 0;
    const intOut = Number(loan.computed?.interestOutstanding) || 0;
    if (!amt) return null;
    if (amt <= intOut) return { interest: amt, principal: 0 };
    return { interest: intOut, principal: amt - intOut };
  }, [f.amountReceived, loan.computed]);

  const submit = async () => {
    setErr(null);
    const amt = Number(f.amountReceived);
    if (!(amt > 0)) return setErr('Amount must be > 0');
    if (!f.receivedViaAccountId) return setErr('Select bank/cash');
    setSaving(true);
    try {
      await finoLoanRepayment(loan.loan.id, { ...f, amountReceived: amt });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title="Record Repayment" onClose={onClose}>
      <div style={{ background: 'var(--bg-page)', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
        <div><b>Outstanding:</b> {fmt(loan.computed.totalOutstanding)}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          Principal {fmt(loan.computed.outstandingPrincipal)} · Interest {fmt(loan.computed.interestOutstanding)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Date"><input className="input" type="date" value={f.repaymentDate} onChange={e => set('repaymentDate', e.target.value)} /></Field>
        <Field label="Amount (₹) *"><input className="input" type="number" step="0.01" value={f.amountReceived} onChange={e => set('amountReceived', e.target.value)} /></Field>
      </div>
      <Field label="Received Via *">
        <select className="input" value={f.receivedViaAccountId} onChange={e => set('receivedViaAccountId', e.target.value)}>
          <option value="">— select bank/cash —</option>
          {banks.map(b => <option key={b.id} value={b.linked_account_id}>{b.account_name} ({b.bank_name})</option>)}
        </select>
      </Field>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      {preview && (
        <div style={{ background: 'rgba(59,130,246,0.08)', padding: 10, borderRadius: 8, fontSize: 12 }}>
          <b>Auto-split preview:</b><br />
          Interest portion: <b>{fmt(preview.interest)}</b> · Principal portion: <b>{fmt(preview.principal)}</b>
        </div>
      )}
      <ErrorBox msg={err} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
          {saving ? 'Recording…' : 'Record'}
        </button>
      </div>
    </ModalShell>
  );
}

// ───────────── Write-off Modal ─────────────
function WriteOffModal({ loan, onClose, onSaved }) {
  const [f, setF] = useState({ date: today(), reason: '', confirm: false });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const amt = loan.computed.totalOutstanding;

  const submit = async () => {
    setErr(null);
    if (!f.confirm) return setErr('Confirm checkbox required');
    setSaving(true);
    try { await finoLoanWriteOff(loan.loan.id, { date: f.date, reason: f.reason }); onSaved(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title="Write Off Loan" onClose={onClose}>
      <div style={{ background: 'rgba(239,68,68,0.08)', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
        Marks loan as written off and records <b>{fmt(amt)}</b> as Misc Expense (5700).
      </div>
      <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
      <Field label="Reason"><input className="input" value={f.reason} onChange={e => set('reason', e.target.value)} placeholder="Defaulted / Borrower untraceable" /></Field>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 8 }}>
        <input type="checkbox" checked={f.confirm} onChange={e => set('confirm', e.target.checked)} />
        I understand this will write off <b>&nbsp;{fmt(amt)}&nbsp;</b> as expense
      </label>
      <ErrorBox msg={err} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center', background: 'var(--danger)', color: 'white' }} onClick={submit} disabled={saving}>
          {saving ? 'Writing off…' : 'Confirm Write-Off'}
        </button>
      </div>
    </ModalShell>
  );
}
