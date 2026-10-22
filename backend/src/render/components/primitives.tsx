import type { ReactNode } from 'react';
import type { Button, Image as ImageValue } from '../../contracts';
import { SlotIcon } from './icons';

const GYFTR_HOST = /(^|\.)gyftr\.com$/i;

/** Anchor that opens off-site links (or any link, with newTab) safely in a new tab and keeps gyftr.com links in the same tab. */
export function SmartLink({
  href,
  className,
  children,
  ariaLabel,
  newTab,
}: {
  href: string;
  className?: string;
  children?: ReactNode;
  ariaLabel?: string;
  newTab?: boolean;
}) {
  let external = Boolean(newTab);
  if (/^https?:\/\//i.test(href)) {
    try {
      external = external || !GYFTR_HOST.test(new URL(href).hostname);
    } catch {
      external = true;
    }
  }
  return (
    <a href={href} className={className} aria-label={ariaLabel} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  );
}

interface PictureProps {
  desktop: ImageValue;
  mobile?: ImageValue;
  /** First image of the page: loaded eagerly with high priority (it is the largest paint). */
  priority?: boolean;
  className?: string;
}

/** Art-directed responsive image: a separate mobile crop when one is set. Images are served from their own URL (S3 / CDN). */
export function Picture({ desktop, mobile, priority, className }: PictureProps) {
  const mobileImg = mobile?.url ? mobile : null;
  return (
    <picture>
      {mobileImg && <source media="(max-width: 767px)" srcSet={mobileImg.url} />}
      <img
        src={desktop.url}
        alt={desktop.alt || mobileImg?.alt || ''}
        className={className}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        {...(priority ? { fetchPriority: 'high' as const } : {})}
        width={desktop.width}
        height={desktop.height}
      />
    </picture>
  );
}

/**
 * A heading at the HTML level chosen in the panel (h1–h6, for SEO). Its look comes from its class, so changing the
 * level never changes how the page looks.
 */
export function Heading({ level, className, children }: { level: number; className?: string; children: ReactNode }) {
  const Tag = `h${Math.min(6, Math.max(1, Math.round(level)))}` as 'h2';
  return <Tag className={className}>{children}</Tag>;
}

/** A row of buttons set in the panel; a button without text is left out, one without a link is shown but not clickable. */
export function Buttons({ buttons, align, className }: { buttons: Button[]; align: 'left' | 'center' | 'right'; className?: string }) {
  const shown = buttons.filter((b) => b.label);
  if (!shown.length) return null;
  return (
    <div className={`buttons align-${align} ${className ?? ''}`.trim()}>
      {shown.map((b) => {
        const cls = `btn btn-${b.style === 'outline' ? 'line' : b.style} btn-${b.size}`;
        const content = (
          <>
            {b.label}
            <SlotIcon slot={b.icon} size={b.size === 'small' ? 14 : b.size === 'large' ? 20 : 18} />
          </>
        );
        return b.href ? (
          <SmartLink key={b.id} href={b.href} className={cls} newTab={b.newTab}>
            {content}
          </SmartLink>
        ) : (
          <span key={b.id} className={cls}>
            {content}
          </span>
        );
      })}
    </div>
  );
}

export function SectionHeading({
  heading,
  subheading,
  align = 'center',
  ornament = true,
  level = 2,
  size = '',
}: {
  heading: string;
  subheading?: string;
  align?: 'left' | 'center';
  /** The small decorative line under the heading. */
  ornament?: boolean;
  /** HTML level of the heading (set in the panel). */
  level?: number;
  /** Size class for a tag chosen in the panel (' hs-N'), empty to keep the section's own look. */
  size?: string;
}) {
  if (!heading && !subheading) return null;
  return (
    <header className={`section-heading align-${align}`}>
      {heading && (
        <Heading level={level} className={`section-title${size}`}>
          {heading}
        </Heading>
      )}
      {ornament && <span className={`ornament ${align === 'left' ? 'left' : ''}`} aria-hidden />}
      {subheading && <p>{subheading}</p>}
    </header>
  );
}

export function Html({ html, className }: { html: string; className?: string }) {
  // `html` is sanitised by safeHtml() before it reaches this component.
  return <div className={`prose ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
