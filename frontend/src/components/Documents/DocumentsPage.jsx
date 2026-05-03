import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Trash2, AlertCircle, FileText, Search, ExternalLink } from 'lucide-react';
import {
  finoListDocuments, finoUploadDocument, finoDeleteDocument, finoSearchDocuments,
} from '../../services/api';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import RowMenu from '../shared/RowMenu';

const fmtBytes = (n) => {
  if (!n) return '—';
  const u = ['B','KB','MB','GB'];
  let i = 0; let v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
};

const ENTITY_TYPES = [
  'sale_invoice', 'purchase_invoice', 'party', 'item', 'bank_account',
  'loan', 'credit_card', 'gift_card', 'amazon_order', 'amazon_shipment',
  'website', 'partnership', 'salary_record', 'tds_record', 'gst_record',
  'sale_return', 'recurring_expense', 'petty_cash', 'general',
];

export default function DocumentsPage() {
  const [docs, setDocs] = useState([]);
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [modal, setModal] = useState(null);

  const reload = useCallback(async () => {
    try {
      let r;
      if (query.trim()) r = await finoSearchDocuments({ q: query });
      else if (filterType) r = await finoListDocuments({ entity_type: filterType });
      else r = await finoListDocuments();
      setDocs(r.data.documents || []);
    } catch (e) { console.error(e); }
  }, [query, filterType]);
  useEffect(() => { reload(); }, [reload]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Documents</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'upload' })}><Plus size={13} /> Add Document</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search by file name, notes, entity…" style={{ paddingLeft: 30 }} />
        </div>
        <select className="input" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 200 }}>
          <option value="">— All entity types —</option>
          {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible' }}>
        {docs.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No documents{query || filterType ? ' match your filter' : ' yet'}.
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>File</th>
                <th style={{ padding: '8px 10px' }}>Entity</th>
                <th style={{ padding: '8px 10px' }}>Tags</th>
                <th style={{ padding: '8px 10px' }}>Size</th>
                <th style={{ padding: '8px 10px' }}>Uploaded</th>
                <th style={{ padding: '8px 10px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                    <FileText size={11} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--text-muted)' }} />
                    <a href={d.file_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                      {d.file_name} <ExternalLink size={10} style={{ verticalAlign: 'middle', opacity: 0.6 }} />
                    </a>
                    {d.notes && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{d.notes}</div>}
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{d.entity_type}{d.entity_id ? ` · ${String(d.entity_id).slice(0, 8)}…` : ''}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {Array.isArray(d.tags) && d.tags.length > 0
                      ? d.tags.map(t => <span key={t} style={{ display: 'inline-block', background: 'var(--bg-page)', borderRadius: 10, padding: '1px 8px', fontSize: 10, marginRight: 4 }}>{t}</span>)
                      : '—'}
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{fmtBytes(d.file_size)}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{d.created_at?.slice(0, 10)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <RowMenu items={[
                      { label: 'Open', icon: <ExternalLink size={12} />, onClick: () => window.open(d.file_url, '_blank') },
                      { label: 'Delete', icon: <Trash2 size={12} />, danger: true,
                        onClick: () => setModal({ kind: 'delete', row: d }) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal?.kind === 'upload' && <UploadModal onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'delete' && (
        <DeleteConfirmModal title={`Delete ${modal.row.file_name}`}
          description="Removes the link from the archive (file at the URL is not touched)."
          onClose={() => setModal(null)}
          onConfirm={async () => { await finoDeleteDocument(modal.row.id); reload(); }} />
      )}
    </div>
  );
}

function UploadModal({ onClose, onSaved, entityType: defaultEntityType, entityId: defaultEntityId }) {
  const [f, setF] = useState({
    entityType: defaultEntityType || 'general',
    entityId: defaultEntityId || '',
    fileName: '',
    fileUrl: '',
    fileSize: '',
    tags: '',
    notes: '',
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (!f.fileName.trim()) throw new Error('File name required');
      if (!f.fileUrl.trim())  throw new Error('File URL required');
      const tags = f.tags.split(',').map(t => t.trim()).filter(Boolean);
      await finoUploadDocument({
        entityType: f.entityType,
        entityId:   f.entityId || null,
        fileName:   f.fileName,
        fileUrl:    f.fileUrl,
        fileSize:   f.fileSize ? Number(f.fileSize) : null,
        tags:       tags.length ? tags : null,
        notes:      f.notes,
      });
      onSaved();
    } catch (e) { setErr(e?.response?.data?.error || e.message); setSaving(false); }
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Add Document</h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Entity Type</div>
          <select className="input" value={f.entityType} onChange={e => set('entityType', e.target.value)}>
            {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <Field label="Entity ID (optional)"><input className="input" value={f.entityId} onChange={e => set('entityId', e.target.value)} placeholder="UUID of invoice/party/loan…" /></Field>
        <Field label="File Name"><input className="input" value={f.fileName} onChange={e => set('fileName', e.target.value)} placeholder="invoice-INV-0042.pdf" /></Field>
        <Field label="File URL" hint="Drive / Dropbox / S3 public link, or local path">
          <input className="input" value={f.fileUrl} onChange={e => set('fileUrl', e.target.value)} placeholder="https://drive.google.com/…" />
        </Field>
        <div style={{ display: 'flex', gap: 8 }}>
          <Field label="Size (bytes, optional)"><input className="input" type="number" value={f.fileSize} onChange={e => set('fileSize', e.target.value)} /></Field>
          <Field label="Tags (comma-separated)"><input className="input" value={f.tags} onChange={e => set('tags', e.target.value)} placeholder="pdf, receipt, 2026" /></Field>
        </div>
        <Field label="Notes"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
        {err && <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: 6, fontSize: 12, marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}><AlertCircle size={14} /> {err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 10, flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
