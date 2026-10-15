import type { ReactNode } from 'react';
import type { Image as ImageValue } from '../../contracts';

const GYFTR_HOST = /(^|\.)gyftr\.com$/i;

/** Anchor that opens off-site links safely in a new tab and keeps gyftr.com links in the same tab. */
export function SmartLink({ href, className, children, ariaLabel }: { href: string; className?: string; children: ReactNode; ariaLabel?: string }) {
  let external = false;
  if (/^https?:\/\//i.test(href)) {
    try {
      external = !GYFTR_HOST.test(new URL(href).hostname);
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

export function SectionHeading({
  heading,
  subheading,
  align = 'center',
  ornament = true,
}: {
  heading: string;
  subheading?: string;
  align?: 'left' | 'center';
  /** The small decorative line under the heading. */
  ornament?: boolean;
}) {
  if (!heading && !subheading) return null;
  return (
    <header className={`section-heading align-${align}`}>
      {heading && <h2>{heading}</h2>}
      {ornament && <span className={`ornament ${align === 'left' ? 'left' : ''}`} aria-hidden />}
      {subheading && <p>{subheading}</p>}
    </header>
  );
}

export function Html({ html, className }: { html: string; className?: string }) {
  // `html` is sanitised by safeHtml() before it reaches this component.
  return <div className={`prose ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
