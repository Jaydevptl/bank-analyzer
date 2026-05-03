import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, X, Search, Package, Pencil, Trash2 } from 'lucide-react';
import {
  finoListItems, finoCreateItem, finoUpdateItem, finoDeleteItem,
  finoItemCategories,
} from '../../services/api';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';

const fmt   = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtN  = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const COMMON_UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'metre', 'cm', 'box', 'pack', 'hour', 'day', 'service'];

const TABS = [
  { id: 'products',   label: 'Products' },
  { id: 'services',   label: 'Services' },
  { id: 'categories', label: 'Categories' },
  { id: 'units',      label: 'Units' },
];

export default function ItemsPage() {
  const [tab, setTab]         = useState('products');
  const [filter, setFilter]   = useState('all'); // all|active|out|low
  const [search, setSearch]   = useState('');
  const [items, setItems]     = useState([]);
  const [categories, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = { search: search || undefined };
      if (tab === 'products') params.type = 'product';
      else if (tab === 'services') params.type = 'service';
      const { data } = await finoListItems(params);
      setItems(data.items || []);
      const c = await finoItemCategories();
      setCats(c.data.categories || []);
    } finally { setLoading(false); }
  }, [tab, search]);

  useEffect(() => { reload(); }, [tab]);
  useEffect(() => { const t = setTimeout(() => reload(), 250); return () => clearTimeout(t); }, [search]);

  const onSaved = () => { setModal(null); reload(); };

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'out') return items.filter(i => Number(i.current_stock_qty) <= 0);
    if (filter === 'low') return items.filter(i => Number(i.current_stock_qty) > 0 && Number(i.current_stock_qty) <= 5);
    return items.filter(i => i.status === 'active');
  }, [items, filter]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Items</h1>
        {(tab === 'products' || tab === 'services') && (
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'new', type: tab === 'services' ? 'service' : 'product' })}>
            <Plus size={13} /> Add Item
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', border: 'none', cursor: 'pointer',
            background: tab === t.id ? 'var(--bg-page)' : 'transparent',
            borderRadius: '6px 6px 0 0',
            fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      {(tab === 'products' || tab === 'services') && (
        <>
          {tab === 'products' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {[
                { id: 'all', label: 'All' },
                { id: 'active', label: 'Active' },
                { id: 'low', label: 'Low Stock (≤5)' },
                { id: 'out', label: 'Out of Stock' },
              ].map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)} style={{
                  padding: '5px 10px', border: 'none', cursor: 'pointer',
                  borderRadius: 14, fontSize: 11, fontWeight: filter === f.id ? 700 : 500,
                  background: filter === f.id ? 'var(--accent)' : 'var(--bg-surface)',
                  color: filter === f.id ? '#1A1A2E' : 'var(--text-secondary)',
                }}>{f.label}</button>
              ))}
            </div>
          )}

          <div style={{ position: 'relative', marginBottom: 12, maxWidth: 360 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" placeholder="Search by name, SKU, HSN, barcode..."
              value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
          </div>

          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {loading ? <div className="spinner" style={{ margin: '40px auto' }} /> : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No items.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 12px' }}>Item</th>
                      <th style={{ padding: '10px 12px' }}>Category</th>
                      <th style={{ padding: '10px 12px' }}>SKU</th>
                      {tab === 'products' && <th style={{ padding: '10px 12px', textAlign: 'right' }}>Stock</th>}
                      {tab === 'products' && <th style={{ padding: '10px 12px', textAlign: 'right' }}>Stock Value</th>}
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Sale ₹</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Purch ₹</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>GST</th>
                      <th style={{ padding: '10px 12px', width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(i => (
                      <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 600 }}>{i.name}</div>
                          {i.unit && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>per {i.unit}{i.hsn_sac_code ? ` · HSN ${i.hsn_sac_code}` : ''}</div>}
                        </td>
                        <td style={{ padding: 10 }}>{i.category || '—'}</td>
                        <td style={{ padding: 10, fontFamily: 'monospace', fontSize: 11 }}>{i.sku || '—'}</td>
                        {tab === 'products' && (
                          <td style={{ padding: 10, textAlign: 'right', fontWeight: 600,
                            color: Number(i.current_stock_qty) <= 0 ? 'var(--danger)' :
                                   Number(i.current_stock_qty) <= 5 ? 'var(--warning)' : 'var(--text-primary)' }}>
                            {fmtN(i.current_stock_qty)}
                          </td>
                        )}
                        {tab === 'products' && (
                          <td style={{ padding: 10, textAlign: 'right' }}>{fmt(i.current_stock_value)}</td>
                        )}
                        <td style={{ padding: 10, textAlign: 'right' }}>{i.default_sale_price != null ? fmt(i.default_sale_price) : '—'}</td>
                        <td style={{ padding: 10, textAlign: 'right' }}>{i.default_purchase_price != null ? fmt(i.default_purchase_price) : '—'}</td>
                        <td style={{ padding: 10, textAlign: 'right' }}>{i.gst_rate != null ? `${i.gst_rate}%` : '—'}</td>
                        <td style={{ padding: 10, textAlign: 'right' }}>
                          <button className="btn btn-ghost btn-xs" title="Edit" onClick={() => setModal({ kind: 'edit', item: i })}><Pencil size={12} /></button>
                          <button className="btn btn-ghost btn-xs" title="Delete" onClick={() => setModal({ kind: 'delete', item: i })} style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'categories' && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {categories.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No categories yet.</div>
          ) : (
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 12px' }}>Category</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Items</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Products</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Services</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Stock Value</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.category} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 10, fontWeight: 600 }}>{c.category}</td>
                    <td style={{ padding: 10, textAlign: 'right' }}>{c.item_count}</td>
                    <td style={{ padding: 10, textAlign: 'right' }}>{c.products}</td>
                    <td style={{ padding: 10, textAlign: 'right' }}>{c.services}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontWeight: 600 }}>{fmt(c.total_stock_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'units' && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>Common units used across items. (Editable units list comes in a later phase.)</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COMMON_UNITS.map(u => (
              <span key={u} style={{ padding: '4px 12px', background: 'var(--bg-page)', borderRadius: 14, fontSize: 12 }}>{u}</span>
            ))}
          </div>
        </div>
      )}

      {modal?.kind === 'new'    && <ItemModal type={modal.type}        onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'edit'   && <ItemModal item={modal.item}        onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'delete' && (
        <DeleteConfirmModal title={`Delete ${modal.item.name}`}
          description={`Soft-delete + reverse opening stock (if any). Blocked if current stock ≠ 0.`}
          confirmLabel="Delete"
          onClose={() => setModal(null)}
          onConfirm={(reason) => finoDeleteItem(modal.item.id, reason).then(onSaved)}
        />
      )}
    </div>
  );
}

function ItemModal({ item, type, onClose, onSaved }) {
  const isEdit = !!item;
  const isProduct = (item?.type || type) === 'product';
  const hasMovement = isEdit && (Number(item.current_stock_qty || 0) !== Number(item.opening_stock_qty || 0));

  const [f, setF] = useState({
    type: item?.type || type || 'product',
    name: item?.name || '',
    category: item?.category || '',
    unit: item?.unit || (isProduct ? 'pcs' : 'service'),
    hsnSacCode: item?.hsn_sac_code || '',
    sku: item?.sku || '',
    barcode: item?.barcode || '',
    defaultSalePrice: item?.default_sale_price ?? '',
    defaultPurchasePrice: item?.default_purchase_price ?? '',
    gstRate: item?.gst_rate ?? '',
    weightGrams: item?.weight_grams ?? '',
    openingStockQty: item?.opening_stock_qty ?? 0,
    openingStockRate: item?.opening_stock_rate ?? 0,
    openingStockDate: item?.opening_stock_date || today(),
    notes: item?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null);
    if (!f.name.trim()) return setErr('Name required');
    setSaving(true);
    try {
      const payload = {
        ...f,
        defaultSalePrice:     f.defaultSalePrice === '' ? null : Number(f.defaultSalePrice),
        defaultPurchasePrice: f.defaultPurchasePrice === '' ? null : Number(f.defaultPurchasePrice),
        gstRate:              f.gstRate === '' ? null : Number(f.gstRate),
        weightGrams:          f.weightGrams === '' ? null : Number(f.weightGrams),
        openingStockQty:      Number(f.openingStockQty) || 0,
        openingStockRate:     Number(f.openingStockRate) || 0,
      };
      if (isEdit) {
        delete payload.openingStockQty;
        delete payload.openingStockRate;
        delete payload.openingStockDate;
        delete payload.type;
        await finoUpdateItem(item.id, payload);
      } else {
        await finoCreateItem(payload);
      }
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };

  return (
    <Modal title={isEdit ? `Edit ${item.name}` : `Add ${f.type === 'service' ? 'Service' : 'Product'}`} onClose={onClose} width={560}>
      {!isEdit && (
        <Field label="Type">
          <div style={{ display: 'flex', gap: 6 }}>
            {['product', 'service'].map(t => (
              <button key={t} className={`btn btn-sm ${f.type === t ? 'btn-primary' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => set('type', t)}>{t}</button>
            ))}
          </div>
        </Field>
      )}
      <Field label="Name *"><input className="input" autoFocus value={f.name} onChange={e => set('name', e.target.value)} /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Category"><input className="input" value={f.category} onChange={e => set('category', e.target.value)} placeholder="Skincare / Electronics / ..." /></Field>
        <Field label="Unit">
          <select className="input" value={f.unit} onChange={e => set('unit', e.target.value)}>
            {COMMON_UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="SKU"><input className="input" value={f.sku} onChange={e => set('sku', e.target.value)} /></Field>
        <Field label="Barcode"><input className="input" value={f.barcode} onChange={e => set('barcode', e.target.value)} /></Field>
        <Field label="HSN/SAC"><input className="input" value={f.hsnSacCode} onChange={e => set('hsnSacCode', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Sale Price (₹)"><input className="input" type="number" step="0.01" value={f.defaultSalePrice} onChange={e => set('defaultSalePrice', e.target.value)} /></Field>
        <Field label="Purchase Price (₹)"><input className="input" type="number" step="0.01" value={f.defaultPurchasePrice} onChange={e => set('defaultPurchasePrice', e.target.value)} /></Field>
        <Field label="GST %"><input className="input" type="number" step="0.01" value={f.gstRate} onChange={e => set('gstRate', e.target.value)} /></Field>
      </div>
      {f.type === 'product' && (
        <>
          <Field label="Weight (g)"><input className="input" type="number" step="0.01" value={f.weightGrams} onChange={e => set('weightGrams', e.target.value)} placeholder="for landed cost calc" /></Field>
          {!isEdit && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Opening Stock Qty"><input className="input" type="number" step="0.001" value={f.openingStockQty} onChange={e => set('openingStockQty', e.target.value)} /></Field>
              <Field label="Opening Stock Rate (₹)"><input className="input" type="number" step="0.01" value={f.openingStockRate} onChange={e => set('openingStockRate', e.target.value)} /></Field>
              <Field label="As of"><input className="input" type="date" value={f.openingStockDate} onChange={e => set('openingStockDate', e.target.value)} /></Field>
            </div>
          )}
          {isEdit && hasMovement && (
            <div style={{ background: 'rgba(245,158,11,0.10)', padding: 8, borderRadius: 6, fontSize: 11, color: 'var(--warning)', marginBottom: 8 }}>
              Opening stock locked: item already has movements.
            </div>
          )}
        </>
      )}
      <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : (isEdit ? 'Save' : 'Add Item')}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children, width = 480 }) {
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
