import { BrandCard } from './BrandCard';
import type { BrandCardData, Labels } from './types';

const BANDS = [
  { id: 'all', label: 'All', min: -1, max: Infinity },
  { id: '1-5', label: 'Up to 5%', min: 0.01, max: 5 },
  { id: '6-10', label: '6% – 10%', min: 5.01, max: 10 },
  { id: '11-25', label: '11% – 25%', min: 10.01, max: 25 },
  { id: '26+', label: '26% & above', min: 25.01, max: Infinity },
] as const;

interface Props {
  brands: BrandCardData[];
  layout: 'grid' | 'carousel';
  initialCount: number;
  showSearch: boolean;
  showDiscountFilter: boolean;
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
export function BrandCollection({ brands, layout, initialCount, showSearch, showDiscountFilter, ctaLabel, labels, id }: Props) {
  if (brands.length === 0) return null;
  const isCarousel = layout === 'carousel';
  const bands = BANDS.filter((b) => b.id === 'all' || brands.some((x) => (x.discountPercent ?? 0) >= b.min && (x.discountPercent ?? 0) <= b.max));
  const searchId = `brand-search-${id}`;

  return (
    <div className="brand-collection" data-initial={initialCount}>
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
          {showDiscountFilter && bands.length > 2 && (
            <div className="chips" role="group" aria-label="Filter by discount">
              {bands.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="chip"
                  aria-pressed={b.id === 'all'}
                  data-min={b.id === 'all' ? undefined : b.min}
                  data-max={Number.isFinite(b.max) ? b.max : undefined}
                >
                  {b.id === 'all' ? labels.filterAll || b.label : b.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isCarousel ? (
        <div className="carousel">
          <button type="button" className="carousel-btn prev" aria-label="Scroll left">
            ‹
          </button>
          <div className="carousel-track" tabIndex={0} aria-label="Gift cards">
            {brands.map((b, i) => (
              <BrandCard key={b.id} brand={b} ctaLabel={ctaLabel} position={i + 1} labels={labels} />
            ))}
          </div>
          <button type="button" className="carousel-btn next" aria-label="Scroll right">
            ›
          </button>
        </div>
      ) : (
        <>
          <div className="brand-grid" aria-live="polite">
            {brands.map((b, i) => (
              <BrandCard key={b.id} brand={b} ctaLabel={ctaLabel} position={i + 1} labels={labels} hidden={i >= initialCount} />
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
      <p className="brand-empty" role="status" hidden>
        {labels.noResults}
      </p>
    </div>
  );
}
