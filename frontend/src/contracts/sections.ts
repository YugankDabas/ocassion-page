import { z } from 'zod';
import { hrefSchema, html, iconItemSchema, iconSlot, imageSchema, itemIdSchema, label, linkSchema, text } from './primitives';
import { MOTIFS } from './theme';

/**
 * Page sections. Every section shares an envelope (id, type, visibility, anchor)
 * and carries type-specific `props`. To add a new section type:
 *   1. add its props schema + entry in `sectionSchema` below,
 *   2. register a handler in the API (SectionRegistry),
 *   3. register an editor in the admin panel and a renderer in src/render.
 * Nothing else needs to change (Open/Closed).
 */

const anchorSchema = z
  .string()
  .trim()
  .max(60)
  .regex(/^[a-z0-9-]*$/, 'Lowercase letters, numbers and hyphens only')
  .default('');

/** Space in px (as on a desktop screen); empty = the section's built-in spacing. */
const spaceSchema = z.number().int().min(0).max(400).nullable().optional();

/**
 * Spacing of a section, set per section in the panel. Padding is the space inside the section
 * (between its edge and its content); margin is the distance to the sections around it.
 */
export const sectionLayoutSchema = z.object({
  paddingTop: spaceSchema,
  paddingBottom: spaceSchema,
  marginTop: spaceSchema,
  marginBottom: spaceSchema,
  /** Space between the section heading and its content (sections with a shared heading only). */
  headingGap: spaceSchema,
});
export type SectionLayout = z.infer<typeof sectionLayoutSchema>;

const envelope = {
  id: itemIdSchema,
  visible: z.boolean().default(true),
  anchor: anchorSchema,
  /** Name in the panel's section list only (never shown on the page). Empty = the section's heading. */
  name: z.string().trim().max(80).optional(),
  /** Spacing; empty = the section's built-in spacing. */
  layout: sectionLayoutSchema.optional(),
};

const toneSchema = z.enum(['primary', 'surface', 'accent', 'transparent']).default('surface');
/** The small decorative line under a section heading. */
const showOrnament = z.boolean().default(true);
const alignSchema = z.enum(['left', 'center']).default('center');
const brandIdSchema = z.string().uuid();

/* ---------- Hero banner carousel ---------- */
export const heroSlideSchema = z.object({
  id: itemIdSchema,
  desktopImage: imageSchema.default({}),
  mobileImage: imageSchema.default({}),
  href: hrefSchema.default(''),
  eyebrow: text(80),
  heading: text(140),
  subheading: text(240),
  ctaLabel: text(40),
  /** Greeting on the illustrated gift card (shown when the slide has no banner image), e.g. "Happy Diwali". */
  cardText: text(40),
  /** Title printed on the illustrated gift card. */
  cardTitle: label('Gift Card', 30),
  /** Built-in illustration for this slide. "auto" uses the artwork chosen in the page theme. */
  artwork: z.enum(MOTIFS).default('auto'),
  /** Your own illustration (transparent PNG / WebP works best) shown instead of the built-in artwork. */
  artImage: imageSchema.default({}),
  /** Your own image shown instead of the gift-card phone on the right. */
  sideImage: imageSchema.default({}),
  /** Show the gift-card phone (ignored when a side image is set). */
  showCard: z.boolean().default(true),
  /** Ribbon and floating sparkles / confetti around the banner. */
  showDecorations: z.boolean().default(true),
});
export const heroPropsSchema = z.object({
  slides: z.array(heroSlideSchema).max(10).default([]),
  autoplayMs: z.number().int().min(0).max(20_000).default(5000),
  height: z.enum(['compact', 'standard', 'tall']).default('standard'),
  /** Arrow after each slide's button text. */
  ctaIcon: iconSlot('arrowRight'),
  /** GyFTR trust strip under the banner (instant delivery, secure payments, ...). */
  showTrustBar: z.boolean().default(true),
  trustItems: z
    .array(iconItemSchema)
    .max(6)
    .default([
      { id: 'trust-1', icon: 'zap', title: 'Instant delivery', text: 'WhatsApp & email in minutes' },
      { id: 'trust-2', icon: 'ticket', title: 'Upfront savings', text: 'Discounts on 300+ brands' },
      { id: 'trust-3', icon: 'coins', title: 'Loyalty points', text: '1 point = ₹1 on every order' },
      { id: 'trust-4', icon: 'shield', title: 'Safe & secure', text: 'Trusted by millions' },
    ]),
});

/* ---------- Intro block (heading + rich text) ---------- */
export const introPropsSchema = z.object({
  eyebrow: text(80),
  heading: text(160),
  body: html(10_000),
  align: alignSchema,
  tone: toneSchema,
  showOrnament,
  /** The two occasion medallions at the sides (with the theme-colour background). */
  showDecorations: z.boolean().default(true),
});

/* ---------- Feature / USP highlights ---------- */
export const featureItemSchema = z.object({
  id: itemIdSchema,
  icon: imageSchema.default({}),
  emoji: text(8),
  title: text(80),
  description: text(400),
});
export const featuresPropsSchema = z.object({
  heading: text(160),
  subheading: text(300),
  columns: z.number().int().min(2).max(5).default(4),
  items: z.array(featureItemSchema).max(12).default([]),
  tone: toneSchema,
  /** The large 01, 02, ... in the corner of each card. */
  showNumbers: z.boolean().default(true),
  showOrnament,
});

/* ---------- Brand grid / carousel ---------- */
export const brandRefSchema = z.object({
  brandId: brandIdSchema,
  badge: text(30),
  /** Optional per-placement override of the brand's voucher page URL (e.g. with UTM params). */
  href: hrefSchema.default(''),
});
/**
 * A filter chip above a brand grid: a discount range or a brand category.
 *   - discount: a brand matches when its discount is above `min` and up to (and including) `max`; an empty
 *     `max` means no upper limit. Consecutive ranges leave no gaps: 0–5, 5–10, 10–25, 25+ put every
 *     discount in exactly one filter.
 *   - category: a brand matches when its category (set on the Brands page) is `category`, ignoring case.
 */
export const brandFilterSchema = z
  .object({
    id: itemIdSchema,
    kind: z.enum(['discount', 'category']).default('discount'),
    /** Chip text; empty = written from the range ("Up to 5%", "5% – 10%", "Above 25%") or the category. */
    label: text(30),
    min: z.number().min(0).max(100).default(0),
    max: z.number().min(0).max(100).nullable().default(null),
    category: text(60),
  })
  .refine((f) => f.kind !== 'discount' || f.max === null || f.max > f.min, { message: '"To" must be more than "From"', path: ['max'] })
  .refine((f) => f.kind !== 'category' || f.category.length > 0, { message: 'Choose a category', path: ['category'] });
export type BrandFilter = z.infer<typeof brandFilterSchema>;

export const DEFAULT_BRAND_FILTERS: BrandFilter[] = [
  { id: 'disc-0-5', kind: 'discount', label: '', min: 0, max: 5, category: '' },
  { id: 'disc-5-10', kind: 'discount', label: '', min: 5, max: 10, category: '' },
  { id: 'disc-10-25', kind: 'discount', label: '', min: 10, max: 25, category: '' },
  { id: 'disc-25', kind: 'discount', label: '', min: 25, max: null, category: '' },
];

/** The chip text for a filter: its own label, else written from its range or category. */
export function brandFilterLabel(f: Pick<BrandFilter, 'kind' | 'label' | 'min' | 'max' | 'category'>): string {
  if (f.label) return f.label;
  if (f.kind === 'category') return f.category;
  const pct = (n: number) => `${Number(n.toFixed(2))}%`;
  if (f.max === null) return `Above ${pct(f.min)}`;
  if (f.min === 0) return `Up to ${pct(f.max)}`;
  return `${pct(f.min)} – ${pct(f.max)}`;
}

/** Whether a brand shows under a filter. The page script applies the same rule in the browser. */
export function brandMatchesFilter(f: Pick<BrandFilter, 'kind' | 'min' | 'max' | 'category'>, brand: { discountPercent: number | null; category: string }): boolean {
  if (f.kind === 'category') return brand.category.trim().toLowerCase() === f.category.trim().toLowerCase();
  const discount = brand.discountPercent ?? 0;
  return discount > f.min && (f.max === null || discount <= f.max);
}

export const brandGridPropsSchema = z.object({
  heading: text(160),
  subheading: text(300),
  layout: z.enum(['grid', 'carousel']).default('grid'),
  brands: z.array(brandRefSchema).max(200).default([]),
  initialCount: z.number().int().min(4).max(60).default(12),
  showSearch: z.boolean().default(false),
  showDiscountFilter: z.boolean().default(false),
  /**
   * The filter chips (shown with showDiscountFilter), in order after "All": discount ranges and/or categories.
   * Named before category filters existed; kept so saved pages read the same.
   */
  discountFilters: z.array(brandFilterSchema).max(12).default(DEFAULT_BRAND_FILTERS),
  /** Leave out a filter no brand in this grid falls into. */
  hideEmptyFilters: z.boolean().default(false),
  ctaLabel: text(30),
  /** Icon before the discount on each card ("Save 5%"). */
  discountIcon: iconSlot('ticket'),
  /** Arrow after the card button text. */
  ctaIcon: iconSlot('arrowRight'),
  showOrnament,
});

/* ---------- Tabbed brand collections ("Who are you gifting?") ---------- */
export const brandTabSchema = z.object({
  id: itemIdSchema,
  label: z.string().trim().min(1).max(40),
  emoji: text(8),
  brands: z.array(brandRefSchema).max(60).default([]),
});
export const brandTabsPropsSchema = z.object({
  heading: text(160),
  subheading: text(300),
  tabs: z.array(brandTabSchema).max(12).default([]),
  ctaLabel: text(30),
  discountIcon: iconSlot('ticket'),
  ctaIcon: iconSlot('arrowRight'),
  showOrnament,
});

/* ---------- Category tiles ---------- */
export const categoryItemSchema = z.object({
  id: itemIdSchema,
  label: text(60),
  image: imageSchema.default({}),
  href: hrefSchema.default(''),
});
export const categoriesPropsSchema = z.object({
  heading: text(160),
  subheading: text(300),
  items: z.array(categoryItemSchema).max(24).default([]),
  /** Shown on a tile that has no image. */
  placeholderIcon: iconSlot('gift'),
  /** Arrow after the tile label (appears on hover). */
  linkIcon: iconSlot('arrowRight'),
  showOrnament,
});

/* ---------- Promotional image banners ---------- */
export const bannerItemSchema = z.object({
  id: itemIdSchema,
  desktopImage: imageSchema.default({}),
  mobileImage: imageSchema.default({}),
  href: hrefSchema.default(''),
});
export const imageBannersPropsSchema = z.object({
  heading: text(160),
  columns: z.number().int().min(1).max(3).default(2),
  items: z.array(bannerItemSchema).max(12).default([]),
  showOrnament,
});

/* ---------- Long-form rich text (SEO content) ---------- */
export const richTextPropsSchema = z.object({
  heading: text(160),
  body: html(),
  collapsible: z.boolean().default(true),
  tone: toneSchema,
  /** The coloured mark before the heading. */
  showMark: z.boolean().default(true),
  /** Icon before the heading. */
  headingIcon: iconSlot('none'),
});

/* ---------- FAQs ---------- */
export const faqItemSchema = z.object({
  id: itemIdSchema,
  question: text(300),
  answer: html(5000),
});
export const faqPropsSchema = z.object({
  heading: text(160),
  /** Side panel next to the questions. Empty fields are hidden. */
  eyebrow: label('Help centre', 60),
  intro: label('Everything you need to know about buying, sending and redeeming gift cards on GyFTR.', 300),
  helpTitle: label('Still have a question?', 80),
  helpText: label('Our support team is happy to help.', 160),
  helpHref: hrefSchema.default(''),
  items: z.array(faqItemSchema).max(50).default([]),
  emitStructuredData: z.boolean().default(true),
  /** Icon of the "Still have a question?" box. */
  helpIcon: iconSlot('message'),
  /** Open / close button of each question (turns when open). */
  toggleIcon: iconSlot('plus'),
  /** The 01, 02, ... before each question. */
  showNumbers: z.boolean().default(true),
  showOrnament,
});

/* ---------- Terms & conditions ---------- */
export const termsPropsSchema = z.object({
  heading: text(160),
  body: html(),
  collapsible: z.boolean().default(true),
  defaultOpen: z.boolean().default(false),
  /** Icon before the heading. */
  headingIcon: iconSlot('shield'),
  /** Open / close arrow (turns when open). */
  toggleIcon: iconSlot('chevronDown'),
});

/* ---------- Call to action ---------- */
export const ctaPropsSchema = z.object({
  heading: text(160),
  text: text(400),
  button: linkSchema.default({}),
  backgroundImage: imageSchema.default({}),
  tone: toneSchema,
  /** Arrow after the button text. */
  buttonIcon: iconSlot('arrowRight'),
  /** The occasion artwork in the corner (when there is no background image). */
  showArt: z.boolean().default(true),
});

export const sectionSchema = z.discriminatedUnion('type', [
  z.object({ ...envelope, type: z.literal('hero'), props: heroPropsSchema }),
  z.object({ ...envelope, type: z.literal('intro'), props: introPropsSchema }),
  z.object({ ...envelope, type: z.literal('features'), props: featuresPropsSchema }),
  z.object({ ...envelope, type: z.literal('brandGrid'), props: brandGridPropsSchema }),
  z.object({ ...envelope, type: z.literal('brandTabs'), props: brandTabsPropsSchema }),
  z.object({ ...envelope, type: z.literal('categories'), props: categoriesPropsSchema }),
  z.object({ ...envelope, type: z.literal('imageBanners'), props: imageBannersPropsSchema }),
  z.object({ ...envelope, type: z.literal('richText'), props: richTextPropsSchema }),
  z.object({ ...envelope, type: z.literal('faq'), props: faqPropsSchema }),
  z.object({ ...envelope, type: z.literal('terms'), props: termsPropsSchema }),
  z.object({ ...envelope, type: z.literal('cta'), props: ctaPropsSchema }),
]);

export type Section = z.infer<typeof sectionSchema>;
/** A section as written, before defaults are filled in (a template, a test). */
export type SectionInput = z.input<typeof sectionSchema>;
export type SectionType = Section['type'];
export type SectionOf<T extends SectionType> = Extract<Section, { type: T }>;
export type SectionProps<T extends SectionType> = SectionOf<T>['props'];
export type BrandRef = z.infer<typeof brandRefSchema>;

export const SECTION_TYPES = [
  'hero',
  'intro',
  'features',
  'brandGrid',
  'brandTabs',
  'categories',
  'imageBanners',
  'richText',
  'faq',
  'terms',
  'cta',
] as const satisfies readonly SectionType[];

/** Props schema lookup used to build defaults for a freshly added section. */
export const SECTION_PROPS_SCHEMAS = {
  hero: heroPropsSchema,
  intro: introPropsSchema,
  features: featuresPropsSchema,
  brandGrid: brandGridPropsSchema,
  brandTabs: brandTabsPropsSchema,
  categories: categoriesPropsSchema,
  imageBanners: imageBannersPropsSchema,
  richText: richTextPropsSchema,
  faq: faqPropsSchema,
  terms: termsPropsSchema,
  cta: ctaPropsSchema,
} as const satisfies { [K in SectionType]: z.ZodTypeAny };

export function defaultPropsFor<T extends SectionType>(type: T): SectionProps<T> {
  return SECTION_PROPS_SCHEMAS[type].parse({}) as SectionProps<T>;
}
