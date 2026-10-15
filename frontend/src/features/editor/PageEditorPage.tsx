import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { pageContentSchema, type PageContent, type Section, type SectionType } from '../../contracts';
import { Badge, Button, ConfirmDialog, EmptyState, Modal, NumberInput, Spinner, TextArea, TextInput, Toggle } from '../../components/ui';
import { API_BASE, ApiError, api, errorMessage } from '../../lib/api';
import { IS_LOCAL } from '../../lib/environment';
import { useAuth } from '../../lib/auth';
import { newId } from '../../lib/ids';
import { qk, useConfig, usePage, usePageAction } from '../../lib/queries';
import type { PageDetail } from '../../lib/types';
import { PANES, PaneDivider, PaneRail, openPaneCount, paneColumns, usePaneLayout } from './EditorPanes';
import { PageSettingsPanel } from './PageSettingsPanel';
import { PreviewPane } from './PreviewPane';
import { RevisionsModal } from './RevisionsModal';
import { AddSectionModal, SectionList } from './SectionList';
import { createSection, sectionDefinition, sectionHeading, sectionTitle } from './sections/catalog';

interface Doc {
  title: string;
  pageUrl: string;
  content: PageContent;
}

const docOf = (p: PageDetail): Doc => ({ title: p.title, pageUrl: p.pageUrl, content: p.draft });

export function PageEditorPage() {
  const { id = '' } = useParams();
  const page = usePage(id);
  const config = useConfig();
  if (page.isLoading || config.isLoading) return <Spinner />;
  if (page.error || !page.data) return <EmptyState title="Page not found">{errorMessage(page.error)}</EmptyState>;
  return <Editor key={page.data.id} page={page.data} publicBaseUrl={config.data?.publicBaseUrl ?? ''} />;
}

function Editor({ page, publicBaseUrl }: { page: PageDetail; publicBaseUrl: string }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const action = usePageAction();

  const [doc, setDoc] = useState<Doc>(() => docOf(page));
  const [savedDoc, setSavedDoc] = useState<Doc>(() => docOf(page));
  const [version, setVersion] = useState(page.draftVersion);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'sections' | 'settings'>('sections');
  const [selectedId, setSelectedId] = useState<string | null>(page.draft.sections[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const { layout: panes, update: updatePanes, toggle: togglePane } = usePaneLayout();
  const editorBody = useRef<HTMLDivElement>(null);
  const [dialog, setDialog] = useState<null | 'download' | 'publish' | 'unpublish' | 'archive' | 'history' | 'template' | 'delete-section' | 'duplicate'>(null);

  const dirty = useMemo(() => JSON.stringify(doc) !== JSON.stringify(savedDoc), [doc, savedDoc]);
  const sections = doc.content.sections;
  const selected = sections.find((s) => s.id === selectedId) ?? null;

  // Client-side validation using the same contract as the API.
  const validation = useMemo(() => pageContentSchema.safeParse(doc.content), [doc.content]);
  const invalidIds = useMemo(() => {
    const ids = new Set<string>();
    if (!validation.success) {
      for (const issue of validation.error.issues) {
        if (issue.path[0] === 'sections' && typeof issue.path[1] === 'number') {
          const s = sections[issue.path[1]];
          if (s) ids.add(s.id);
        }
      }
    }
    return ids;
  }, [validation, sections]);

  const previewContent = validation.success ? validation.data : null;

  /* ---------- unsaved-changes protection ---------- */
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  /* ---------- mutations ---------- */
  const applyServerPage = useCallback(
    (p: PageDetail) => {
      qc.setQueryData(qk.page(p.id), p);
      void qc.invalidateQueries({ queryKey: ['pages'] });
      setVersion(p.draftVersion);
      setSavedDoc(docOf(p));
      setDoc(docOf(p));
    },
    [qc],
  );

  const save = useCallback(async (): Promise<number | null> => {
    if (!validation.success) {
      toast.error('Fix the highlighted sections before saving.', {
        description: validation.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'),
      });
      return null;
    }
    setSaving(true);
    try {
      const res = await api.put<{ page: PageDetail }>(`/pages/${page.id}/draft`, {
        expectedVersion: version,
        title: doc.title,
        pageUrl: doc.pageUrl,
        content: validation.data,
      });
      applyServerPage(res.page);
      toast.success('Draft saved');
      return res.page.draftVersion;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && (err.details as { reason?: string })?.reason === 'STALE_VERSION') {
        toast.error('Someone else changed this page.', {
          description: 'Copy any unsaved work, then reload to get the latest version.',
          action: { label: 'Reload', onClick: () => window.location.reload() },
          duration: 15000,
        });
      } else toast.error(errorMessage(err));
      return null;
    } finally {
      setSaving(false);
    }
  }, [applyServerPage, doc, page.id, validation, version]);

  // Ctrl/Cmd+S to save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, save, saving]);

  const runAction = async (name: string, body?: unknown, success?: string) => {
    try {
      const p = await action.mutateAsync({ id: page.id, action: name, body });
      applyServerPage(p);
      if (success) toast.success(success);
      setDialog(null);
      return p;
    } catch (err) {
      toast.error(errorMessage(err), { duration: 10000 });
      return null;
    }
  };

  const publish = async (note: string) => {
    let v: number | null = version;
    if (dirty) v = await save();
    if (v === null) return;
    await runAction(
      'publish',
      { expectedVersion: v, note },
      IS_LOCAL ? 'Published on this machine only. Nothing was sent to gyftr.com.' : 'Published. The page HTML is now available to gyftr.com.',
    );
  };

  /** Save any pending edits, then download the saved draft as one self-contained .html file. */
  const [downloading, setDownloading] = useState(false);
  const download = async (includeChrome: boolean) => {
    setDownloading(true);
    try {
      if (dirty && (await save()) === null) return;
      const a = document.createElement('a');
      a.href = `${API_BASE}/pages/${page.id}/download?chrome=${includeChrome ? 1 : 0}`;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setDialog(null);
    } finally {
      setDownloading(false);
    }
  };

  /* ---------- section helpers ---------- */
  const setContent = (content: PageContent) => setDoc((d) => ({ ...d, content }));
  const setSections = (next: Section[]) => setContent({ ...doc.content, sections: next });
  const updateSelected = (patch: Partial<Section>) =>
    selected && setSections(sections.map((s) => (s.id === selected.id ? ({ ...s, ...patch } as Section) : s)));
  const addSection = (type: SectionType) => {
    const s = createSection(type);
    const index = selected ? sections.findIndex((x) => x.id === selected.id) + 1 : sections.length;
    const next = [...sections];
    next.splice(index, 0, s);
    setSections(next);
    setSelectedId(s.id);
    setTab('sections');
  };
  const duplicateSelected = () => {
    if (!selected) return;
    const copy = { ...structuredClone(selected), id: newId('s_'), anchor: '' };
    const next = [...sections];
    next.splice(sections.indexOf(selected) + 1, 0, copy);
    setSections(next);
    setSelectedId(copy.id);
  };

  const status = page.status;
  const canPublish = auth.can('pages.publish');

  return (
    <div className="editor">
      <div className="editor-bar">
        <Link to="/pages" className="btn btn-ghost btn-sm">
          ← Pages
        </Link>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row">
            <span className="title">{doc.title}</span>
            <Badge tone={status === 'PUBLISHED' ? 'success' : status === 'ARCHIVED' ? 'danger' : 'neutral'}>{status.toLowerCase()}</Badge>
            {page.hasUnpublishedChanges && !dirty && <Badge tone="warning">unpublished changes</Badge>}
            {dirty && <Badge tone="info">unsaved</Badge>}
          </div>
          <div className="url" title={doc.pageUrl}>
            {doc.pageUrl} · v{version}
          </div>
        </div>
        <div className="pane-toggles" role="group" aria-label="Panels">
          {PANES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={!panes.collapsed[p.id]}
              title={panes.collapsed[p.id] ? `Show ${p.label.toLowerCase()}` : `Collapse ${p.label.toLowerCase()}`}
              disabled={!panes.collapsed[p.id] && openPaneCount(panes) === 1}
              onClick={() => togglePane(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <MoreMenu
          items={[
            { label: 'Version history', onSelect: () => setDialog('history') },
            ...(auth.can('templates.write') ? [{ label: 'Save as template', onSelect: () => setDialog('template') }] : []),
            { label: 'Duplicate page', onSelect: () => setDialog('duplicate') },
            ...(status === 'PUBLISHED' ? [{ label: 'View published HTML ↗', href: `${API_BASE}/pages/${page.id}/published-view` }] : []),
            ...(page.liveUrl && !IS_LOCAL ? [{ label: 'Open on gyftr.com ↗', href: page.liveUrl }] : []),
            ...(canPublish && status === 'PUBLISHED' ? [{ label: 'Unpublish', onSelect: () => setDialog('unpublish'), danger: true }] : []),
            ...(canPublish && status !== 'ARCHIVED' ? [{ label: 'Archive', onSelect: () => setDialog('archive'), danger: true }] : []),
            ...(canPublish && status === 'ARCHIVED'
              ? [{ label: 'Restore from archive', onSelect: () => void runAction('unarchive', undefined, 'Page restored to drafts') }]
              : []),
          ]}
        />
        <Button onClick={() => void save()} disabled={!dirty} loading={saving} title="Ctrl+S">
          Save draft
        </Button>
        <Button onClick={() => setDialog('download')} disabled={!validation.success} title="Download this page as a single HTML file">
          Download
        </Button>
        {canPublish && status !== 'ARCHIVED' && (
          <Button variant="primary" onClick={() => setDialog('publish')} disabled={!validation.success}>
            Publish
          </Button>
        )}
      </div>

      <div ref={editorBody} className="editor-body" style={{ '--editor-cols': paneColumns(panes) } as React.CSSProperties}>
        {panes.collapsed.left ? (
          <PaneRail label={tab === 'sections' ? `Sections (${sections.length})` : 'Page settings'} side="left" onOpen={() => togglePane('left')} />
        ) : (
        <aside className="editor-pane editor-left">
          <div className="tabs" role="tablist">
            <button className="tab" role="tab" aria-selected={tab === 'sections'} onClick={() => setTab('sections')}>
              Sections ({sections.length})
            </button>
            <button className="tab" role="tab" aria-selected={tab === 'settings'} onClick={() => setTab('settings')}>
              Page settings
            </button>
          </div>
          {tab === 'sections' ? (
            <div className="stack" style={{ gap: 10 }}>
              <SectionList sections={sections} selectedId={selectedId} invalidIds={invalidIds} onSelect={setSelectedId} onChange={setSections} />
              <Button variant="primary" onClick={() => setAdding(true)}>
                + Add section
              </Button>
              <p className="muted small">Drag ⠿ to reorder. 👁 hides a section without deleting it.</p>
            </div>
          ) : (
            <p className="muted small">URL, SEO and theme settings are shown in the main panel →</p>
          )}
        </aside>
        )}

        <PaneDivider which="left" container={editorBody} layout={panes} update={updatePanes} toggle={togglePane} />

        {panes.collapsed.center ? (
          <PaneRail
            label={tab === 'settings' ? 'Page settings' : selected ? sectionTitle(selected) : 'Editor'}
            side="center"
            onOpen={() => togglePane('center')}
          />
        ) : (
        <main className="editor-pane editor-center">
          {tab === 'settings' ? (
            <PageSettingsPanel
              title={doc.title}
              pageUrl={doc.pageUrl}
              publicBaseUrl={publicBaseUrl}
              liveUrl={page.liveUrl}
              content={doc.content}
              onTitle={(title) => setDoc((d) => ({ ...d, title }))}
              onPageUrl={(pageUrl) => setDoc((d) => ({ ...d, pageUrl: pageUrl.trim() }))}
              onContent={setContent}
            />
          ) : selected ? (
            <SectionEditorPanel
              section={selected}
              onPatch={updateSelected}
              onDuplicate={duplicateSelected}
              onDelete={() => setDialog('delete-section')}
            />
          ) : (
            <EmptyState title="No section selected" action={<Button variant="primary" onClick={() => setAdding(true)}>Add a section</Button>}>
              Pick a section on the left or add a new one.
            </EmptyState>
          )}
        </main>
        )}

        <PaneDivider which="right" container={editorBody} layout={panes} update={updatePanes} toggle={togglePane} />

        {panes.collapsed.right ? (
          <PaneRail label="Live preview" side="right" onOpen={() => togglePane('right')} />
        ) : (
          <aside className="editor-pane editor-right">
            <PreviewPane
              pageId={page.id}
              content={previewContent}
              focusSectionId={tab === 'sections' ? selectedId : null}
            />
          </aside>
        )}
      </div>

      <AddSectionModal open={adding} onClose={() => setAdding(false)} onAdd={addSection} />

      <DownloadDialog open={dialog === 'download'} dirty={dirty} loading={downloading || saving} onClose={() => setDialog(null)} onDownload={(chrome) => void download(chrome)} />
      <PublishDialog
        open={dialog === 'publish'}
        dirty={dirty}
        pageUrl={doc.pageUrl}
        liveUrl={page.liveUrl}
        loading={action.isPending || saving}
        onClose={() => setDialog(null)}
        onPublish={(note) => void publish(note)}
      />
      <ConfirmDialog
        open={dialog === 'unpublish'}
        title="Unpublish page?"
        danger
        confirmLabel="Unpublish"
        loading={action.isPending}
        message={<p>The published HTML of this page is removed. The draft is kept, and the page can be published again at any time.</p>}
        onClose={() => setDialog(null)}
        onConfirm={() => void runAction('unpublish', undefined, 'Page unpublished')}
      />
      <ConfirmDialog
        open={dialog === 'archive'}
        title="Archive page?"
        danger
        confirmLabel="Archive"
        loading={action.isPending}
        message={<p>The page is taken offline and moved to the archive. You can restore it later.</p>}
        onClose={() => setDialog(null)}
        onConfirm={() => void runAction('archive', undefined, 'Page archived')}
      />
      <ConfirmDialog
        open={dialog === 'delete-section'}
        title="Delete section?"
        danger
        confirmLabel="Delete"
        message={<p>Delete the “{selected ? sectionTitle(selected) : ''}” section? You can undo by restoring a previous version from History.</p>}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (selected) {
            const index = sections.indexOf(selected);
            const next = sections.filter((s) => s.id !== selected.id);
            setSections(next);
            setSelectedId(next[Math.max(0, index - 1)]?.id ?? null);
          }
          setDialog(null);
        }}
      />
      <RevisionsModal
        open={dialog === 'history'}
        pageId={page.id}
        restoring={action.isPending}
        onClose={() => setDialog(null)}
        onRestore={(revisionId, v) => {
          if (dirty && !window.confirm('You have unsaved changes that will be lost. Continue?')) return;
          void runAction('restore', { revisionId, expectedVersion: version }, `Version v${v} restored into the draft`);
        }}
      />
      <SaveTemplateDialog open={dialog === 'template'} pageId={page.id} onClose={() => setDialog(null)} />
      <DuplicateDialog
        open={dialog === 'duplicate'}
        page={page}
        publicBaseUrl={publicBaseUrl}
        onClose={() => setDialog(null)}
        onDone={(p) => navigate(`/pages/${p.id}`)}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Leave without saving?"
        danger
        confirmLabel="Discard changes"
        message={<p>You have unsaved changes on this page.</p>}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  );
}

interface MenuItem {
  label: string;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
}

/** Compact overflow menu for secondary page actions. Closes on outside click / Escape. */
function MoreMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <Button variant="ghost" size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        More ▾
      </Button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((item) =>
            item.href ? (
              <a key={item.label} role="menuitem" href={item.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={item.danger ? 'danger' : ''}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function SectionEditorPanel({
  section,
  onPatch,
  onDuplicate,
  onDelete,
}: {
  section: Section;
  onPatch: (patch: Partial<Section>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const def = sectionDefinition(section.type);
  const Editor = def.Editor as unknown as React.ComponentType<{ props: unknown; onChange: (patch: object) => void }>;
  const layout = section.layout ?? {};
  const defaults = defaultSpacing(section.type);
  const setSpace = (key: SpaceKey, value: number | null) =>
    onPatch({ layout: { ...layout, [key]: value === null ? null : Math.max(0, Math.min(400, Math.round(value))) } });
  const preset = (padding: number, headingGap: number) =>
    onPatch({
      layout: {
        ...layout,
        paddingTop: Math.min(padding, defaults.paddingTop),
        paddingBottom: Math.min(padding, defaults.paddingBottom),
        ...(defaults.headingGap != null ? { headingGap } : {}),
      },
    });
  const spaceInput = (key: SpaceKey, label: string) => (
    <SpaceInput label={label} value={layout[key] ?? null} fallback={defaults[key] ?? 0} onChange={(v) => setSpace(key, v)} />
  );
  return (
    <div className="stack">
      <div className="row-between">
        <h2>
          {def.icon} {sectionTitle(section)}
          {sectionTitle(section) !== def.label && <span className="muted small"> · {def.label}</span>}
        </h2>
        <div className="row">
          <Button size="sm" variant="ghost" onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
      <Collapsible id="content" title="Content" defaultOpen>
        <Editor key={section.id} props={section.props} onChange={(patch) => onPatch({ props: { ...section.props, ...patch } } as Partial<Section>)} />
      </Collapsible>
      <Collapsible id="options" title="Section options">
        <Toggle label="Visible on page" checked={section.visible} onChange={(visible) => onPatch({ visible })} />
        <TextInput
          label="Name in the section list"
          value={section.name ?? ''}
          maxLength={80}
          placeholder={sectionHeading(section) || def.label}
          hint="Only for the panel. Empty: the section's heading is used."
          onChange={(name) => onPatch({ name })}
        />
        <TextInput
          label="Anchor id"
          value={section.anchor}
          maxLength={60}
          placeholder="e.g. brands"
          hint={section.anchor ? `Link to this section with #${section.anchor}` : 'Optional. Lets buttons and links jump to this section.'}
          onChange={(anchor) => onPatch({ anchor: anchor.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
        />
      </Collapsible>
      <Collapsible id="spacing" title="Spacing">
        <p className="field-hint" style={{ margin: 0 }}>
          In pixels, as on a desktop screen; phones get about half, like the built-in spacing. An empty box keeps the default shown in it. The gap between
          two sections is this section's <strong>padding bottom</strong> plus the next section's <strong>padding top</strong>: lower both to bring them closer.
        </p>
        <div className="row wrap">
          <Button size="sm" onClick={() => preset(24, 16)}>
            Compact
          </Button>
          <Button size="sm" onClick={() => preset(0, 12)}>
            No space
          </Button>
          {Object.values(layout).some((v) => v != null) && (
            <Button size="sm" variant="ghost" onClick={() => onPatch({ layout: undefined })}>
              Reset spacing to default
            </Button>
          )}
        </div>
        <div className="grid-2">
          {spaceInput('paddingTop', 'Padding top')}
          {spaceInput('paddingBottom', 'Padding bottom')}
          {spaceInput('marginTop', 'Margin top')}
          {spaceInput('marginBottom', 'Margin bottom')}
          {defaults.headingGap != null && spaceInput('headingGap', 'Space under heading')}
        </div>
      </Collapsible>
    </div>
  );
}

/** A part of the section panel that folds open and closed; stays as the editor left it (per browser). */
function Collapsible({ id, title, defaultOpen = false, children }: { id: string; title: string; defaultOpen?: boolean; children: ReactNode }) {
  const key = `section-panel:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? defaultOpen : saved === '1';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(key, open ? '0' : '1');
    } catch {
      /* storage unavailable: still toggles */
    }
  };
  return (
    <section className={`panel-part ${open ? 'open' : ''}`}>
      <button type="button" className="panel-part-head" aria-expanded={open} onClick={toggle}>
        <span>{title}</span>
        <span aria-hidden className="panel-part-chevron">
          ▾
        </span>
      </button>
      {open && <div className="panel-part-body stack">{children}</div>}
    </section>
  );
}

type SpaceKey = keyof NonNullable<Section['layout']>;

/** The built-in spacing of each section type (desktop px), shown in the empty boxes. Matches page.css. */
function defaultSpacing(type: Section['type']): Record<Exclude<SpaceKey, 'headingGap'>, number> & { headingGap?: number } {
  const padding = type === 'hero' ? 0 : 80;
  const headingGap = ['features', 'brandGrid', 'brandTabs', 'categories', 'imageBanners'].includes(type) ? 40 : type === 'richText' ? 22 : undefined;
  return { paddingTop: type === 'terms' ? 0 : padding, paddingBottom: padding, marginTop: 0, marginBottom: 0, headingGap };
}

/**
 * A space in px with − / + buttons. Empty means "the default", which is shown in the box; stepping
 * from empty starts at the default, so − always makes the space smaller than what is on the page.
 */
function SpaceInput({ label, value, fallback, onChange }: { label: string; value: number | null; fallback: number; onChange: (v: number | null) => void }) {
  const id = useId();
  const step = (delta: number) => onChange(Math.max(0, Math.min(400, (value ?? fallback) + delta)));
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="space-input">
        <button type="button" aria-label={`Less ${label.toLowerCase()}`} onClick={() => step(-8)} disabled={(value ?? fallback) <= 0}>
          −
        </button>
        <input
          id={id}
          className="input"
          type="number"
          min={0}
          max={400}
          value={value ?? ''}
          placeholder={`${fallback} (default)`}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            step(e.key === 'ArrowUp' ? 4 : -4);
          }}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
        <span className="muted small">px</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => step(8)} disabled={(value ?? fallback) >= 400}>
          +
        </button>
      </div>
    </div>
  );
}

function DownloadDialog({
  open,
  dirty,
  loading,
  onClose,
  onDownload,
}: {
  open: boolean;
  dirty: boolean;
  loading: boolean;
  onClose: () => void;
  onDownload: (includeChrome: boolean) => void;
}) {
  const [chrome, setChrome] = useState(true);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Download page"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={loading} onClick={() => onDownload(chrome)}>
            {dirty ? 'Save & download' : 'Download .html'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <p style={{ margin: 0 }}>
          Downloads the saved draft as a single <span className="mono">.html</span> file with everything inside it: styles, script, fonts and images.
          It opens in any browser, even offline. Useful for reviews and sign-off; the live site gets its HTML from Publish.
        </p>
        <Toggle
          label="Include header and footer"
          hint="Turn off to see only what is published to gyftr.com (the page body)."
          checked={chrome}
          onChange={setChrome}
        />
        <p className="muted small" style={{ margin: 0 }}>
          Brand discounts and links are as of now. Download again after making changes.
        </p>
      </div>
    </Modal>
  );
}

function PublishDialog({
  open,
  dirty,
  pageUrl,
  liveUrl,
  loading,
  onClose,
  onPublish,
}: {
  open: boolean;
  dirty: boolean;
  pageUrl: string;
  liveUrl: string | null;
  loading: boolean;
  onClose: () => void;
  onPublish: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Publish page"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={loading} onClick={() => onPublish(note)}>
            {dirty ? 'Save & publish' : 'Publish'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {IS_LOCAL && (
          <div className="alert alert-warning">
            You are on a local machine. Publishing here only stores the page in your local database so you can test it. <strong>Nothing is sent to gyftr.com</strong> and the
            live site does not change.
          </div>
        )}
        <p style={{ margin: 0 }}>
          The current draft is rendered and stored as the published version of <strong>{pageUrl.split('/').pop()}</strong>
          {liveUrl && liveUrl !== pageUrl ? (
            <>
              {' '}
              (moving from <span className="mono">{liveUrl}</span>)
            </>
          ) : null}
          .{!IS_LOCAL && ' gyftr.com fetches it from this system; nothing is pushed to the live site.'}
        </p>
        <TextArea label="Change note (optional)" value={note} maxLength={300} onChange={setNote} placeholder="e.g. Added Dhanteras banner" />
      </div>
    </Modal>
  );
}

function SaveTemplateDialog({ open, pageId, onClose }: { open: boolean; pageId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [occasionSpecific, setOccasionSpecific] = useState(true);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    try {
      await api.post(`/pages/${pageId}/save-as-template`, { name, description, occasionSpecific });
      await qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template saved (from the last saved draft)');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save as template"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={loading} disabled={name.trim().length < 2} onClick={() => void submit()}>
            Save template
          </Button>
        </>
      }
    >
      <div className="stack">
        <TextInput label="Template name" value={name} maxLength={120} onChange={setName} placeholder="e.g. Festive layout with tabs" />
        <TextArea label="Description" value={description} maxLength={300} onChange={setDescription} />
        <Toggle label="Only offer for this occasion" checked={occasionSpecific} onChange={setOccasionSpecific} />
      </div>
    </Modal>
  );
}

function DuplicateDialog({
  open,
  page,
  publicBaseUrl,
  onClose,
  onDone,
}: {
  open: boolean;
  page: PageDetail;
  publicBaseUrl: string;
  onClose: () => void;
  onDone: (p: PageDetail) => void;
}) {
  const [title, setTitle] = useState(`${page.title} (copy)`);
  const [pageUrl, setPageUrl] = useState(`${publicBaseUrl}/${page.slug}-copy`);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ page: PageDetail }>(`/pages/${page.id}/duplicate`, { title, pageUrl });
      toast.success('Page duplicated as a new draft');
      onClose();
      onDone(res.page);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Duplicate page"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={loading} onClick={() => void submit()}>
            Duplicate
          </Button>
        </>
      }
    >
      <div className="stack">
        <TextInput label="Title" value={title} maxLength={160} onChange={setTitle} />
        <TextInput label="Page URL" value={pageUrl} onChange={setPageUrl} hint="Copies the last saved draft." />
      </div>
    </Modal>
  );
}
