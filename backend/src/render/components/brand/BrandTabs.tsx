import { BrandCard, type BrandCardIcons } from './BrandCard';
import { Arrow, lookClasses, type BrandListLook } from './BrandCollection';
import type { BrandCardData, Labels } from './types';

export interface TabData {
  id: string;
  label: string;
  emoji: string;
  brands: BrandCardData[];
}

/** Accessible tablist markup (first tab open). The page script handles clicks and arrow-key navigation. */
export function BrandTabs({
  tabs,
  ctaLabel,
  labels,
  id,
  icons,
  layout,
  look,
}: {
  tabs: TabData[];
  ctaLabel: string;
  labels: Labels;
  id: string;
  icons: BrandCardIcons;
  /** Rows of cards, or a single row that scrolls sideways with arrows (handled by the page script's brand list). */
  layout: 'grid' | 'carousel';
  look: BrandListLook;
}) {
  return (
    <div className="brand-tabs">
      <div className="tablist" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${id}-${i}`}
            aria-selected={i === 0}
            aria-controls={`panel-${id}-${i}`}
            tabIndex={i === 0 ? 0 : -1}
            className="tab"
          >
            {t.emoji && <span aria-hidden>{t.emoji} </span>}
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.id} role="tabpanel" id={`panel-${id}-${i}`} aria-labelledby={`tab-${id}-${i}`} hidden={i !== 0}>
          {t.brands.length && layout === 'carousel' ? (
            <div className={`brand-collection ${lookClasses(look)}`}>
              <div className="carousel">
                <Arrow dir="prev" arrows={look.arrows} />
                <div className="carousel-track" tabIndex={0} aria-label="Gift cards">
                  {t.brands.map((b, j) => (
                    <BrandCard key={b.id} brand={b} ctaLabel={ctaLabel} position={j + 1} labels={labels} icons={icons} />
                  ))}
                </div>
                <Arrow dir="next" arrows={look.arrows} />
              </div>
            </div>
          ) : t.brands.length ? (
            <div className={`brand-tab-list ${lookClasses(look)}`}>
              <div className="brand-grid">
                {t.brands.map((b, j) => (
                  <BrandCard key={b.id} brand={b} ctaLabel={ctaLabel} position={j + 1} labels={labels} icons={icons} />
                ))}
              </div>
            </div>
          ) : (
            labels.comingSoon && <p className="brand-empty">{labels.comingSoon}</p>
          )}
        </div>
      ))}
    </div>
  );
}
