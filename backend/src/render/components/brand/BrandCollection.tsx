import type { CSSProperties } from 'react';
import { brandFilterLabel, brandMatchesFilter, type Arrows, type BrandFilter } from '../../../contracts';
import { SlotIcon, hasIcon } from '../icons';
import { BrandCard, type BrandCardIcons } from './BrandCard';
import type { BrandCardData, Labels } from './types';

/** How the cards look and, for a single row, its arrows (set in the panel per section). */
export interface BrandListLook {
  arrows: Arrows;
  cardStyle: 'elevated' | 'outlined' | 'flat' | 'plain';
  cardSize: 'compact' | 'standard' | 'large';
  cardCorners: 'square' | 'rounded' | 'round';
}

/** Classes on the list for the card look chosen in the panel. */
export const lookClasses = (look: BrandListLook) => `cards-${look.cardStyle} size-${look.cardSize} corners-${look.cardCorners}`;

/** An arrow of a single-row list: the icon (or image) set in the panel, at the size, shape and colour set there. */
export function Arrow({ dir, arrows }: { dir: 'prev' | 'next'; arrows: Arrows }) {
  const slot = arrows[dir];
  return (
    <button
      type="button"
      className={`carousel-btn ${dir} arrow-${arrows.shape} arrow-${arrows.color}`}
      style={{ '--arrow-size': `${arrows.size}px` } as CSSProperties}
      aria-label={dir === 'prev' ? 'Scroll left' : 'Scroll right'}
      // Hidden until the page script sees the row can scroll this way (and hidden again at either end).
      hidden
    >
      {hasIcon(slot) ? <SlotIcon slot={slot} size={Math.round(arrows.size * 0.5)} /> : dir === 'prev' ? '‹' : '›'}
    </button>
  );
}

interface Props {
  brands: BrandCardData[];
  layout: 'grid' | 'carousel';
  look: BrandListLook;
  initialCount: number;
  showSearch: boolean;
  showDiscountFilter: boolean;
  /** Filter chips after "All" (discount ranges, categories), as set in the panel. */
  filters: BrandFilter[];
  hideEmptyFilters: boolean;
  icons: BrandCardIcons;
  ctaLabel: string;
  labels: Labels;
  /** Unique per section; used for the search field's label. */
  id: string;
}

/**
 * Brand list with optional search, discount-band filter chips and "View more"
 * paging (grid) or a scroll-snap carousel. Every brand is in the markup (good
 * for SEO); the page script shows / hides cards as the visitor filters.
 */
export function BrandCollection({ brands, layout, look, initialCount, showSearch, showDiscountFilter, filters: allFilters, hideEmptyFilters, ctaLabel, labels, id, icons }: Props) {
  if (brands.length === 0) return null;
  const isCarousel = layout === 'carousel';
  const filters = allFilters.filter((f) => !hideEmptyFilters || brands.some((b) => brandMatchesFilter(f, b)));
  const searchId = `brand-search-${id}`;

  return (
    <div className={`brand-collection ${lookClasses(look)}`} data-initial={initialCount}>
      {(showSearch || showDiscountFilter) && (
        <div className="brand-tools">
          {showSearch && (
            <div className="brand-search">
              <label htmlFor={searchId} className="sr-only">
                {labels.brandSearchPlaceholder || 'Search brands'}
              </label>
              <input id={searchId} type="search" placeholder={labels.brandSearchPlaceholder} autoComplete="off" />
            </div>
          )}
          {showDiscountFilter && filters.length > 0 && (
            <div className="chips" role="group" aria-label="Filter gift cards">
              <button type="button" className="chip" aria-pressed>
                {labels.filterAll || 'All'}
              </button>
              {filters.map((f) =>
                f.kind === 'category' ? (
                  <button key={f.id} type="button" className="chip" aria-pressed={false} data-category={f.category.trim().toLowerCase()}>
                    {brandFilterLabel(f)}
                  </button>
                ) : (
                  <button key={f.id} type="button" className="chip" aria-pressed={false} data-min={f.min} data-max={f.max ?? undefined}>
                    {brandFilterLabel(f)}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      )}

      {isCarousel ? (
        <div className="carousel">
          <Arrow dir="prev" arrows={look.arrows} />
          <div className="carousel-track" tabIndex={0} aria-label="Gift cards">
            {brands.map((b, i) => (
              <BrandCard key={b.id} brand={b} ctaLabel={ctaLabel} position={i + 1} labels={labels} icons={icons} />
            ))}
          </div>
          <Arrow dir="next" arrows={look.arrows} />
        </div>
      ) : (
        <>
          <div className="brand-grid" aria-live="polite">
            {brands.map((b, i) => (
              <BrandCard key={b.id} brand={b} ctaLabel={ctaLabel} position={i + 1} labels={labels} hidden={i >= initialCount} icons={icons} />
            ))}
          </div>
          {brands.length > initialCount && (
            <div className="view-more">
              <button type="button" className="btn-outline" data-view-more>
                {labels.viewMore || 'View more'} (<span data-count>{brands.length - initialCount}</span>)
              </button>
            </div>
          )}
        </>
      )}
      {labels.noResults && (
        <p className="brand-empty" role="status" hidden>
          {labels.noResults}
        </p>
      )}
    </div>
  );
}
