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
] as const;
export type IconName = (typeof ICONS)[number];

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
