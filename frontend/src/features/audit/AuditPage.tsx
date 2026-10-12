import { useState } from 'react';
import { PageHeader, Pagination, Spinner, formatDate } from '../../components/ui';
import { useAudit } from '../../lib/queries';

export function AuditPage() {
  const [page, setPage] = useState(1);
  const audit = useAudit({ page });
  return (
    <>
      <PageHeader title="Audit log" description="Every sign-in, edit, publish and settings change." />
      <div className="card">
        {audit.isLoading ? (
          <Spinner />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Details</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.data?.items.map((a) => (
                    <tr key={a.id}>
                      <td>{formatDate(a.createdAt)}</td>
                      <td>{a.actor?.name ?? '—'}</td>
                      <td className="mono">{a.action}</td>
                      <td className="mono">
                        {a.entityType}
                        {a.entityId ? `:${a.entityId.slice(0, 8)}` : ''}
                      </td>
                      <td className="mono small">{a.metadata ? JSON.stringify(a.metadata).slice(0, 120) : ''}</td>
                      <td className="mono small">{a.ip ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {audit.data && <Pagination page={page} pageSize={50} total={audit.data.total} onChange={setPage} />}
          </>
        )}
      </div>
    </>
  );
}
