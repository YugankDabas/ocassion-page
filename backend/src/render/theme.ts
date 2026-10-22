import type { CSSProperties } from 'react';
import type { Theme } from '../contracts';
import { cssUrl } from './cssUrl';

const RADIUS: Record<Theme['corners'], string> = { sharp: '4px', soft: '12px', round: '22px' };
const HEADING_FONT: Record<Theme['headingFont'], string> = {
  poppins: 'var(--font-poppins)',
  playfair: 'var(--font-playfair)',
  kalam: 'var(--font-kalam)',
};

/** Theme → CSS custom properties consumed by every section stylesheet. */
export function themeStyle(theme: Theme): CSSProperties {
  return {
    '--c-primary': theme.primary,
    '--c-on-primary': theme.onPrimary,
    '--c-secondary': theme.secondary,
    '--c-accent': theme.accent,
    '--c-bg': theme.background,
    '--c-surface': theme.surface,
    '--c-text': theme.text,
    '--c-muted': theme.mutedText,
    '--radius': RADIUS[theme.corners],
    '--font-heading': HEADING_FONT[theme.headingFont],
    ...(theme.backgroundImage.url
      ? {
          backgroundImage: `url(${cssUrl(theme.backgroundImage.url)})`,
          backgroundPosition: 'center top',
          backgroundRepeat: theme.backgroundFit === 'repeat' ? 'repeat' : 'no-repeat',
          ...(theme.backgroundFit === 'repeat' ? {} : { backgroundSize: theme.backgroundFit }),
        }
      : {}),
  } as CSSProperties;
}
