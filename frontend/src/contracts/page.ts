import { z } from 'zod';
import { hrefSchema, imageSchema, text } from './primitives';
import { sectionSchema } from './sections';
import { themeSchema } from './theme';

export const CONTENT_SCHEMA_VERSION = 1 as const;

export const pageUrlSchema = z.string().trim().url('Enter the full page URL, e.g. https://www.gyftr.com/occasion/diwali-gift-cards').max(300);

export const seoSchema = z.object({
  metaTitle: text(70),
  metaDescription: text(170),
  keywords: text(300),
  ogImage: imageSchema.default({}),
  canonicalUrl: hrefSchema.default(''),
  noIndex: z.boolean().default(false),
});
export type Seo = z.infer<typeof seoSchema>;

export const breadcrumbSchema = z.object({
  show: z.boolean().default(true),
  label: text(80),
});

/** The full editable document behind a page (draft or published snapshot). */
export const pageContentSchema = z.object({
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION).default(CONTENT_SCHEMA_VERSION),
  theme: themeSchema.default({}),
  seo: seoSchema.default({}),
  breadcrumb: breadcrumbSchema.default({}),
  sections: z.array(sectionSchema).max(40).default([]),
});
export type PageContent = z.infer<typeof pageContentSchema>;

export const PAGE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

/* ---------- Admin API request bodies ---------- */

export const createPageInputSchema = z.object({
  occasionId: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  /** Full public URL the page is served at, e.g. https://www.gyftr.com/occasion/diwali-gift-cards */
  pageUrl: pageUrlSchema,
  /** "default" = occasion template factory, "blank" = empty, otherwise a saved template id. */
  templateId: z.union([z.literal('default'), z.literal('blank'), z.string().uuid()]).default('default'),
});
export type CreatePageInput = z.infer<typeof createPageInputSchema>;

export const updatePageDraftInputSchema = z.object({
  /** Optimistic concurrency: the draftVersion the editor loaded. */
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(2).max(160).optional(),
  pageUrl: pageUrlSchema.optional(),
  content: pageContentSchema,
});
export type UpdatePageDraftInput = z.infer<typeof updatePageDraftInputSchema>;

export const publishPageInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  note: z.string().trim().max(300).optional(),
});

export const duplicatePageInputSchema = z.object({
  title: z.string().trim().min(2).max(160),
  pageUrl: pageUrlSchema,
});

export const saveAsTemplateInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).default(''),
  occasionSpecific: z.boolean().default(true),
});
