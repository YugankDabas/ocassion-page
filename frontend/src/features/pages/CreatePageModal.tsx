import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, Field, Modal, TextInput } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useConfig, useCreatePage, useOccasions, useTemplates } from '../../lib/queries';
import type { Occasion, PageDetail } from '../../lib/types';
import { ThemeSwatches } from '../editor/ThemeEditor';

/**
 * Step 1: choose the occasion → its gyftr.com URL and a themed template are
 * pre-filled. Step 2: confirm title / URL / template.
 */
export function CreatePageModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (p: PageDetail) => void }) {
  const occasions = useOccasions();
  const config = useConfig();
  const create = useCreatePage();
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [filter, setFilter] = useState('');
  const [title, setTitle] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [templateId, setTemplateId] = useState('default');
  const templates = useTemplates(occasion?.id);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!open) {
      setOccasion(null);
      setFilter('');
      setFieldErrors({});
    }
  }, [open]);

  const choose = (o: Occasion) => {
    setOccasion(o);
    setTitle(o.name);
    setPageUrl(o.pageUrl);
    setTemplateId('default');
  };

  const submit = async () => {
    if (!occasion) return;
    setFieldErrors({});
    try {
      const page = await create.mutateAsync({ occasionId: occasion.id, title, pageUrl, templateId });
      toast.success('Page created as a draft');
      onClose();
      onCreated(page);
    } catch (err) {
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    }
  };

  const list = (occasions.data ?? []).filter((o) => o.isActive && o.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={occasion ? `New ${occasion.name} page` : 'Choose an occasion'}
      size="lg"
      footer={
        occasion && (
          <>
            <Button variant="ghost" onClick={() => setOccasion(null)}>
              ← Back
            </Button>
            <Button variant="primary" loading={create.isPending} onClick={() => void submit()} disabled={title.trim().length < 2 || !pageUrl}>
              Create page
            </Button>
          </>
        )
      }
    >
      {!occasion ? (
        <div className="stack">
          <input className="input" autoFocus placeholder="Search occasions…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="palette" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {list.map((o) => (
              <button type="button" key={o.id} onClick={() => choose(o)}>
                <div className="row-between">
                  <span style={{ fontSize: 22 }} aria-hidden>
                    {o.emoji}
                  </span>
                  <ThemeSwatches theme={o.theme} />
                </div>
                <strong>{o.name}</strong>
                <span className="small">{o.pageUrl.replace(/^https?:\/\/[^/]+/, '')}</span>
              </button>
            ))}
          </div>
          {list.length === 0 && <p className="muted">No occasions match. Add new occasions under Configuration → Occasions.</p>}
        </div>
      ) : (
        <div className="stack">
          <TextInput label="Page title" value={title} maxLength={160} onChange={setTitle} error={fieldErrors.title} />
          <TextInput
            label="Page URL"
            value={pageUrl}
            onChange={(v) => setPageUrl(v.trim())}
            error={fieldErrors.pageUrl}
            hint={`The existing gyftr.com URL this page will replace. Must start with ${config.data?.publicBaseUrl ?? ''}/`}
          />
          <Field label="Start from">
            <div className="stack" style={{ gap: 6 }}>
              <TemplateOption id="default" current={templateId} onSelect={setTemplateId} title={`${occasion.name} template (recommended)`}>
                Banner, intro, highlights, top brands, “who are you gifting” tabs, SEO content, FAQs and T&Cs — pre-written for{' '}
                {occasion.shortName} in its theme colours.
              </TemplateOption>
              {templates.data?.map((t) => (
                <TemplateOption key={t.id} id={t.id} current={templateId} onSelect={setTemplateId} title={`${t.name}${t.occasionId ? '' : ' (any occasion)'}`}>
                  {t.description || 'Saved template'}
                </TemplateOption>
              ))}
              <TemplateOption id="blank" current={templateId} onSelect={setTemplateId} title="Blank page">
                Start empty and add sections yourself.
              </TemplateOption>
            </div>
          </Field>
        </div>
      )}
    </Modal>
  );
}

function TemplateOption({
  id,
  current,
  onSelect,
  title,
  children,
}: {
  id: string;
  current: string;
  onSelect: (id: string) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`section-item ${current === id ? 'selected' : ''}`} style={{ alignItems: 'flex-start' }}>
      <input type="radio" name="template" checked={current === id} onChange={() => onSelect(id)} style={{ marginTop: 3 }} />
      <span className="label">
        <strong>{title}</strong>
        <span style={{ whiteSpace: 'normal' }}>{children}</span>
      </span>
    </label>
  );
}
