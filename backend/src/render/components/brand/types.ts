import type { BrandRef, PublicBrand, SiteSettings } from '../../../contracts';

/** Editable interface texts passed down to the brand widgets. */
export type Labels = SiteSettings['labels'];

/** Everything a brand card shows, resolved from a brand reference and the brand library. */
export interface BrandCardData {
  id: string;
  name: string;
  logoUrl: string;
  href: string;
  discountPercent: number | null;
  discountText: string;
  category: string;
  redemption: PublicBrand['redemption'];
  minDenomination: number | null;
  badge: string;
}

export function discountText(b: Pick<PublicBrand, 'discountLabel' | 'discountPercent'>): string {
  if (b.discountLabel) return b.discountLabel;
  if (b.discountPercent !== null && b.discountPercent > 0) return `Save ${Number(b.discountPercent.toFixed(2))}%`;
  return '';
}

/** Resolve ordered brand references into card data, silently skipping missing / inactive brands. */
export function resolveBrands(refs: BrandRef[], brands: Record<string, PublicBrand>): BrandCardData[] {
  const out: BrandCardData[] = [];
  for (const ref of refs) {
    const b = brands[ref.brandId];
    if (!b) continue;
    out.push({
      id: b.id,
      name: b.name,
      logoUrl: b.logoUrl,
      href: ref.href || b.productUrl,
      discountPercent: b.discountPercent,
      discountText: discountText(b),
      category: b.category,
      redemption: b.redemption,
      minDenomination: b.minDenomination,
      badge: ref.badge,
    });
  }
  return out;
}
