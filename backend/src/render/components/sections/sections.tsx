import type { CSSProperties, ReactNode } from 'react';
import type { ColorBox, IconSlot, PublicBrand, SectionBackground, SectionLayout, SectionOf, SectionType, SiteSettings } from '../../../contracts';
import { cssUrl } from '../../cssUrl';
import { safeHtml } from '../../html';
import { BrandCollection } from '../brand/BrandCollection';
import { BrandTabs } from '../brand/BrandTabs';
import { resolveBrands, type BrandCardData } from '../brand/types';
import { Bits, HeroArt, Medallion, MotifGlyph, Ribbon, hasRibbon, type ResolvedMotif } from '../art/motifs';
import { ItemIcon, SlotIcon, hasIcon } from '../icons';
import { Buttons, Heading, Html, Picture, SectionHeading, SmartLink } from '../primitives';
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


/** The section's own background set in the panel (colour and / or image), as inline style. */
function backgroundStyle(bg: SectionBackground | undefined): Record<string, string> {
  if (!bg) return {};
  const style: Record<string, string> = {};
  if (bg.color) style.backgroundColor = bg.color;
  if (bg.image.url) {
    style.backgroundImage = `url(${cssUrl(bg.image.url)})`;
    style.backgroundPosition = 'center';
    style.backgroundRepeat = bg.fit === 'repeat' ? 'repeat' : 'no-repeat';
    if (bg.fit !== 'repeat') style.backgroundSize = bg.fit;
  }
  return style;
}

type StyledSection = { layout?: SectionLayout; background?: SectionBackground };

/**
 * Colours of a section's parts set in the panel: for each colour set, a class on the section (bx-<part>-<role>)
 * and its value as a CSS variable (--bx-<part>-<role>), which page.css applies to that part. A colour left empty
 * adds nothing, so the part keeps the page's own look. Values are validated hex colours (HTML- and JSON-safe).
 */
export function colorHooks(colors: Record<string, ColorBox> | undefined): { classes: string; vars: Record<string, string> } {
  const classes: string[] = [];
  const vars: Record<string, string> = {};
  for (const [part, box] of Object.entries(colors ?? {})) {
    for (const [role, value] of Object.entries(box)) {
      if (!value) continue;
      classes.push(`bx-${part}-${role}`);
      vars[`--bx-${part}-${role}`] = value;
    }
  }
  return { classes: classes.join(' '), vars };
}

/** Spacing and background of a section, as inline style (nothing when both are left to the theme). */
export function sectionStyle(section: StyledSection): CSSProperties | undefined {
  const style = { ...(layoutStyle(section.layout) as Record<string, string> | undefined), ...backgroundStyle(section.background) };
  return Object.keys(style).length ? (style as CSSProperties) : undefined;
}

/** HTML level of a section heading set in the panel: h1 only in the hero banner (its default), otherwise h2–h6 (default h2). */
export const headingLevelOf = (section: { type: string; headingLevel?: number }) =>
  section.type === 'hero' ? (section.headingLevel ?? 1) : Math.max(2, section.headingLevel ?? 2);
/** Level of card titles / questions inside a section (default h3). */
const itemLevelOf = (section: { itemHeadingLevel?: number }) => Math.max(2, section.itemHeadingLevel ?? 3);
/**
 * A tag chosen in the panel also sets the size, on one scale for the whole page (hs-1 largest … hs-6 smallest).
 * With no tag chosen the heading keeps its section's own look.
 */
const headingSize = (section: { type: string; headingLevel?: number }) => (section.headingLevel ? ` hs-${headingLevelOf(section)}` : '');
const itemSize = (section: { itemHeadingLevel?: number }) => (section.itemHeadingLevel ? ` hs-${itemLevelOf(section)}` : '');

function Shell({
  section,
  tone,
  children,
  className = '',
  colors,
}: {
  section: { id: string; anchor: string; type: string } & StyledSection;
  tone?: string;
  children: ReactNode;
  className?: string;
  /** Colours of the section's parts, set in the panel. */
  colors?: Record<string, ColorBox>;
}) {
  const painted = colorHooks(colors);
  const style = { ...(sectionStyle(section) as Record<string, string> | undefined), ...painted.vars };
  return (
    <section
      id={section.anchor || undefined}
      data-section={section.type}
      data-section-id={section.id}
      className={`section tone-${tone ?? 'transparent'} ${className}${painted.classes ? ` ${painted.classes}` : ''}`}
      style={Object.keys(style).length ? (style as CSSProperties) : undefined}
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
  const { slides, height, autoplayMs, showTrustBar, trustItems, desktopSize, mobileSize } = section.props;
  if (slides.length === 0) return null;
  const level = headingLevelOf(section);

  const renderSlide = (s: (typeof slides)[number], i: number) => {
    const hasImage = Boolean(s.desktopImage.url);
    const artwork = s.artwork === 'auto' ? ctx.motif : s.artwork;
    /** The built-in illustration of this slide, or null when it is set to none. */
    const art = artwork === 'none' ? null : artwork;
    const decoMotif = art ?? ctx.motif;
    const showArt = Boolean(s.artImage.url) || art !== null;
    const side = Boolean(s.sideImage.url) || s.showCard;
    const buttons = s.buttons.filter((b) => b.label);
    const hasText = Boolean(s.heading || s.subheading || s.eyebrow);
    const copy = (hasText || buttons.length > 0) && (
      <div className={`hero-copy align-${s.copyAlign}`}>
        {s.eyebrow && <p className="hero-eyebrow">{s.eyebrow}</p>}
        {/* One heading per banner: the first slide's, at the level set in the panel. */}
        {s.heading &&
          (i === 0 ? (
            <Heading level={level} className={`hero-heading${headingSize(section)}`}>
              {s.heading}
            </Heading>
          ) : (
            <p className="hero-heading">{s.heading}</p>
          ))}
        {s.subheading && <p className="hero-sub">{s.subheading}</p>}
        <Buttons buttons={buttons} align={s.copyAlign} className="hero-buttons" />
      </div>
    );

    const inner = hasImage ? (
      <>
        <Picture desktop={s.desktopImage} mobile={s.mobileImage} priority={ctx.index === 0 && i === 0} className="hero-img" />
        {copy && (
          <div className={`hero-scrim pos-${s.copyPosition} align-${s.copyAlign} ${hasText ? '' : 'buttons-only'}`}>
            <div className="container">{copy}</div>
          </div>
        )}
      </>
    ) : (
      <>
        {s.showBand && <span className="hero-band" aria-hidden />}
        {s.showDecorations && hasRibbon(decoMotif) && !s.artImage.url && <Ribbon className="hero-ribbon" />}
        {s.showDecorations && <Bits motif={decoMotif} />}
        <div className={`container hero-stage ${side ? '' : 'no-side'} ${showArt ? '' : 'no-art'}`}>
          {s.artImage.url ? (
            <span className="hero-medallion hero-art-img">
              <Picture desktop={s.artImage} priority={ctx.index === 0 && i === 0} />
            </span>
          ) : (
            art && <HeroArt motif={art} className="hero-medallion" />
          )}
          {copy}
          {s.sideImage.url ? (
            <span className="hero-side-img">
              <Picture desktop={s.sideImage} />
            </span>
          ) : (
            s.showCard && <GiftPhone motif={decoMotif} title={s.cardTitle} greeting={s.cardText} brands={ctx.featured} />
          )}
        </div>
      </>
    );

    // The banner image is shown in the shape of the size chosen in the panel (desktop, and phone when a phone
    // image is set), so an image uploaded at that size is never cropped.
    const ratio = (size: { width: number; height: number }) => `${size.width} / ${size.height}`;
    const frameStyle = hasImage
      ? ({ '--banner-ratio': ratio(desktopSize), '--banner-ratio-m': ratio(s.mobileImage.url ? mobileSize : desktopSize) } as CSSProperties)
      : undefined;
    const cls = `hero-frame h-${height} ${hasImage ? 'has-image' : 'no-image'} ${!hasImage && !s.showBand ? 'no-band' : ''} ${s.href ? 'has-link' : ''}`;
    return (
      <div key={s.id} className={cls} style={frameStyle}>
        {/* The whole banner links to the slide link, under the buttons (which have their own links). */}
        {s.href && <SmartLink href={s.href} className="hero-link" ariaLabel={s.heading || s.desktopImage.alt || 'Open offer'} />}
        {inner}
      </div>
    );
  };

  return (
    <section id={section.anchor || undefined} data-section="hero" data-section-id={section.id} className="section-hero" style={sectionStyle(section)}>
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
                <span className={`trust-icon ${t.image.url ? 'has-image' : ''}`}>
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
        {p.heading && (
          <Heading level={headingLevelOf(section)} className={`intro-title${headingSize(section)}`}>
            {p.heading}
          </Heading>
        )}
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
    <Shell section={section} tone={p.tone} colors={p.colors}>
      <SectionHeading heading={p.heading} subheading={p.subheading} ornament={p.showOrnament} level={headingLevelOf(section)} size={headingSize(section)} />
      <ul
        className={`features card-${p.cardStyle} text-${p.textAlign} ${p.animation ? '' : 'no-anim'}`}
        style={{ '--cols': p.columns } as CSSProperties}
      >
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
            {f.title && (
              <Heading level={itemLevelOf(section)} className={`feature-title${itemSize(section)}`}>
                {f.title}
              </Heading>
            )}
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
    <Shell section={section} className="section-brands" colors={p.colors}>
      <SectionHeading heading={p.heading} subheading={p.subheading} ornament={p.showOrnament} level={headingLevelOf(section)} size={headingSize(section)} />
      <BrandCollection
        brands={brands}
        layout={p.layout}
        look={{ arrows: p.arrows, cardStyle: p.cardStyle, cardSize: p.cardSize, cardCorners: p.cardCorners }}
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
    <Shell section={section} className="section-tabs" colors={p.colors}>
      <SectionHeading heading={p.heading} subheading={p.subheading} ornament={p.showOrnament} level={headingLevelOf(section)} size={headingSize(section)} />
      <BrandTabs
        tabs={tabs}
        ctaLabel={p.ctaLabel}
        labels={ctx.labels}
        id={section.id}
        icons={{ discount: p.discountIcon, cta: p.ctaIcon }}
        layout={p.layout}
        look={{ arrows: p.arrows, cardStyle: p.cardStyle, cardSize: p.cardSize, cardCorners: p.cardCorners }}
      />
    </Shell>
  );
};

/* ---------- Categories ---------- */
export const CategoriesSection: SectionComponent<'categories'> = ({ section, ctx }) => {
  const p = section.props;
  if (!p.items.length) return null;
  return (
    <Shell section={section}>
      <SectionHeading heading={p.heading} subheading={p.subheading} ornament={p.showOrnament} level={headingLevelOf(section)} size={headingSize(section)} />
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
      <SectionHeading heading={p.heading} ornament={p.showOrnament} level={headingLevelOf(section)} size={headingSize(section)} />
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
          <Heading level={headingLevelOf(section)} className={`rich-text-title${headingSize(section)}`}>
            {p.showMark && <span className="rich-text-mark" aria-hidden />}
            <SlotIcon slot={p.headingIcon} size={22} className="heading-icon" />
            {p.heading}
          </Heading>
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
    <Shell section={section} className="section-faq" colors={p.colors}>
      <div className={`faq-layout ${hasAside ? '' : 'no-aside'}`}>
        {hasAside && (
          <aside className="faq-aside">
            {p.eyebrow && <p className="eyebrow">{p.eyebrow}</p>}
            {p.heading && (
              <Heading level={headingLevelOf(section)} className={`faq-title${headingSize(section)}`}>
                {p.heading}
              </Heading>
            )}
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
                <Heading level={itemLevelOf(section)} className={`faq-question${itemSize(section)}`}>
                  {q.question}
                </Heading>
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
    <Heading level={headingLevelOf(section)} className={`terms-title${headingSize(section)}`}>
      <SlotIcon slot={p.headingIcon} size={18} /> {p.heading || 'Terms & Conditions'}
    </Heading>
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
  if (!p.heading && !p.text && !p.buttons.some((b) => b.label)) return null;
  return (
    <Shell section={section}>
      <div className={`cta tone-${p.tone} ${p.backgroundImage.url ? 'has-bg' : ''}`}>
        {p.backgroundImage.url && <Picture desktop={p.backgroundImage} className="cta-bg" />}
        <span className="cta-glow" aria-hidden />
        {!p.backgroundImage.url && p.showArt && <MotifGlyph motif={ctx.motif} size={200} className="cta-art" />}
        <div className="cta-copy">
          {p.heading && (
            <Heading level={headingLevelOf(section)} className={`cta-title${headingSize(section)}`}>
              {p.heading}
            </Heading>
          )}
          {p.text && <p>{p.text}</p>}
        </div>
        <Buttons buttons={p.buttons} align={p.buttonsAlign} className="cta-buttons" />
      </div>
    </Shell>
  );
};

/* ---------- Buttons (a row of buttons, anywhere on the page) ---------- */
export const ButtonsSection: SectionComponent<'buttons'> = ({ section }) => {
  const p = section.props;
  if (!p.buttons.some((b) => b.label)) return null;
  return (
    <Shell section={section} className="section-buttons">
      <Buttons buttons={p.buttons} align={p.align} />
    </Shell>
  );
};
