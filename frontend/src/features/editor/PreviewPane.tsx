import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageContent } from '../../contracts';
import { API_BASE, api } from '../../lib/api';

const WIDTHS = { desktop: '100%', tablet: '820px', mobile: '390px' } as const;
const DEVICE_ICON = { desktop: '🖥', tablet: '📱', mobile: '📲' } as const;
const RENDER_DEBOUNCE_MS = 500;
const FRAME_NAME = 'occasion-preview';

interface Props {
  pageId: string;
  /** Current (possibly unsaved) editor content; null while it fails validation. */
  content: PageContent | null;
  /** Section the editor has selected — the preview scrolls to it. */
  focusSectionId: string | null;
}

/**
 * Live preview. The editor's current document is posted to the API, which
 * renders it with the same renderer that produces the published HTML and
 * answers with a complete, sandboxed page loaded straight into the iframe.
 * Nothing is saved by previewing.
 */
export function PreviewPane({ pageId, content, focusSectionId }: Props) {
  const [device, setDevice] = useState<keyof typeof WIDTHS>('desktop');
  const [rendering, setRendering] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const scrollY = useRef(0);
  const focus = useRef(focusSectionId);
  const lastRendered = useRef<string | null>(null);

  const post = useCallback((message: object) => frame.current?.contentWindow?.postMessage(message, '*'), []);

  const submit = useCallback((serialized: string, target: string) => {
    const el = form.current;
    if (!el) return;
    (el.elements.namedItem('content') as HTMLInputElement).value = serialized;
    (el.elements.namedItem('_csrf') as HTMLInputElement).value = api.getCsrfToken();
    el.target = target;
    el.submit();
  }, []);

  // Re-render (debounced) whenever the document changes.
  useEffect(() => {
    if (!content) return;
    const serialized = JSON.stringify(content);
    if (serialized === lastRendered.current) return;
    const timer = window.setTimeout(() => {
      lastRendered.current = serialized;
      setRendering(true);
      submit(serialized, FRAME_NAME);
    }, lastRendered.current === null ? 0 : RENDER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [content, submit]);

  // The preview page reports its scroll position and announces each new render,
  // so the view stays where the editor was looking instead of jumping to the top.
  useEffect(() => {
    const onMessage = (e: MessageEvent<{ type?: string; y?: number }>) => {
      if (e.source !== frame.current?.contentWindow || !e.data) return;
      if (e.data.type === 'occasion-preview:position') scrollY.current = Number(e.data.y) || 0;
      if (e.data.type === 'occasion-preview:ready') {
        setRendering(false);
        post({ type: 'occasion-preview:restore', y: scrollY.current });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post]);

  useEffect(() => {
    if (focusSectionId && focusSectionId !== focus.current) post({ type: 'occasion-preview:scroll', sectionId: focusSectionId });
    focus.current = focusSectionId;
  }, [focusSectionId, post]);

  const rerender = (target: string) => {
    if (lastRendered.current !== null) submit(lastRendered.current, target);
  };

  return (
    <>
      <div className="preview-toolbar">
        <strong className="grow">
          Live preview {rendering ? <span className="muted small">· updating…</span> : null}
        </strong>
        {(Object.keys(WIDTHS) as (keyof typeof WIDTHS)[]).map((d) => (
          <button
            key={d}
            type="button"
            className={`icon-btn ${device === d ? 'on' : ''}`}
            onClick={() => setDevice(d)}
            title={`${d} width`}
            aria-label={`${d} width`}
            aria-pressed={device === d}
          >
            {DEVICE_ICON[d]}
          </button>
        ))}
        <button type="button" className="icon-btn" onClick={() => rerender(FRAME_NAME)} title="Reload preview" aria-label="Reload preview">
          ⟳
        </button>
        <button type="button" className="icon-btn" onClick={() => rerender('_blank')} title="Open in new tab" aria-label="Open preview in new tab">
          ↗
        </button>
      </div>
      {!content && <div className="alert alert-warning preview-note">Fix the highlighted fields to update the preview.</div>}
      <form ref={form} method="post" action={`${API_BASE}/pages/${pageId}/preview`} hidden>
        <input type="hidden" name="content" />
        <input type="hidden" name="_csrf" />
      </form>
      <div className="preview-frame-wrap">
        {/* The response is sandboxed by its own policy as well: it can run its script but cannot reach the panel or its cookies. */}
        <iframe ref={frame} name={FRAME_NAME} title="Page preview" className="preview-frame" style={{ width: WIDTHS[device] }} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" />
      </div>
    </>
  );
}
