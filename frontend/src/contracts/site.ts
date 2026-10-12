import { z } from 'zod';
import { hrefSchema, iconItemSchema, imageSrcSchema, label, linkSchema, text } from './primitives';

/** Global header / footer chrome shared by every occasion page. */
export const siteSettingsSchema = z.object({
  header: z
    .object({
      /** Logo shown in the header. Empty = bundled GyFTR logo. */
      logoUrl: imageSrcSchema.default(''),
      /** Thin announcement strip above the header. Empty = hidden. */
      announcement: text(160).default('Instant delivery on WhatsApp & email  ·  1 Loyalty Point = ₹1'),
      voucherStatusUrl: hrefSchema.default('https://www.gyftr.com/check-voucher-status'),
      voucherStatusLabel: label('Check voucher status', 40),
      homeUrl: hrefSchema.default('https://www.gyftr.com/'),
      searchUrl: hrefSchema.default('https://www.gyftr.com/search?q='),
      searchPlaceholder: label('Search brands, categories…', 60),
      searchButtonLabel: label('Search', 20),
      loginUrl: linkSchema.default({ label: 'Log In / Sign Up', href: 'https://www.gyftr.com/login' }),
      cartUrl: hrefSchema.default('https://www.gyftr.com/cart'),
      links: z.array(linkSchema).max(20).default([]),
    })
    .default({}),
  footer: z
    .object({
      /** Logo shown in the footer. Empty = bundled white GyFTR logo. */
      logoUrl: imageSrcSchema.default(''),
      tagline: label('India’s favourite gift card destination. Save on 300+ top brands and gift happiness in seconds.', 240),
      promises: z
        .array(iconItemSchema)
        .max(6)
        .default([
          { id: 'promise-1', icon: 'zap', title: 'Instant delivery', text: 'On WhatsApp & email' },
          { id: 'promise-2', icon: 'lock', title: '100% secure', text: 'Trusted payments' },
          { id: 'promise-3', icon: 'coins', title: 'Loyalty points', text: '1 point = ₹1' },
          { id: 'promise-4', icon: 'gift', title: '300+ brands', text: 'Across 20+ categories' },
        ]),
      columns: z
        .array(z.object({ title: text(60), links: z.array(linkSchema).max(15).default([]) }))
        .max(6)
        .default([]),
      copyright: text(200),
    })
    .default({}),
  /** Small pieces of interface text used across every page. */
  labels: z
    .object({
      breadcrumbHome: label('Home', 30),
      breadcrumbParent: label('Occasions', 40),
      brandSearchPlaceholder: label('Search brands…', 60),
      filterAll: label('All', 20),
      viewMore: label('View more', 30),
      noResults: label('No gift cards match your filters.', 120),
      comingSoon: label('Gift cards coming soon.', 120),
      noDiscount: label('Gift card', 30),
      redeemOnline: label('Online', 30),
      redeemOffline: label('In-store', 30),
      redeemBoth: label('Online & in-store', 40),
      priceFrom: label('From', 20),
      readMore: label('Read more', 30),
      readLess: label('Read less', 30),
      cardBrandMark: label('GyFTR', 20),
    })
    .default({}),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;
