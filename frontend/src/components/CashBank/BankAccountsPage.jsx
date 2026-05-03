import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  Receipt, Coins, Trash2, Pencil, Landmark, X,
} from 'lucide-react';
import {
  finoListBanks, finoGetBank, finoCreateBank, finoBankLedger,
  finoBankDeposit, finoBankWithdraw, finoBankTransfer,
  finoBankCharge, finoBankInterest,
  finoUpdateBank, finoDeleteBank, finoDeleteBankTxn, finoUpdateBankTxn,
} from '../../services/api';
import EditModal from '../shared/EditModal';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const SOURCES = [
  { v: 'cash_deposit',     l: 'Cash Deposit' },
  { v: 'customer_payment', l: 'Customer Payment' },
  { v: 'sales',            l: 'Sales' },
  { v: 'other_income',     l: 'Other Income' },
  { v: 'refund',           l: 'Refund' },
  { v: 'cashback',         l: 'Cashback' },
  { v: 'drawings_in',      l: 'Owner Contribution' },
  { v: 'manual',           l: 'Manual / Other' },
];
const DESTS = [
  { v: 'cash_withdrawal',  l: 'Cash Withdrawal' },
  { v: 'supplier_payment', l: 'Supplier Payment' },
  { v: 'expense',          l: 'Expense' },
  { v: 'salary',           l: 'Salary' },
  { v: 'rent',             l: 'Office Rent' },
  { v: 'marketing',        l: 'Marketing' },
  { v: 'office_expense',   l: 'Office Expense' },
  { v: 'shipping',         l: 'Shipping' },
  { v: 'drawings_out',     l: 'Owner Drawings' },
  { v: 'manual',           l: 'Manual / Other' },
];

export default function BankAccountsPage() {
  const [banks, setBanks]       = useState([]);
  const [selectedId, setSelId]  = useState(null);
  const [detail, setDetail]     = useState(null);
  const [ledger, setLedger]     = useState({ entries: [] });
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null); // 'add' | 'deposit' | 'withdraw' | 'transfer' | 'charge' | 'interest'

  const loadBanks = useCallback(() => {
    setLoading(true);
    finoListBanks().then(({ data }) => {
      setBanks(data.accounts || []);
      if (!selectedId && data.accounts?.length) setSelId(data.accounts[0].id);
    }).finally(() => setLoading(false));
  }, [selectedId]);

  const loadDetail = useCallback((id) => {
    if (!id) return;
    Promise.all([
      finoGetBank(id),
      finoBankLedger(id, { limit: 200 }),
    ]).then(([d, l]) => {
      setDetail(d.data.account);
      setLedger(l.data);
    });
  }, []);

  useEffect(() => { loadBanks(); }, []);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);

  const refreshAll = () => { loadBanks(); loadDetail(selectedId); };
  const closeModal = () => setModal(null);
  const onSaved = () => { closeModal(); refreshAll(); };

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 140px)' }}>
      {/* LEFT: bank list */}
      <aside style={{
        width: 320, background: 'var(--bg-surface)', borderRadius: 12,
        border: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Bank Accounts</h2>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{banks.length} accounts</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setModal('add')}>
            <Plus size={13} /> Add Bank
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : banks.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No bank accounts yet.<br />Click "Add Bank" to start.
            </div>
          ) : banks.map(b => {
            const active = selectedId === b.id;
            return (
              <button key={b.id} onClick={() => setSelId(b.id)} style={{
                width: '100%', padding: '12px 14px', border: 'none', cursor: 'pointer',
                background: active ? 'var(--bg-hover)' : 'transparent',
                borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, background: 'var(--bg-page)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Landmark size={16} color="var(--accent)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {b.account_name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {b.bank_name}{b.account_number_last4 ? ` ····${b.account_number_last4}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: Number(b.current_balance) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {fmt(b.current_balance)}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* RIGHT: detail + ledger */}
      <section style={{
        flex: 1, background: 'var(--bg-surface)', borderRadius: 12,
        border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minWidth: 0,
      }}>
        {!detail ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            {banks.length === 0 ? 'Add a bank account to begin.' : 'Select a bank account on the left.'}
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: 18, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{detail.account_name}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {detail.bank_name}
                  {detail.account_holder ? ` · ${detail.account_holder}` : ''}
                  {detail.account_number_last4 ? ` · ····${detail.account_number_last4}` : ''}
                  {detail.ifsc_code ? ` · ${detail.ifsc_code}` : ''}
                </div>
                <div style={{ marginTop: 10, fontSize: 22, fontWeight: 800, color: Number(detail.live_balance) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {fmt(detail.live_balance)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Current balance</div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => setModal('deposit')} style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--success)' }}>
                  <ArrowDownToLine size={13} /> Deposit
                </button>
                <button className="btn btn-sm" onClick={() => setModal('withdraw')} style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}>
                  <ArrowUpFromLine size={13} /> Withdraw
                </button>
                <button className="btn btn-sm" onClick={() => setModal('transfer')} style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--info)' }}>
                  <ArrowLeftRight size={13} /> Transfer
                </button>
                <button className="btn btn-sm" onClick={() => setModal('charge')} style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--warning)' }}>
                  <Receipt size={13} /> Charge
                </button>
                <button className="btn btn-sm" onClick={() => setModal('interest')} style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>
                  <Coins size={13} /> Interest
                </button>
                <button className="btn btn-ghost btn-sm" title="Edit bank details"
                  onClick={() => setModal('editBank')}>
                  <Pencil size={13} />
                </button>
                <button className="btn btn-ghost btn-sm" title="Delete bank (reverses all txns)"
                  onClick={() => setModal('deleteBank')}
                  style={{ color: 'var(--danger)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Ledger */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
              <table style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                    <th style={{ padding: '6px 8px' }}>Date</th>
                    <th style={{ padding: '6px 8px' }}>Description</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Debit</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Credit</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Balance</th>
                    <th style={{ padding: '6px 8px', width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.entries.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No transactions yet.</td></tr>
                  ) : ledger.entries.map(r => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)', opacity: r.is_reversed ? 0.5 : 1 }}>
                      <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{r.txn_date}</td>
                      <td style={{ padding: '8px' }}>{r.description || '—'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--success)' }}>
                        {r.direction === 'debit' ? fmt(r.amount) : ''}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--danger)' }}>
                        {r.direction === 'credit' ? fmt(r.amount) : ''}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{fmt(r.running_balance)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <RowMenu items={[
                          { label: 'Edit description', icon: <Pencil size={12} />, disabled: r.is_reversed,
                            onClick: () => setModal({ kind: 'editTxn', row: r }) },
                          { label: 'Delete (reverse)', icon: <Trash2 size={12} />, danger: true, disabled: r.is_reversed,
                            onClick: () => setModal({ kind: 'deleteTxn', row: r }) },
                        ]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {modal === 'add'      && <AddBankModal onClose={closeModal} onSaved={onSaved} />}
      {modal === 'deposit'  && <DepositModal bank={detail} onClose={closeModal} onSaved={onSaved} />}
      {modal === 'withdraw' && <WithdrawModal bank={detail} onClose={closeModal} onSaved={onSaved} />}
      {modal === 'transfer' && <TransferModal banks={banks} fromId={selectedId} onClose={closeModal} onSaved={onSaved} />}
      {modal === 'charge'   && <SimpleAmountModal title="Bank Charge" bank={detail} action={finoBankCharge} onClose={closeModal} onSaved={onSaved} />}
      {modal === 'interest' && <SimpleAmountModal title="Interest Earned" bank={detail} action={finoBankInterest} onClose={closeModal} onSaved={onSaved} />}
      {modal === 'editBank' && detail && (
        <EditModal title={`Edit ${detail.account_name}`}
          fields={[
            { key: 'accountName',         label: 'Account Nickname' },
            { key: 'bankName',            label: 'Bank Name' },
            { key: 'accountHolder',       label: 'Account Holder' },
            { key: 'accountNumberLast4',  label: 'Last 4 Digits' },
            { key: 'ifscCode',            label: 'IFSC' },
            { key: 'notes',               label: 'Notes', type: 'textarea' },
          ]}
          initialValues={{
            accountName: detail.account_name, bankName: detail.bank_name,
            accountHolder: detail.account_holder || '', accountNumberLast4: detail.account_number_last4 || '',
            ifscCode: detail.ifsc_code || '', notes: detail.notes || '',
          }}
          onClose={closeModal}
          onSubmit={(patch) => finoUpdateBank(detail.id, patch).then(onSaved)}
        />
      )}
      {modal === 'deleteBank' && detail && (
        <DeleteConfirmModal title={`Delete ${detail.account_name}`}
          description="This will reverse the opening-balance entry plus every deposit, withdrawal, transfer, charge, and interest entry tied to this bank. The COA child entry is hidden but kept for audit."
          warning={Math.abs(detail.live_balance) > 0.01 ? `Current balance is ${fmt(detail.live_balance)} — it will be neutralized via reversals.` : null}
          confirmLabel="Delete & Reverse"
          onClose={closeModal}
          onConfirm={(reason) => finoDeleteBank(detail.id, reason).then(() => { setSelId(null); refreshAll(); })}
        />
      )}
      {modal?.kind === 'editTxn' && (
        <EditModal title="Edit Transaction"
          fields={[
            { key: 'description', label: 'Description' },
            { key: 'date',        label: 'Date', type: 'date' },
            { key: 'notes',       label: 'Notes', type: 'textarea' },
          ]}
          initialValues={{ description: modal.row.description || '', date: modal.row.txn_date, notes: modal.row.notes || '' }}
          onClose={closeModal}
          onSubmit={(patch) => finoUpdateBankTxn(modal.row.txn_group_id, patch).then(onSaved)}
        />
      )}
      {modal?.kind === 'deleteTxn' && (
        <DeleteConfirmModal title="Reverse Transaction"
          description={`A balanced reversal entry will be inserted under a new txn group. Original entry stays for audit. Bank balance will adjust by ${fmt(modal.row.amount)}.`}
          confirmLabel="Reverse"
          onClose={closeModal}
          onConfirm={(reason) => finoDeleteBankTxn(modal.row.txn_group_id, reason).then(onSaved)}
        />
      )}
    </div>
  );
}

// ───────────── Modal shell ─────────────
function ModalShell({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', borderRadius: 12, padding: 22,
        width: '100%', maxWidth: 460, maxHeight: '90vh', overflow: 'auto',
      }}>
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

function FormButtons({ onCancel, onSave, saving, label = 'Save' }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
      <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel}>Cancel</button>
      <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : label}
      </button>
    </div>
  );
}

function ErrorBox({ msg }) {
  if (!msg) return null;
  return <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginTop: 8 }}>{msg}</div>;
}

// ───────────── Add Bank Modal ─────────────
function AddBankModal({ onClose, onSaved }) {
  const [f, setF] = useState({
    accountName: '', bankName: '', accountHolder: '', accountNumberLast4: '',
    ifscCode: '', accountType: 'savings', openingBalance: 0, openingDate: today(),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const submit = async () => {
    setErr(null);
    if (!f.accountName.trim() || !f.bankName.trim()) return setErr('Account name & bank name required');
    setSaving(true);
    try { await finoCreateBank(f); onSaved(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title="Add Bank Account" onClose={onClose}>
      <Field label="Account Nickname *">
        <input className="input" value={f.accountName} onChange={e => set('accountName', e.target.value)} placeholder="Kotak - Jaydev" />
      </Field>
      <Field label="Bank Name *">
        <input className="input" value={f.bankName} onChange={e => set('bankName', e.target.value)} placeholder="Kotak Mahindra Bank" />
      </Field>
      <Field label="Account Holder">
        <input className="input" value={f.accountHolder} onChange={e => set('accountHolder', e.target.value)} placeholder="Legal name" />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Last 4 Digits"><input className="input" maxLength={4} value={f.accountNumberLast4} onChange={e => set('accountNumberLast4', e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="IFSC"><input className="input" value={f.ifscCode} onChange={e => set('ifscCode', e.target.value.toUpperCase())} /></Field>
      </div>
      <Field label="Account Type">
        <select className="input" value={f.accountType} onChange={e => set('accountType', e.target.value)}>
          <option value="savings">Savings</option>
          <option value="current">Current</option>
          <option value="salary">Salary</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Opening Balance"><input className="input" type="number" step="0.01" value={f.openingBalance} onChange={e => set('openingBalance', e.target.value)} /></Field>
        <Field label="Opening Date"><input className="input" type="date" value={f.openingDate} onChange={e => set('openingDate', e.target.value)} /></Field>
      </div>
      <ErrorBox msg={err} />
      <FormButtons onCancel={onClose} onSave={submit} saving={saving} label="Add Bank" />
    </ModalShell>
  );
}

// ───────────── Deposit / Withdraw Modals ─────────────
function DepositModal({ bank, onClose, onSaved }) {
  return <DepositOrWithdraw bank={bank} mode="deposit" onClose={onClose} onSaved={onSaved} />;
}
function WithdrawModal({ bank, onClose, onSaved }) {
  return <DepositOrWithdraw bank={bank} mode="withdraw" onClose={onClose} onSaved={onSaved} />;
}

function DepositOrWithdraw({ bank, mode, onClose, onSaved }) {
  const isDeposit = mode === 'deposit';
  const opts = isDeposit ? SOURCES : DESTS;
  const [f, setF] = useState({
    amount: '', date: today(),
    category: opts[0].v, description: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null);
    const amt = Number(f.amount);
    if (!(amt > 0)) return setErr('Amount must be > 0');
    setSaving(true);
    try {
      const payload = {
        bankAccountId: bank.id,
        amount: amt,
        date: f.date,
        description: f.description,
        ...(isDeposit ? { sourceCategory: f.category } : { destinationCategory: f.category }),
      };
      if (isDeposit) await finoBankDeposit(payload); else await finoBankWithdraw(payload);
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title={`${isDeposit ? 'Deposit to' : 'Withdraw from'} ${bank.account_name}`} onClose={onClose}>
      <Field label="Amount (₹) *">
        <input className="input" type="number" step="0.01" autoFocus
          value={f.amount} onChange={e => set('amount', e.target.value)} />
      </Field>
      <Field label="Date">
        <input className="input" type="date" value={f.date} onChange={e => set('date', e.target.value)} />
      </Field>
      <Field label={isDeposit ? 'Source' : 'Destination'}>
        <select className="input" value={f.category} onChange={e => set('category', e.target.value)}>
          {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </Field>
      <Field label="Description">
        <input className="input" value={f.description} onChange={e => set('description', e.target.value)} placeholder="Optional note" />
      </Field>
      <ErrorBox msg={err} />
      <FormButtons onCancel={onClose} onSave={submit} saving={saving} label={isDeposit ? 'Deposit' : 'Withdraw'} />
    </ModalShell>
  );
}

// ───────────── Transfer Modal ─────────────
function TransferModal({ banks, fromId, onClose, onSaved }) {
  const others = banks.filter(b => b.id !== fromId);
  const [f, setF] = useState({
    fromBankId: fromId,
    toBankId: others[0]?.id || '',
    amount: '', date: today(), description: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null);
    const amt = Number(f.amount);
    if (!(amt > 0))            return setErr('Amount must be > 0');
    if (!f.toBankId)           return setErr('Select destination bank');
    if (f.fromBankId === f.toBankId) return setErr('From and To must differ');
    setSaving(true);
    try { await finoBankTransfer({ ...f, amount: amt }); onSaved(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title="Transfer Between Banks" onClose={onClose}>
      <Field label="From">
        <select className="input" value={f.fromBankId} onChange={e => set('fromBankId', e.target.value)}>
          {banks.map(b => <option key={b.id} value={b.id}>{b.account_name}</option>)}
        </select>
      </Field>
      <Field label="To">
        <select className="input" value={f.toBankId} onChange={e => set('toBankId', e.target.value)}>
          <option value="">— select —</option>
          {banks.filter(b => b.id !== f.fromBankId).map(b => <option key={b.id} value={b.id}>{b.account_name}</option>)}
        </select>
      </Field>
      <Field label="Amount (₹) *"><input className="input" type="number" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
      <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
      <Field label="Description"><input className="input" value={f.description} onChange={e => set('description', e.target.value)} /></Field>
      <ErrorBox msg={err} />
      <FormButtons onCancel={onClose} onSave={submit} saving={saving} label="Transfer" />
    </ModalShell>
  );
}

// ───────────── Charge / Interest (simple amount + date) ─────────────
function SimpleAmountModal({ title, bank, action, onClose, onSaved }) {
  const [f, setF] = useState({ amount: '', date: today(), description: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const submit = async () => {
    setErr(null);
    const amt = Number(f.amount);
    if (!(amt > 0)) return setErr('Amount must be > 0');
    setSaving(true);
    try { await action({ bankAccountId: bank.id, amount: amt, date: f.date, description: f.description }); onSaved(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <ModalShell title={`${title} · ${bank.account_name}`} onClose={onClose}>
      <Field label="Amount (₹) *"><input className="input" type="number" step="0.01" autoFocus value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
      <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
      <Field label="Description"><input className="input" value={f.description} onChange={e => set('description', e.target.value)} /></Field>
      <ErrorBox msg={err} />
      <FormButtons onCancel={onClose} onSave={submit} saving={saving} />
    </ModalShell>
  );
}
