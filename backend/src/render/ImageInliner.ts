import type { Logger } from '../lib/logger';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export interface IImageInliner {
  /** Replace image URLs in the markup with embedded copies where allowed; anything else is left as a URL. */
  inline(html: string): Promise<string>;
}

/**
 * Embeds a page's images into the HTML as `data:` URIs, so a downloaded page
 * is one file that works offline.
 *
 * Only images under the configured URL prefixes are fetched (our own media
 * storage and GyFTR's CDN). Image URLs come from page content, so fetching
 * "whatever the content says" would let an editor make the server call
 * internal addresses; a fixed allow-list rules that out.
 */
export class ImageInliner implements IImageInliner {
  private readonly prefixes: string[];

  constructor(
    allowedPrefixes: string[],
    private readonly logger: Logger,
  ) {
    this.prefixes = allowedPrefixes.map((p) => (p.endsWith('/') ? p : `${p}/`));
  }

  async inline(html: string): Promise<string> {
    const urls = new Set<string>();
    for (const m of html.matchAll(/\s(?:src|srcset)="([^"]+)"/gi)) {
      for (const candidate of m[1]!.split(',')) {
        const url = unescapeAttr(candidate.trim().split(/\s+/)[0] ?? '');
        if (this.allowed(url)) urls.add(url);
      }
    }
    if (urls.size === 0) return html;

    const embedded = new Map<string, string>();
    let total = 0;
    await Promise.all(
      [...urls].map(async (url) => {
        try {
          const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
          const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
          if (!res.ok || !type.startsWith('image/')) return;
          const data = Buffer.from(await res.arrayBuffer());
          if (data.length > MAX_IMAGE_BYTES || total + data.length > MAX_TOTAL_BYTES) return;
          total += data.length;
          embedded.set(url, `data:${type};base64,${data.toString('base64')}`);
        } catch (err) {
          this.logger.warn({ url, err: err instanceof Error ? err.message : String(err) }, 'Could not embed image in download');
        }
      }),
    );

    return html.replace(/(\s(?:src|srcset)=")([^"]+)(")/gi, (_m, open: string, value: string, close: string) => {
      const next = value
        .split(',')
        .map((candidate) => {
          const [url = '', ...descriptor] = candidate.trim().split(/\s+/);
          return [embedded.get(unescapeAttr(url)) ?? url, ...descriptor].join(' ');
        })
        .join(', ');
      return `${open}${next}${close}`;
    });
  }

  private allowed(url: string): boolean {
    return /^https?:\/\//i.test(url) && this.prefixes.some((p) => url.startsWith(p));
  }
}

const unescapeAttr = (s: string) => s.replace(/&amp;/g, '&');
