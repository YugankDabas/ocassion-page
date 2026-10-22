import { z } from 'zod';
import { BACKGROUND_FITS, colorSchema, imageSchema } from './primitives';

export const HEADING_FONTS = ['poppins', 'playfair', 'kalam'] as const;
export const BACKGROUND_PATTERNS = ['none', 'dots', 'rangoli', 'sparkle', 'hearts', 'snow'] as const;
export const CORNER_STYLES = ['sharp', 'soft', 'round'] as const;
/**
 * Illustration set used for the page's built-in artwork (hero medallion, gift
 * card, decorations). "auto" picks one that suits the background pattern.
 */
export const MOTIFS = [
  'auto', 'diya', 'rakhi', 'gift', 'hearts', 'rose', 'teddy', 'chocolate', 'cake', 'balloons',
  'colors', 'tree', 'moon', 'kite', 'sun', 'fireworks', 'flowers', 'rings', 'books', 'tricolor',
] as const;

export const themeSchema = z.object({
  primary: colorSchema.default('#8B1E2D'),
  onPrimary: colorSchema.default('#FFFFFF'),
  secondary: colorSchema.default('#F4B400'),
  accent: colorSchema.default('#E85D04'),
  background: colorSchema.default('#FFF8EC'),
  surface: colorSchema.default('#FFFFFF'),
  text: colorSchema.default('#2B1B12'),
  mutedText: colorSchema.default('#6B5B4E'),
  headingFont: z.enum(HEADING_FONTS).default('poppins'),
  pattern: z.enum(BACKGROUND_PATTERNS).default('none'),
  /** Your own page background image (optional), over the background colour and under the pattern. */
  backgroundImage: imageSchema.default({}),
  backgroundFit: z.enum(BACKGROUND_FITS).default('cover'),
  corners: z.enum(CORNER_STYLES).default('soft'),
  motif: z.enum(MOTIFS).default('auto'),
});

export type Theme = z.infer<typeof themeSchema>;
export type HeadingFont = (typeof HEADING_FONTS)[number];
export type BackgroundPattern = (typeof BACKGROUND_PATTERNS)[number];
export type Motif = (typeof MOTIFS)[number];
