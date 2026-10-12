import { useState } from 'react';
import { toast } from 'sonner';
import { Button, ConfirmDialog, EmptyState, PageHeader, Spinner, formatDate } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDeleteTemplate, useOccasions, useTemplates } from '../../lib/queries';
import type { Template } from '../../lib/types';

export function TemplatesPage() {
  const auth = useAuth();
  const templates = useTemplates();
  const occasions = useOccasions();
  const del = useDeleteTemplate();
  const [deleting, setDeleting] = useState<Template | null>(null);
  const occasionName = (id: string | null) => (id ? (occasions.data?.find((o) => o.id === id)?.name ?? '—') : 'Any occasion');

  return (
    <>
      <PageHeader
        title="Templates"
        description="Every occasion has a built-in template. Save any page as a custom template (Page editor → “Save as template”) to reuse its layout."
      />
      <div className="card">
        {templates.isLoading ? (
          <Spinner />
        ) : !templates.data?.length ? (
          <EmptyState title="No custom templates yet">Open a page you like and click “Save as template”.</EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Available for</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templates.data.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                    <div className="muted small">{t.description}</div>
                  </td>
                  <td>{occasionName(t.occasionId)}</td>
                  <td>{formatDate(t.createdAt)}</td>
                  <td className="actions">
                    {auth.can('templates.write') && (
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(t)}>
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete template?"
        danger
        confirmLabel="Delete"
        loading={del.isPending}
        message={<p>Pages already created from “{deleting?.name}” are not affected.</p>}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Template deleted');
              setDeleting(null);
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </>
  );
}
