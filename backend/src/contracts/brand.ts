import { z } from 'zod';
import { hrefSchema, imageSrcSchema, slugSchema } from './primitives';

export const REDEMPTION_MODES = ['ONLINE', 'OFFLINE', 'BOTH'] as const;
export type RedemptionMode = (typeof REDEMPTION_MODES)[number];

export const brandInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  logoUrl: imageSrcSchema.default(''),
  /** Brand voucher page on gyftr.com that a click on the brand redirects to, e.g. https://www.gyftr.com/amazon */
  productUrl: hrefSchema.refine((v) => v !== '', 'Brand voucher page URL is required'),
  discountPercent: z.number().min(0).max(100).nullable().default(null),
  /** Free-text override, e.g. "Flat 12% off" or "Buy 1 Get 1". */
  discountLabel: z.string().trim().max(40).default(''),
  category: z.string().trim().max(60).default(''),
  redemption: z.enum(REDEMPTION_MODES).default('BOTH'),
  minDenomination: z.number().int().min(0).max(1_000_000).nullable().default(null),
  isActive: z.boolean().default(true),
});
export type BrandInput = z.infer<typeof brandInputSchema>;

/** Brand data as exposed to the public page renderer. */
export interface PublicBrand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
  productUrl: string;
  discountPercent: number | null;
  discountLabel: string;
  category: string;
  redemption: RedemptionMode;
  minDenomination: number | null;
}
