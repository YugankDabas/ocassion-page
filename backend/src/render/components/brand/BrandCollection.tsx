import { brandFilterLabel, brandMatchesFilter, type BrandFilter } from '../../../contracts';
import { BrandCard } from './BrandCard';
import type { BrandCardData, Labels } from './types';

interface Props {
  brands: BrandCardData[];
  layout: 'grid' | 'carousel';
  initialCount: number;
  showSearch: boolean;
  showDiscountFilter: boolean;
  /** Filter chips after "All" (discount ranges, categories), as set in the panel. */
  filters: BrandFilter[];
  hideEmptyFilters: boolean;
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
export function BrandCollection({ brands, layout, initialCount, showSearch, showDiscountFilter, filters: allFilters, hideEmptyFilters, ctaLabel, labels, id }: Props) {
  if (brands.length === 0) return null;
  const isCarousel = layout === 'carousel';
  const filters = allFilters.filter((f) => !hideEmptyFilters || brands.some((b) => brandMatchesFilter(f, b)));
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
      {labels.noResults && (
        <p className="brand-empty" role="status" hidden>
          {labels.noResults}
        </p>
      )}
    </div>
  );
}
