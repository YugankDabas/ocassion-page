import type { CSSProperties, ReactNode } from 'react';
import type { IconSlot, PublicBrand, SectionLayout, SectionOf, SectionType, SiteSettings } from '../../../contracts';
import { safeHtml } from '../../html';
import { BrandCollection } from '../brand/BrandCollection';
import { BrandTabs } from '../brand/BrandTabs';
import { resolveBrands, type BrandCardData } from '../brand/types';
import { Bits, HeroArt, Medallion, MotifGlyph, Ribbon, hasRibbon, type ResolvedMotif } from '../art/motifs';
import { ItemIcon, SlotIcon, hasIcon } from '../icons';
import { Html, Picture, SectionHeading, SmartLink } from '../primitives';
import { Collapsible } from './Collapsible';
import { HeroCarousel } from './HeroCarousel';

/** Everything a section renderer may need besides its own props. */
export interface RenderContext {
  brands: Record<string, PublicBrand>;
  /** Brands from the page's first brand grid — used for the hero's gift-card stack. */
  featured: BrandCardData[];
  /** Illustration set chosen in the page theme. */
  motif: ResolvedMotif;
  /** Editable interface texts (site settings). */
  labels: SiteSettings['labels'];
  /** Index among visible sections — the first hero gets image priority. */
  index: number;
}

export type SectionComponent<T extends SectionType> = (p: { section: SectionOf<T>; ctx: RenderContext }) => ReactNode;

/** The spacing set for a section in the panel, as inline style; nothing when the built-in spacing is kept. */
export function layoutStyle(layout: SectionLayout | undefined): CSSProperties | undefined {
  if (!layout) return undefined;
  const style: Record<string, string> = {};
  if (layout.paddingTop != null) style.paddingTop = space(layout.paddingTop);
  if (layout.paddingBottom != null) style.paddingBottom = space(layout.paddingBottom);
  if (layout.marginTop != null) style.marginTop = space(layout.marginTop);
  if (layout.marginBottom != null) style.marginBottom = space(layout.marginBottom);
  if (layout.headingGap != null) style['--heading-gap'] = space(layout.headingGap);
  return Object.keys(style).length ? (style as CSSProperties) : undefined;
}

/**
 * A space set in the panel, in px as on a desktop screen. It shrinks on smaller screens the way the
 * built-in spacing does (80px desktop, 40px phone = clamp(40px, 6vw, 80px)): full size from about
 * 1330px wide, down to half on a phone.
 */
function space(px: number): string {
  if (px === 0) return '0';
  const round = (n: number) => Math.round(n * 100) / 100;
  return `clamp(${round(px / 2)}px, ${round(px * 0.075)}vw, ${px}px)`;
}

function Shell({
  section,
  tone,
  children,
  className = '',
}: {
  section: { id: string; anchor: string; type: string; layout?: SectionLayout };
  tone?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={section.anchor || undefined}
      data-section={section.type}
      data-section-id={section.id}
      className={`section tone-${tone ?? 'transparent'} ${className}`}
      style={layoutStyle(section.layout)}
    >
      <div className="container">{children}</div>
    </section>
  );
}

/* ---------- Hero ---------- */
/** Phone mock-up showing the occasion gift card and a few of the page's own brands. */
function GiftPhone({ motif, title, greeting, brands }: { motif: ResolvedMotif; title: string; greeting: string; brands: BrandCardData[] }) {
  const offers = brands.filter((b) => b.discountText).slice(0, 3);
  return (
    <div className="phone" aria-hidden>
      <div className="phone-screen">
        <span className="phone-notch" aria-hidden />
        <div className="gcard">
          <MotifGlyph motif={motif} size={74} className="gcard-art" />
          {title && <span className="gcard-title">{title}</span>}
        </div>
        {greeting && <p className="gcard-greeting">{greeting}</p>}
        {offers.length > 0 && (
        <ul className="phone-offers">
          {offers.map((b) => (
            <li key={b.id}>
              <span>{b.name}</span>
              <strong>{b.discountText}</strong>
            </li>
          ))}
        </ul>
        )}
      </div>
    </div>
  );
}

export const HeroSection: SectionComponent<'hero'> = ({ section, ctx }) => {
  const { slides, height, autoplayMs, showTrustBar, trustItems } = section.props;
  if (slides.length === 0) return null;

  const renderSlide = (s: (typeof slides)[number], i: number) => {
    const hasImage = Boolean(s.desktopImage.url);
    const motif = s.artwork === 'auto' ? ctx.motif : s.artwork;
    const side = Boolean(s.sideImage.url) || s.showCard;
    const hasText = Boolean(s.heading || s.subheading || s.eyebrow);
    const Heading = i === 0 && ctx.index === 0 ? 'h1' : 'p';
    const copy = hasText && (
      <div className="hero-copy">
        {s.eyebrow && (
          <p className="hero-eyebrow">{s.eyebrow}</p>
        )}
        {s.heading && <Heading className="hero-heading">{s.heading}</Heading>}
        {s.subheading && <p className="hero-sub">{s.subheading}</p>}
        {s.ctaLabel && (
          <span className="hero-cta">
            {s.ctaLabel} <SlotIcon slot={section.props.ctaIcon} size={18} />
          </span>
        )}
      </div>
    );

    const inner = hasImage ? (
      <>
        <Picture
          desktop={s.desktopImage}
          mobile={s.mobileImage}
          priority={ctx.index === 0 && i === 0}
          className="hero-img"
        />
        {hasText && (
          <div className="hero-scrim">
            <div className="container">{copy}</div>
          </div>
        )}
      </>
    ) : (
      <>
        <span className="hero-band" aria-hidden />
        {s.showDecorations && hasRibbon(motif) && !s.artImage.url && <Ribbon className="hero-ribbon" />}
        {s.showDecorations && <Bits motif={motif} />}
        <div className={`container hero-stage ${side ? '' : 'no-side'}`}>
          {s.artImage.url ? (
            <span className="hero-medallion hero-art-img">
              <Picture desktop={s.artImage} priority={ctx.index === 0 && i === 0} />
            </span>
          ) : (
            <HeroArt motif={motif} className="hero-medallion" />
          )}
          {copy}
          {s.sideImage.url ? (
            <span className="hero-side-img">
              <Picture desktop={s.sideImage} />
            </span>
          ) : (
            s.showCard && <GiftPhone motif={motif} title={s.cardTitle} greeting={s.cardText} brands={ctx.featured} />
          )}
        </div>
      </>
    );

    const cls = `hero-frame h-${height} ${hasImage ? 'has-image' : 'no-image'}`;
    return s.href ? (
      <SmartLink key={s.id} href={s.href} className={cls} ariaLabel={s.heading || s.desktopImage.alt || undefined}>
        {inner}
      </SmartLink>
    ) : (
      <div key={s.id} className={cls}>
        {inner}
      </div>
    );
  };

  return (
    <section id={section.anchor || undefined} data-section="hero" data-section-id={section.id} className="section-hero" style={layoutStyle(section.layout)}>
      {slides.length === 1 ? (
        renderSlide(slides[0]!, 0)
      ) : (
        <HeroCarousel autoplayMs={autoplayMs} label="Offers">
          {slides.map(renderSlide)}
        </HeroCarousel>
      )}
      {showTrustBar && trustItems.length > 0 && (
        <div className="container">
          <ul className="trust-bar" style={{ '--cols': trustItems.length } as CSSProperties}>
            {trustItems.map((t) => (
              <li key={t.id}>
                <span className="trust-icon">
                  <ItemIcon item={t} size={20} />
                </span>
                {(t.title || t.text) && (
                  <span>
                    {t.title && <strong>{t.title}</strong>}
                    {t.text && <small>{t.text}</small>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

/* ---------- Intro ---------- */
export const IntroSection: SectionComponent<'intro'> = ({ section, ctx }) => {
  const p = section.props;
  if (!p.eyebrow && !p.heading && !p.body) return null;
  return (
    <Shell section={section} tone={p.tone} className="section-intro">
      {p.tone === 'primary' && p.showDecorations && (
        <>
          <Medallion motif={ctx.motif} className="intro-deco deco-left" />
          <Medallion motif={ctx.motif} className="intro-deco deco-right" />
        </>
      )}
      <div className={`intro align-${p.align}`}>
        {p.eyebrow && <p className="eyebrow">{p.eyebrow}</p>}
        {p.heading && (ctx.index === 0 ? <h1>{p.heading}</h1> : <h2>{p.heading}</h2>)}
        {p.showOrnament && (p.eyebrow || p.heading) && <span className="ornament" aria-hidden />}
        {p.body && <Html html={safeHtml(p.body)} />}
      </div>
    </Shell>
  );
};

/* ---------- Features ---------- */
export const FeaturesSection: SectionComponent<'features'> = ({ section, ctx }) => {
  const p = section.props;
  if (!p.items.length) return null;
  return (
    <Shell section={section} tone={p.tone}>
      <SectionHeading heading={p.heading} subheading={p.subheading} ornament={p.showOrnament} />
      <ul className="features" style={{ '--cols': p.columns } as CSSProperties}>
        {p.items.map((f, i) => (
          <li key={f.id} className="feature">
            {p.showNumbers && (
              <span className="feature-num" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
            )}
            {(f.icon.url || f.emoji) && (
              <span className="feature-icon" aria-hidden>
                {f.icon.url ? <Picture desktop={f.icon} /> : f.emoji}
              </span>
            )}
            {f.title && <h3>{f.title}</h3>}
            {f.description && <p>{f.description}</p>}
          </li>
        ))}
      </ul>
    </Shell>
  );
};

/* ---------- Brand grid ---------- */
export const BrandGridSection: SectionComponent<'brandGrid'> = ({ section, ctx }) => {
  const p = section.props;
  const brands = resolveBrands(p.brands, ctx.brands);
  if (!brands.length) return null;
  return (
    <Shell section={section} className="section-brands">
      <SectionHeading heading={p.heading} subheading={p.subheading} ornament={p.showOrnament} />
      <BrandCollection
        brands={brands}
        layout={p.layout}
        initialCount={p.initialCount}
        showSearch={p.showSearch}
        showDiscountFilter={p.showDiscountFilter}
        filters={p.discountFilters}
        hideEmptyFilters={p.hideEmptyFilters}
        ctaLabel={p.ctaLabel}
        labels={ctx.labels}
        id={section.id}
        icons={{ discount: p.discountIcon, cta: p.ctaIcon }}
      />
    </Shell>
  );
};

/* ---------- Brand tabs ---------- */
export const BrandTabsSection: SectionComponent<'brandTabs'> = ({ section, ctx }) => {
  const p = section.props;
  const tabs = p.tabs
    .map((t) => ({ id: t.id, label: t.label, emoji: t.emoji, brands: resolveBrands(t.brands, ctx.brands) }))
    .filter((t) => t.brands.length > 0);
  if (!tabs.length) return null;
  return (
    <Shell section={section} className="section-tabs">
      <SectionHeading heading={p.heading} subheading={p.subheading} ornament={p.showOrnament} />
      <BrandTabs tabs={tabs} ctaLabel={p.ctaLabel} labels={ctx.labels} id={section.id} icons={{ discount: p.discountIcon, cta: p.ctaIcon }} />
    </Shell>
  );
};

/* ---------- Categories ---------- */
export const CategoriesSection: SectionComponent<'categories'> = ({ section, ctx }) => {
  const p = section.props;
  if (!p.items.length) return null;
  return (
    <Shell section={section}>
      <SectionHeading heading={p.heading} subheading={p.subheading} ornament={p.showOrnament} />
      <ul className="categories">
        {p.items.map((c) => {
          const body = (
            <>
              <span className="category-img">
                {c.image.url ? (
                  <Picture desktop={c.image} />
                ) : (
                  <SlotIcon slot={p.placeholderIcon} size={36} />
                )}
              </span>
              {c.label && (
                <span className="category-label">
                  {c.label} <SlotIcon slot={p.linkIcon} size={14} />
                </span>
              )}
            </>
          );
          return (
            <li key={c.id}>
              {c.href ? (
                <SmartLink href={c.href} className="category">
                  {body}
                </SmartLink>
              ) : (
                <span className="category">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </Shell>
  );
};

/* ---------- Image banners ---------- */
export const ImageBannersSection: SectionComponent<'imageBanners'> = ({ section, ctx }) => {
  const p = section.props;
  const items = p.items.filter((b) => b.desktopImage.url);
  if (!items.length) return null;
  return (
    <Shell section={section}>
      <SectionHeading heading={p.heading} ornament={p.showOrnament} />
      <div className="banners" style={{ '--cols': p.columns } as CSSProperties}>
        {items.map((b) => {
          const img = (
            <Picture
              desktop={b.desktopImage}
              mobile={b.mobileImage}
            />
          );
          return b.href ? (
            <SmartLink key={b.id} href={b.href} className="banner" ariaLabel={b.desktopImage.alt || undefined}>
              {img}
            </SmartLink>
          ) : (
            <div key={b.id} className="banner">
              {img}
            </div>
          );
        })}
      </div>
    </Shell>
  );
};

/* ---------- Rich text ---------- */
export const RichTextSection: SectionComponent<'richText'> = ({ section, ctx }) => {
  const p = section.props;
  if (!p.body && !p.heading) return null;
  const body = <Html html={safeHtml(p.body)} />;
  return (
    <Shell section={section} tone={p.tone} className="section-richtext">
      <div className="rich-text">
        {p.heading && (
          <h2>
            {p.showMark && <span className="rich-text-mark" aria-hidden />}
            <SlotIcon slot={p.headingIcon} size={22} className="heading-icon" />
            {p.heading}
          </h2>
        )}
        {p.collapsible ? <Collapsible moreLabel={ctx.labels.readMore} lessLabel={ctx.labels.readLess}>{body}</Collapsible> : body}
      </div>
    </Shell>
  );
};

/* ---------- FAQ ---------- */
function FaqHelp({ title, text, href, icon }: { title: string; text: string; href: string; icon: IconSlot }) {
  const body = (
    <>
      {hasIcon(icon) && (
        <span className="faq-help-icon">
          <SlotIcon slot={icon} size={22} />
        </span>
      )}
      <span>
        {title && <strong>{title}</strong>}
        {text && <small>{text}</small>}
      </span>
    </>
  );
  return href ? (
    <SmartLink href={href} className="faq-help">
      {body}
    </SmartLink>
  ) : (
    <div className="faq-help">{body}</div>
  );
}

export const FaqSection: SectionComponent<'faq'> = ({ section }) => {
  const p = section.props;
  const items = p.items.filter((q) => q.question && q.answer);
  if (!items.length) return null;
  const hasAside = Boolean(p.eyebrow || p.heading || p.intro || p.helpTitle || p.helpText);
  return (
    <Shell section={section} className="section-faq">
      <div className={`faq-layout ${hasAside ? '' : 'no-aside'}`}>
        {hasAside && (
          <aside className="faq-aside">
            {p.eyebrow && <p className="eyebrow">{p.eyebrow}</p>}
            {p.heading && <h2>{p.heading}</h2>}
            {p.showOrnament && (p.eyebrow || p.heading) && <span className="ornament left" aria-hidden />}
            {p.intro && <p>{p.intro}</p>}
            {(p.helpTitle || p.helpText) && <FaqHelp title={p.helpTitle} text={p.helpText} href={p.helpHref} icon={p.helpIcon} />}
          </aside>
        )}
        <div className="faq">
          {items.map((q, i) => (
            <details key={q.id} className="faq-item" open={i === 0}>
              <summary>
                {p.showNumbers && (
                  <span className="faq-index" aria-hidden>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                )}
                <h3>{q.question}</h3>
                {hasIcon(p.toggleIcon) && (
                  <span className="faq-toggle" aria-hidden>
                    <SlotIcon slot={p.toggleIcon} size={18} />
                  </span>
                )}
              </summary>
              <Html html={safeHtml(q.answer)} />
            </details>
          ))}
        </div>
      </div>
    </Shell>
  );
};

/* ---------- Terms ---------- */
export const TermsSection: SectionComponent<'terms'> = ({ section }) => {
  const p = section.props;
  if (!p.body) return null;
  const body = <Html html={safeHtml(p.body)} className="terms-body" />;
  const title = (
    <h2>
      <SlotIcon slot={p.headingIcon} size={18} /> {p.heading || 'Terms & Conditions'}
    </h2>
  );
  return (
    <Shell section={section} className="section-terms">
      {p.collapsible ? (
        <details className="terms" open={p.defaultOpen}>
          <summary>
            {title}
            <SlotIcon slot={p.toggleIcon} size={18} className="terms-chevron" />
          </summary>
          {body}
        </details>
      ) : (
        <div className="terms">
          {title}
          {body}
        </div>
      )}
    </Shell>
  );
};

/* ---------- CTA ---------- */
export const CtaSection: SectionComponent<'cta'> = ({ section, ctx }) => {
  const p = section.props;
  if (!p.heading && !p.text) return null;
  return (
    <Shell section={section}>
      <div className={`cta tone-${p.tone} ${p.backgroundImage.url ? 'has-bg' : ''}`}>
        {p.backgroundImage.url && <Picture desktop={p.backgroundImage} className="cta-bg" />}
        <span className="cta-glow" aria-hidden />
        {!p.backgroundImage.url && p.showArt && <MotifGlyph motif={ctx.motif} size={200} className="cta-art" />}
        <div className="cta-copy">
          {p.heading && <h2>{p.heading}</h2>}
          {p.text && <p>{p.text}</p>}
        </div>
        {p.button.label && p.button.href && (
          <SmartLink href={p.button.href} className="btn-primary">
            {p.button.label} <SlotIcon slot={p.buttonIcon} size={18} />
          </SmartLink>
        )}
      </div>
    </Shell>
  );
};
