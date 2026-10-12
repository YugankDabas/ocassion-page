import { useState } from 'react';
import { toast } from 'sonner';
import { occasionInputSchema, themeSchema, type OccasionInput } from '../../contracts';
import { Badge, Button, EmptyState, Modal, NumberInput, PageHeader, Spinner, TextInput, Toggle } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useConfig, useOccasions, useSaveOccasion } from '../../lib/queries';
import type { Occasion } from '../../lib/types';
import { ThemeEditor, ThemeSwatches } from '../editor/ThemeEditor';

export function OccasionsPage() {
  const auth = useAuth();
  const occasions = useOccasions();
  const [editing, setEditing] = useState<Occasion | 'new' | null>(null);
  const canWrite = auth.can('settings.write');

  return (
    <>
      <PageHeader
        title="Occasions"
        description="Each occasion has a default gyftr.com URL, theme and copy used when creating a new page from its template."
        actions={canWrite && <Button variant="primary" onClick={() => setEditing('new')}>+ Add occasion</Button>}
      />
      <div className="card">
        {occasions.isLoading ? (
          <Spinner />
        ) : !occasions.data?.length ? (
          <EmptyState title="No occasions" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Occasion</th>
                  <th>Default page URL</th>
                  <th>Theme</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {occasions.data.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <span aria-hidden>{o.emoji}</span> <strong>{o.name}</strong>
                    </td>
                    <td className="small">{o.pageUrl}</td>
                    <td>
                      <ThemeSwatches theme={o.theme} />
                    </td>
                    <td>{o.isActive ? <Badge tone="success">active</Badge> : <Badge>hidden</Badge>}</td>
                    <td className="actions">
                      {canWrite && (
                        <Button size="sm" onClick={() => setEditing(o)}>
                          Edit
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
      {editing && <OccasionModal occasion={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function OccasionModal({ occasion, onClose }: { occasion: Occasion | null; onClose: () => void }) {
  const save = useSaveOccasion();
  const config = useConfig();
  const base = config.data?.publicBaseUrl ?? '';
  const [form, setForm] = useState<OccasionInput>(() =>
    occasion
      ? {
          slug: occasion.slug,
          name: occasion.name,
          shortName: occasion.shortName,
          recipients: occasion.recipients,
          emoji: occasion.emoji,
          pageUrl: occasion.pageUrl,
          sortOrder: occasion.sortOrder,
          isActive: occasion.isActive,
          theme: themeSchema.parse(occasion.theme),
        }
      : { slug: '', name: '', shortName: '', recipients: 'friends and family', emoji: '🎁', pageUrl: `${base}/`, sortOrder: 100, isActive: true, theme: themeSchema.parse({}) },
  );
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const set = <K extends keyof OccasionInput>(k: K, v: OccasionInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const parsed = occasionInputSchema.safeParse(form);
    if (!parsed.success) return setErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    try {
      await save.mutateAsync({ id: occasion?.id, input: parsed.data });
      toast.success('Occasion saved');
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={occasion ? `Edit ${occasion.name}` : 'Add occasion'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="grid-3">
          <TextInput label="Name" value={form.name} maxLength={120} onChange={(v) => set('name', v)} error={errors.name} placeholder="Diwali Gift Cards" />
          <TextInput label="Short name (used in copy)" value={form.shortName} maxLength={60} onChange={(v) => set('shortName', v)} error={errors.shortName} placeholder="Diwali" />
          <TextInput label="Emoji" value={form.emoji} maxLength={8} onChange={(v) => set('emoji', v)} />
        </div>
        <div className="grid-2">
          <TextInput
            label="Key (slug)"
            value={form.slug}
            maxLength={120}
            onChange={(v) => set('slug', v.toLowerCase())}
            error={errors.slug}
            hint="Internal identifier, e.g. diwali-gift-cards"
          />
          <TextInput label="Typical recipients" value={form.recipients} maxLength={120} onChange={(v) => set('recipients', v)} hint="“…show {recipients} how much they mean…”" />
        </div>
        <TextInput
          label="Default page URL"
          value={form.pageUrl}
          onChange={(v) => set('pageUrl', v.trim())}
          error={errors.pageUrl}
          hint="The existing gyftr.com URL for this occasion. New pages for this occasion start with this URL."
        />
        <div className="grid-2">
          <NumberInput label="Sort order" value={form.sortOrder} min={0} onChange={(v) => set('sortOrder', v ?? 0)} />
          <Toggle label="Active (offered when creating pages)" checked={form.isActive} onChange={(v) => set('isActive', v)} />
        </div>
        <fieldset className="group">
          <legend>Default theme</legend>
          <ThemeEditor value={form.theme} onChange={(t) => set('theme', t)} />
        </fieldset>
      </div>
    </Modal>
  );
}
