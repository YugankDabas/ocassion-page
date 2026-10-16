import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Badge, Button, ConfirmDialog, EmptyState, PageHeader, Select, Spinner, formatDate } from '../../components/ui';
import { API_BASE, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { IS_LOCAL } from '../../lib/environment';
import { useConfig, useDeletePage, useOccasions, usePages } from '../../lib/queries';
import type { PageListItem } from '../../lib/types';
import { websiteUrl } from '../../lib/website';
import { CreatePageModal } from './CreatePageModal';

const STATUS_OPTIONS = [
  { value: '', label: 'All (except archived)' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const;

export function PagesListPage() {
  const siteBase = useConfig().data?.brandPageBaseUrl;
  const auth = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]['value']>('');
  const [occasionId, setOccasionId] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PageListItem | null>(null);
  const pages = usePages({ status: status || undefined, occasionId: occasionId || undefined, search: search || undefined });
  const occasions = useOccasions();
  const del = useDeletePage();


  return (
    <>
      <PageHeader
        title="Occasion pages"
        description="Create a page for any occasion, design it with drag-and-drop sections and publish it."
        actions={
          auth.can('pages.write') && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              + New page
            </Button>
          )
        }
      />
      <div className="toolbar">
        <div className="field">
          <label className="field-label" htmlFor="page-search">
            Search
          </label>
          <input id="page-search" className="input" placeholder="Title or URL…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <Select
          label="Occasion"
          value={occasionId}
          onChange={setOccasionId}
          options={[{ value: '', label: 'All occasions' }, ...(occasions.data ?? []).map((o) => ({ value: o.id, label: o.name }))]}
        />
      </div>
      <div className="card">
        {pages.isLoading ? (
          <Spinner />
        ) : !pages.data?.length ? (
          <EmptyState
            title="No pages yet"
            action={
              auth.can('pages.write') && (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Create your first page
                </Button>
              )
            }
          >
            Pick an occasion (e.g. Diwali) and a ready-made template appears — then add banners, brands, FAQs and T&Cs.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Occasion</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pages.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/pages/${p.id}`}>
                        <strong>{p.title}</strong>
                      </Link>
                      <div className="muted small">{p.pageUrl}</div>
                    </td>
                    <td>{p.occasion.name}</td>
                    <td>
                      <div className="row wrap">
                        <Badge tone={p.status === 'PUBLISHED' ? 'success' : p.status === 'ARCHIVED' ? 'danger' : 'neutral'}>{p.status.toLowerCase()}</Badge>
                        {p.status === 'PUBLISHED' && p.publishedVersion !== p.draftVersion && <Badge tone="warning">unpublished changes</Badge>}
                      </div>
                    </td>
                    <td>
                      {formatDate(p.updatedAt)}
                      <div className="muted small">{p.updatedBy?.name ?? ''}</div>
                    </td>
                    <td className="actions">
                      {p.status === 'PUBLISHED' && (
                        <a
                          className="btn btn-ghost btn-sm"
                          // On this machine nothing reaches the website: the stored HTML is opened instead.
                          href={IS_LOCAL ? `${API_BASE}/pages/${p.id}/published-view` : websiteUrl(p.liveUrl ?? p.pageUrl, siteBase)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={IS_LOCAL ? 'Open the published HTML' : 'Open the page on the website'}
                        >
                          View ↗
                        </a>
                      )}
                      <Button size="sm" onClick={() => navigate(`/pages/${p.id}`)}>
                        Edit
                      </Button>
                      {auth.can('pages.delete') && p.status !== 'PUBLISHED' && (
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(p)}>
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <CreatePageModal open={creating} onClose={() => setCreating(false)} onCreated={(p) => navigate(`/pages/${p.id}`)} />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete page permanently?"
        danger
        confirmLabel="Delete"
        loading={del.isPending}
        message={<p>“{deleting?.title}” and its entire version history will be deleted. This cannot be undone. Consider archiving instead.</p>}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Page deleted');
              setDeleting(null);
            },
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      />
    </>
  );
}
