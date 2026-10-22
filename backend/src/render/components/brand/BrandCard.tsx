import type { IconSlot } from '../../../contracts';
import { SlotIcon } from '../icons';
import type { BrandCardData, Labels } from './types';

/** Card faces for brands without a logo: a stable gradient per brand, mixed from the occasion theme so the grid matches the page. */
const mix = (a: string, b: string, pct: number) => `color-mix(in srgb, var(--c-${a}) ${pct}%, ${b.startsWith('#') ? b : `var(--c-${b})`})`;
const FACES = [
  [mix('primary', '#000', 78), mix('primary', 'accent', 70)],
  [mix('accent', '#000', 82), mix('accent', 'secondary', 55)],
  [mix('primary', 'accent', 45), mix('secondary', 'accent', 60)],
  ['#1e1e1e', mix('primary', '#1e1e1e', 55)],
  [mix('primary', '#000', 60), mix('accent', '#000', 88)],
  [mix('accent', 'primary', 65), mix('secondary', '#000', 86)],
] as const;

function face(name: string): readonly [string, string] {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FACES[h % FACES.length]!;
}

/** Up to two initials from alphanumeric words ("Marks & Spencer" → "MS"). */
function monogram(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [...(words[0] ?? '?').slice(0, 2)]).join('').toUpperCase();
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export interface BrandCardIcons {
  discount: IconSlot;
  cta: IconSlot;
}

/** One gift-card tile. The whole card links to the brand's voucher page on gyftr.com. */
export function BrandCard({
  brand,
  ctaLabel,
  position,
  labels,
  hidden,
  icons,
}: {
  brand: BrandCardData;
  ctaLabel: string;
  position?: number;
  labels: Labels;
  hidden?: boolean;
  /** Set in the panel per section: before the discount, after the button text. */
  icons: BrandCardIcons;
}) {
  const redemption = { ONLINE: labels.redeemOnline, OFFLINE: labels.redeemOffline, BOTH: labels.redeemBoth }[brand.redemption];
  const [from, to] = face(brand.name);
  const meta = [redemption, brand.minDenomination ? `${labels.priceFrom} ${inr.format(brand.minDenomination)}`.trim() : ''].filter(Boolean).join(' · ');
  return (
    <a
      className="brand-card"
      href={brand.href}
      data-brand={brand.name}
      data-category={brand.category}
      data-discount={brand.discountPercent ?? 0}
      hidden={hidden}
      data-position={position}
      aria-label={`${brand.name} gift card${brand.discountText ? `, ${brand.discountText}` : ''}`}
    >
      {/* The initials face is always there: shown when there is no logo, or when the logo fails to load (page script). */}
      <span className={`gift-face ${brand.logoUrl ? 'has-logo' : ''}`} style={{ '--face-from': from, '--face-to': to } as React.CSSProperties}>
        {brand.badge && <span className="brand-badge">{brand.badge}</span>}
        {brand.logoUrl && (
          <span className="gift-logo">
            <img src={brand.logoUrl} alt="" loading="lazy" decoding="async" />
          </span>
        )}
        <span className="gift-chip" aria-hidden />
        <span className="gift-initials" aria-hidden>
          {monogram(brand.name)}
        </span>
        <span className="gift-face-name" aria-hidden>
          {brand.name}
        </span>
        {labels.cardBrandMark && (
          <span className="gift-mark" aria-hidden>
            {labels.cardBrandMark}
          </span>
        )}
        <span className="gift-shine" aria-hidden />
      </span>

      <span className="brand-body">
        <span className="brand-name">{brand.name}</span>
        {meta && <span className="brand-meta">{meta}</span>}
        <span className="brand-foot">
          {/* An empty label leaves nothing behind: no empty pill, box or line anywhere on the card. */}
          {brand.discountText ? (
            <span className="brand-discount">
              <SlotIcon slot={icons.discount} size={14} /> {brand.discountText}
            </span>
          ) : (
            labels.noDiscount && <span className="brand-discount muted">{labels.noDiscount}</span>
          )}
          {ctaLabel && (
            <span className="brand-cta">
              {ctaLabel} <SlotIcon slot={icons.cta} size={14} />
            </span>
          )}
        </span>
      </span>
    </a>
  );
}
