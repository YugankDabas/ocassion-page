import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HeadingFont } from '../contracts';

const require = createRequire(import.meta.url);

/** Static files the renderer needs: the page stylesheet and the default GyFTR logos. */
function assetDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Source tree (src/render), bundled output (dist) and the process working directory.
  const candidates = [path.resolve(here, '../../assets/render'), path.resolve(here, '../assets/render'), path.resolve(process.cwd(), 'assets/render')];
  const found = candidates.find((dir) => existsSync(path.join(dir, 'page.css')));
  if (!found) throw new Error(`Render assets not found (looked in ${candidates.join(', ')})`);
  return found;
}

const dataUri = (file: string, type: string) => `data:${type};base64,${readFileSync(file).toString('base64')}`;

interface Face {
  family: string;
  pkg: string;
  file: string;
  weights: number[];
  fallback: string;
}

/** Latin subsets only: the pages are English, and embedding keeps exported HTML self-contained. */
const FACES: Record<HeadingFont, Face> = {
  poppins: { family: 'Poppins', pkg: '@fontsource/poppins', file: 'poppins', weights: [400, 500, 600, 700], fallback: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  playfair: { family: 'Playfair Display', pkg: '@fontsource/playfair-display', file: 'playfair-display', weights: [600, 700], fallback: 'Georgia, serif' },
  kalam: { family: 'Kalam', pkg: '@fontsource/kalam', file: 'kalam', weights: [400, 700], fallback: 'cursive' },
};

function fontFaceCss(face: Face): string {
  return face.weights
    .map((weight) => {
      const file = require.resolve(`${face.pkg}/files/${face.file}-latin-${weight}-normal.woff2`);
      return `@font-face{font-family:'${face.family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(${dataUri(file, 'font/woff2')}) format('woff2')}`;
    })
    .join('');
}

const FONT_VARIABLES = `:root{${(Object.keys(FACES) as HeadingFont[]).map((k) => `--font-${k}:'${FACES[k].family}',${FACES[k].fallback}`).join(';')}}`;

export interface RenderAssets {
  /** The page stylesheet (unscoped, as authored). */
  pageCss: string;
  /** @font-face rules (fonts embedded) + font variables for the body font and the given heading font. */
  fontCss(heading: HeadingFont): string;
  logo: string;
  footerLogo: string;
}

/** Reads everything once; all of it is immutable for the life of the process. */
export function loadRenderAssets(): RenderAssets {
  const dir = assetDir();
  const fontCache = new Map<HeadingFont, string>();
  return {
    pageCss: readFileSync(path.join(dir, 'page.css'), 'utf8'),
    fontCss(heading) {
      let css = fontCache.get(heading);
      if (css === undefined) {
        css = FONT_VARIABLES + fontFaceCss(FACES.poppins) + (heading === 'poppins' ? '' : fontFaceCss(FACES[heading]));
        fontCache.set(heading, css);
      }
      return css;
    },
    logo: dataUri(path.join(dir, 'gyftr-logo.png'), 'image/png'),
    footerLogo: dataUri(path.join(dir, 'gyftr-logo-tagline-white.png'), 'image/png'),
  };
}
