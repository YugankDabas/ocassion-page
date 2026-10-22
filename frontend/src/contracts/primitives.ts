import { z } from 'zod';

/** Slugs used in public URLs: lowercase words separated by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens only');

/**
 * A link target an editor is allowed to enter. Only http(s) absolute URLs,
 * site-relative paths ("/amazon") and in-page anchors ("#faq") are accepted.
 * Protocol-relative ("//evil.com"), javascript:, data: and friends are rejected.
 */
export function isSafeHref(value: string): boolean {
  if (value === '') return true;
  if (value.startsWith('#')) return /^#[A-Za-z0-9_-]{1,80}$/.test(value);
  if (value.startsWith('/')) return !value.startsWith('//') && !/[\s\\]/.test(value);
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export const hrefSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(isSafeHref, 'Enter an https:// URL, a path starting with "/", or an #anchor');

/** Image sources must be absolute http(s) URLs or site-relative paths. */
export function isSafeImageSrc(value: string): boolean {
  if (value === '') return true;
  if (value.startsWith('/')) return !value.startsWith('//');
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export const imageSrcSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(isSafeImageSrc, 'Enter an https:// image URL or upload an image');

export const imageSchema = z.object({
  url: imageSrcSchema.default(''),
  alt: z.string().trim().max(200).default(''),
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional(),
});
export type Image = z.infer<typeof imageSchema>;

export const linkSchema = z.object({
  label: z.string().trim().max(80).default(''),
  href: hrefSchema.default(''),
});
export type Link = z.infer<typeof linkSchema>;

export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
export const colorSchema = z.string().trim().regex(HEX_COLOR, 'Use a hex colour like #B8860B');

/** Plain text field with sane bounds. */
export const text = (max = 200) => z.string().trim().max(max).default('');

/** Rich text (HTML). Sanitised server-side before it is ever stored or served. */
export const html = (max = 50_000) => z.string().max(max).default('');

/** Plain text field that starts with a default but can be changed (or emptied to hide it). */
export const label = (fallback: string, max = 120) => z.string().trim().max(max).default(fallback);

/** Built-in line icons editors can pick from (drawn by the renderer). */
export const ICONS = [
  'zap', 'ticket', 'coins', 'shield', 'lock', 'gift', 'sparkles', 'message', 'mail', 'check',
  'search', 'cart', 'user', 'heart', 'star', 'truck', 'clock', 'phone', 'tag', 'percent',
  'arrowRight', 'chevronDown', 'plus', 'chevronLeft', 'chevronRight',
] as const;
export type IconName = (typeof ICONS)[number];

/**
 * An icon a section draws (a heading icon, a button arrow, a toggle, ...), chosen in the panel: one of the
 * built-in icons, 'none' to leave it out, or an uploaded image that replaces it.
 */
export const iconSlot = (fallback: IconName | 'none') =>
  z
    .object({
      name: z.enum(['none', ...ICONS]).default(fallback),
      image: imageSchema.default({}),
    })
    .default({});
export type IconSlot = z.infer<ReturnType<typeof iconSlot>>;

/** Stable id for list items so drag-and-drop and React keys survive reorders. */
export const itemIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

/** Icon + title + one line of text (trust bar, footer promises). An uploaded image replaces the icon. */
export const iconItemSchema = z.object({
  id: itemIdSchema,
  icon: z.enum(ICONS).default('sparkles'),
  image: imageSchema.default({}),
  title: text(60),
  text: text(120),
});
export type IconItem = z.infer<typeof iconItemSchema>;

/** A colour that may be left empty (= the default). */
export const optionalColor = z.union([colorSchema, z.literal('')]).default('');

/** Colours of one part of a section (a card, a pill, an arrow…); each one left empty keeps the page's own look. */
export const colorBoxSchema = z
  .object({
    background: optionalColor,
    border: optionalColor,
    /** Text or icon colour. */
    text: optionalColor,
  })
  .default({});
export type ColorBox = z.infer<typeof colorBoxSchema>;
export type ColorRole = keyof ColorBox;

/** The colours of the parts of a section, set in the panel: one ColorBox per part. */
export function colorPartsSchema<const K extends string>(parts: readonly K[]) {
  // Every part has its own default, so {} is a valid value (the generic parts hide that from the type checker).
  return z.object(Object.fromEntries(parts.map((p) => [p, colorBoxSchema])) as Record<K, typeof colorBoxSchema>).default({} as never);
}

/** An image size in px: what to upload, and the shape it is shown in (never cropped). */
export const sizeSchema = z.object({
  width: z.number().int().min(50).max(4000),
  height: z.number().int().min(20).max(4000),
});
export type Size = z.infer<typeof sizeSchema>;

/** Whether an image is exactly this size. An image whose size is not known (no width or height) is not judged. */
export function fitsSize(image: { width?: number; height?: number }, size: Size): boolean {
  return !image.width || !image.height || (image.width === size.width && image.height === size.height);
}

/** The size of an image as a banner size, if it can be one (between 50×20 and 4000×4000 px). */
export function sizeOfImage(image: { url?: string; width?: number; height?: number } | null | undefined): Size | undefined {
  if (!image?.url || !image.width || !image.height) return undefined;
  const parsed = sizeSchema.safeParse({ width: image.width, height: image.height });
  return parsed.success ? parsed.data : undefined;
}

/** Looks a button can have: the theme colour, GyFTR green, white, dark, or an outline. */
export const BUTTON_STYLES = ['theme', 'gyftr', 'light', 'dark', 'outline'] as const;
export const BUTTON_SIZES = ['small', 'medium', 'large'] as const;

/** A button: text, link, look, size and icon. */
export const buttonSchema = z.object({
  id: itemIdSchema,
  label: text(40),
  href: hrefSchema.default(''),
  style: z.enum(BUTTON_STYLES).default('theme'),
  size: z.enum(BUTTON_SIZES).default('medium'),
  icon: iconSlot('arrowRight'),
  /** Open the link in a new tab. */
  newTab: z.boolean().default(false),
});
export type Button = z.infer<typeof buttonSchema>;
export const buttonsSchema = z.array(buttonSchema).max(6).default([]);

/** Where buttons sit in their row. */
export const ALIGNMENTS = ['left', 'center', 'right'] as const;

/** A section's own background (empty = the theme's). The image is shown whole or tiled, never stretched. */
export const BACKGROUND_FITS = ['cover', 'contain', 'repeat'] as const;
export const sectionBackgroundSchema = z.object({
  color: optionalColor,
  image: imageSchema.default({}),
  fit: z.enum(BACKGROUND_FITS).default('cover'),
});
export type SectionBackground = z.infer<typeof sectionBackgroundSchema>;
