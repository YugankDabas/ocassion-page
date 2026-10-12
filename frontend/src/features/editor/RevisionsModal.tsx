import { useRevisions } from '../../lib/queries';
import { Badge, Button, EmptyState, Modal, Spinner, formatDate } from '../../components/ui';

export function RevisionsModal({
  open,
  pageId,
  onClose,
  onRestore,
  restoring,
}: {
  open: boolean;
  pageId: string;
  onClose: () => void;
  onRestore: (revisionId: string, version: number) => void;
  restoring: boolean;
}) {
  const revisions = useRevisions(pageId, open);
  return (
    <Modal open={open} onClose={onClose} title="Version history" size="lg">
      <p className="muted" style={{ marginTop: 0 }}>
        Restoring copies an old version into the draft. Review it, then publish to make it live. The last 50 saves and every published
        version are kept.
      </p>
      {revisions.isLoading ? (
        <Spinner />
      ) : !revisions.data?.length ? (
        <EmptyState title="No history yet" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Type</th>
                <th>When</th>
                <th>By</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {revisions.data.map((r) => (
                <tr key={r.id}>
                  <td>v{r.version}</td>
                  <td>
                    <Badge tone={r.kind === 'PUBLISH' ? 'success' : r.kind === 'RESTORE' ? 'info' : 'neutral'}>{r.kind.toLowerCase()}</Badge>
                  </td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>{r.createdBy?.name ?? '—'}</td>
                  <td className="muted">{r.note || '—'}</td>
                  <td className="actions">
                    <Button size="sm" loading={restoring} onClick={() => onRestore(r.id, r.version)}>
                      Restore
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
