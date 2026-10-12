import type { ReactNode } from 'react';

const COLLAPSED_HEIGHT = 260;

/**
 * "Read more" for long content. All the content is in the markup (good for
 * SEO) and only visually clamped; the page script removes the clamp when the
 * content is short and toggles it on click.
 */
export function Collapsible({ children, moreLabel, lessLabel }: { children: ReactNode; moreLabel: string; lessLabel: string }) {
  return (
    <div className="collapsible">
      <div className="collapsible-body" style={{ maxHeight: COLLAPSED_HEIGHT }}>
        {children}
      </div>
      <button type="button" className="read-more" aria-expanded={false} data-more={moreLabel || 'Read more'} data-less={lessLabel || 'Read less'}>
        {moreLabel || 'Read more'} ▼
      </button>
    </div>
  );
}
