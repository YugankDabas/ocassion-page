import { z } from 'zod';
import { pageUrlSchema } from './page';
import { slugSchema } from './primitives';
import { themeSchema } from './theme';

export const occasionInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(2).max(120),
  /** Used inside generated template copy: "This {Diwali}, ..." */
  shortName: z.string().trim().min(2).max(60),
  recipients: z.string().trim().max(120).default('friends and family'),
  emoji: z.string().trim().max(8).default('🎁'),
  /** Default page URL for this occasion on gyftr.com (pre-fills new pages). */
  pageUrl: pageUrlSchema,
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  isActive: z.boolean().default(true),
  theme: themeSchema.default({}),
});
export type OccasionInput = z.infer<typeof occasionInputSchema>;
export const updateOccasionInputSchema = occasionInputSchema.partial();
