import React, { useEffect, useState, useCallback } from 'react';
import { Plus, TrendingUp, TrendingDown, Package, X, Pencil, Trash2 } from 'lucide-react';
import {
  finoListAssets, finoCreateAsset, finoAssetHistory,
  finoDepreciate, finoAppreciate,
  finoUpdateAsset, finoDeleteAsset, finoDeleteAssetAdj,
} from '../../services/api';
import EditModal from '../shared/EditModal';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

export default function FixedAssetsPage() {
  const [assets, setAssets] = useState([]);
  const [selId, setSelId]   = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(null);

  const loadAssets = useCallback(() => {
    setLoading(true);
    finoListAssets().then(({ data }) => {
      setAssets(data.assets || []);
      if (!selId && data.assets?.length) setSelId(data.assets[0].id);
    }).finally(() => setLoading(false));
  }, [selId]);

  const loadHistory = useCallback((id) => {
    if (!id) return setHistory(null);
    finoAssetHistory(id).then(({ data }) => setHistory(data));
  }, []);

  useEffect(() => { loadAssets(); }, []);
  useEffect(() => { loadHistory(selId); }, [selId, loadHistory]);

  const onSaved = () => { setModal(null); loadAssets(); loadHistory(selId); };
  const totalValue = assets.reduce((s, a) => s + Number(a.current_value || 0), 0);

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 140px)' }}>
      {/* LEFT */}
      <aside style={{
        width: 340, background: 'var(--bg-surface)', borderRadius: 12,
        border: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Fixed Assets</h2>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{assets.length} assets · {fmt(totalValue)} total</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setModal('add')}><Plus size={13} /> Add Asset</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? <div className="spinner" style={{ margin: '40px auto' }} /> : assets.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No fixed assets yet.</div>
          ) : assets.map(a => {
            const active = selId === a.id;
            return (
              <button key={a.id} onClick={() => setSelId(a.id)} style={{
                width: '100%', padding: '12px 14px', border: 'none', cursor: 'pointer',
                background: active ? 'var(--bg-hover)' : 'transparent',
                borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Package size={16} color="var(--accent)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.asset_name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.category || '—'}{a.purchase_date ? ` · ${a.purchase_date}` : ''}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{fmt(a.current_value)}</div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* RIGHT */}
      <section style={{
        flex: 1, background: 'var(--bg-surface)', borderRadius: 12,
        border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minWidth: 0,
      }}>
        {!history ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            {assets.length === 0 ? 'Add an asset to begin.' : 'Select an asset on the left.'}
          </div>
        ) : (
          <>
            <div style={{ padding: 18, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{history.asset.asset_name}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {history.asset.category || '—'} · qty {history.asset.quantity}
                  {history.asset.depreciation_method ? ` · ${history.asset.depreciation_method}` : ''}
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 22 }}>
                  <Stat label="Purchase" value={fmt(history.asset.purchase_price)} />
                  <Stat label="Current Value" value={fmt(history.asset.current_value)} highlight />
                  <Stat label="Status" value={history.asset.status} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--info)' }} onClick={() => setModal('appreciate')}>
                  <TrendingUp size={13} /> Appreciate
                </button>
                <button className="btn btn-sm" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--warning)' }} onClick={() => setModal('depreciate')}>
                  <TrendingDown size={13} /> Depreciate
                </button>
                <button className="btn btn-ghost btn-sm" title="Edit asset" onClick={() => setModal('editAsset')}>
                  <Pencil size={13} />
                </button>
                <button className="btn btn-ghost btn-sm" title="Delete asset" onClick={() => setModal('deleteAsset')} style={{ color: 'var(--danger)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 13 }}>Adjustments History</h3>
              {history.adjustments.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No adjustments yet.</div>
              ) : (
                <table style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                      <th style={{ padding: '6px 8px' }}>Date</th>
                      <th style={{ padding: '6px 8px' }}>Type</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '6px 8px' }}>Reason</th>
                      <th style={{ padding: '6px 8px', width: 30 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.adjustments.filter(a => !a.is_deleted).map(a => (
                      <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 8 }}>{a.adjustment_date}</td>
                        <td style={{ padding: 8 }}>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                            background: a.type === 'depreciation' ? 'rgba(245,158,11,0.10)' : 'rgba(59,130,246,0.10)',
                            color:      a.type === 'depreciation' ? 'var(--warning)' : 'var(--info)',
                          }}>{a.type}</span>
                        </td>
                        <td style={{ padding: 8, textAlign: 'right', fontWeight: 600,
                          color: a.type === 'depreciation' ? 'var(--danger)' : 'var(--success)' }}>
                          {a.type === 'depreciation' ? '−' : '+'}{fmt(a.amount)}
                        </td>
                        <td style={{ padding: 8, color: 'var(--text-secondary)' }}>{a.reason || '—'}</td>
                        <td style={{ padding: 8, textAlign: 'right' }}>
                          <RowMenu items={[
                            { label: 'Delete (reverse)', icon: <Trash2 size={12} />, danger: true,
                              onClick: () => setModal({ kind: 'deleteAdj', adj: a }) },
                          ]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </section>

      {modal === 'add'         && <AddAssetModal onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'depreciate'  && <AdjModal kind="depreciate" assetId={selId} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'appreciate'  && <AdjModal kind="appreciate" assetId={selId} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === 'editAsset' && history && (
        <EditModal title={`Edit ${history.asset.asset_name}`}
          fields={[
            { key: 'assetName',       label: 'Asset Name' },
            { key: 'category',        label: 'Category' },
            { key: 'usefulLifeYears', label: 'Useful Life (years)', type: 'number' },
            { key: 'notes',           label: 'Notes', type: 'textarea' },
          ]}
          initialValues={{
            assetName: history.asset.asset_name, category: history.asset.category || '',
            usefulLifeYears: history.asset.useful_life_years || '',
            notes: history.asset.notes || '',
          }}
          onClose={() => setModal(null)}
          onSubmit={(patch) => finoUpdateAsset(history.asset.id, patch).then(onSaved)}
        />
      )}
      {modal === 'deleteAsset' && history && (
        <DeleteConfirmModal title={`Delete ${history.asset.asset_name}`}
          description="Reverses the original purchase ledger entry plus every depreciation/appreciation. The asset row stays for audit but is hidden from lists."
          confirmLabel="Delete & Reverse"
          onClose={() => setModal(null)}
          onConfirm={(reason) => finoDeleteAsset(history.asset.id, reason).then(() => { setSelId(null); onSaved(); })}
        />
      )}
      {modal?.kind === 'deleteAdj' && (
        <DeleteConfirmModal title="Reverse Adjustment"
          description={`Reverses ${modal.adj.type} of ${fmt(modal.adj.amount)}. Asset's current value will be restored.`}
          confirmLabel="Reverse"
          onClose={() => setModal(null)}
          onConfirm={(reason) => finoDeleteAssetAdj(modal.adj.id, reason).then(onSaved)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: highlight ? 800 : 600, color: highlight ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 460, maxHeight: '90vh', overflow: 'auto' }}>
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

function AddAssetModal({ onClose, onSaved }) {
  const [f, setF] = useState({
    assetName: '', category: '', purchaseDate: today(), purchasePrice: '',
    quantity: 1, paymentStatus: 'unpaid', depreciationMethod: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null);
    if (!f.assetName.trim()) return setErr('Asset name required');
    setSaving(true);
    try {
      await finoCreateAsset({ ...f, purchasePrice: Number(f.purchasePrice) || 0, quantity: Number(f.quantity) || 1 });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title="Add Fixed Asset" onClose={onClose}>
      <Field label="Asset Name *"><input className="input" autoFocus value={f.assetName} onChange={e => set('assetName', e.target.value)} placeholder="1 Main Sitting Wooden Table" /></Field>
      <Field label="Category"><input className="input" value={f.category} onChange={e => set('category', e.target.value)} placeholder="Furniture / Computer / Vehicle" /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Purchase Date"><input className="input" type="date" value={f.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} /></Field>
        <Field label="Purchase Price (₹)"><input className="input" type="number" step="0.01" value={f.purchasePrice} onChange={e => set('purchasePrice', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Quantity"><input className="input" type="number" min="1" value={f.quantity} onChange={e => set('quantity', e.target.value)} /></Field>
        <Field label="Payment Status">
          <select className="input" value={f.paymentStatus} onChange={e => set('paymentStatus', e.target.value)}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
          </select>
        </Field>
      </div>
      <Field label="Depreciation Method">
        <select className="input" value={f.depreciationMethod} onChange={e => set('depreciationMethod', e.target.value)}>
          <option value="">—</option>
          <option value="straight_line">Straight Line</option>
          <option value="wdv">Written Down Value</option>
          <option value="manual">Manual</option>
        </select>
      </Field>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Add Asset'}</button>
      </div>
    </ModalShell>
  );
}

function AdjModal({ kind, assetId, onClose, onSaved }) {
  const isDep = kind === 'depreciate';
  const [f, setF] = useState({ amount: '', date: today(), reason: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null);
    const amt = Number(f.amount);
    if (!(amt > 0)) return setErr('Amount must be > 0');
    setSaving(true);
    try {
      const fn = isDep ? finoDepreciate : finoAppreciate;
      await fn(assetId, { amount: amt, date: f.date, reason: f.reason });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <ModalShell title={isDep ? 'Depreciate Asset' : 'Appreciate Asset'} onClose={onClose}>
      <Field label="Amount (₹) *"><input className="input" type="number" step="0.01" autoFocus value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
      <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
      <Field label="Reason"><input className="input" value={f.reason} onChange={e => set('reason', e.target.value)} placeholder={isDep ? 'Wear and tear / yearly write-down' : 'Market revaluation / improvements'} /></Field>
      {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>{saving ? 'Saving…' : (isDep ? 'Depreciate' : 'Appreciate')}</button>
      </div>
    </ModalShell>
  );
}
