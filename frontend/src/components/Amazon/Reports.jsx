import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { amzGetReports } from '../../services/api';

const fmtNum = (n) => new Intl.NumberFormat('en-US').format(n || 0);

export default function AmazonReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    amzGetReports()
      .then(({ data }) => setReports(data.reports || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>Upload History</h2>
      {loading ? <div className="spinner" style={{ margin: '40px auto' }} /> : reports.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20, background: 'var(--bg-page)', borderRadius: 8 }}>
          No uploads yet.
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>File</th>
                <th>Rows</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Locked</th>
                <th>New Txns</th>
                <th>Duplicate</th>
                <th>Unmapped</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id}>
                  <td style={{ fontSize: 11 }}>{format(new Date(r.created_at), 'MMM dd, HH:mm')}</td>
                  <td style={{ fontSize: 11, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.file_name}</td>
                  <td>{fmtNum(r.total_rows)}</td>
                  <td style={{ color: 'var(--success)' }}>{fmtNum(r.orders_created)}</td>
                  <td style={{ color: 'var(--info)' }}>{fmtNum(r.orders_updated)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{fmtNum(r.orders_locked)}</td>
                  <td style={{ color: 'var(--success)', fontWeight: 600 }}>{fmtNum(r.transactions_created)}</td>
                  <td style={{ color: 'var(--warning)' }}>{fmtNum(r.transactions_duplicate)}</td>
                  <td>
                    {r.unmapped_last4?.length > 0 ? (
                      <span title={r.unmapped_last4.map(u => `${u.last4} (${u.count})`).join(', ')} style={{ color: 'var(--warning)', fontSize: 11 }}>
                        {r.unmapped_last4.length} card(s)
                      </span>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
