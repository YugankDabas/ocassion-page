import { Children, type ReactNode } from 'react';

/**
 * Banner slider markup. CSS scroll-snap does the heavy lifting (swipe works
 * without JavaScript); the page script adds autoplay, arrows and dots.
 */
export function HeroCarousel({ autoplayMs, label, children }: { autoplayMs: number; label: string; children: ReactNode }) {
  const slides = Children.toArray(children);
  return (
    <div className="hero-carousel" role="region" aria-roledescription="carousel" aria-label={label} data-autoplay={autoplayMs}>
      <div className="hero-track">
        {slides.map((slide, i) => (
          <div key={i} className="hero-slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`}>
            {slide}
          </div>
        ))}
      </div>
      <button type="button" className="hero-arrow prev" aria-label="Previous slide">
        ‹
      </button>
      <button type="button" className="hero-arrow next" aria-label="Next slide">
        ›
      </button>
      <div className="hero-dots">
        {slides.map((_, i) => (
          <button key={i} type="button" aria-label={`Go to slide ${i + 1}`} aria-current={i === 0} />
        ))}
      </div>
    </div>
  );
}
