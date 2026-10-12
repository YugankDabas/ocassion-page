import { SLUG_PATTERN } from '../../contracts';
import { ValidationError } from '../../lib/errors';

/** Slugs that could collide with technical paths under /occasion on gyftr.com. */
const RESERVED_SLUGS = new Set(['preview', 'api', 'sitemap', 'robots', '_next']);

/**
 * Maps between the full public URL an editor enters in the admin panel
 * (https://www.gyftr.com/occasion/diwali-gift-cards) and the slug gyftr.com
 * looks the published page up by. Only URLs directly under the configured public
 * base are accepted, because that is the only route gyftr.com embeds pages on.
 */
export class PageUrlPolicy {
  private readonly origin: string;
  private readonly basePath: string;

  constructor(publicBaseUrl: string) {
    const base = new URL(publicBaseUrl);
    this.origin = base.origin;
    this.basePath = base.pathname.replace(/\/+$/, '');
  }

  get baseUrl(): string {
    return `${this.origin}${this.basePath}`;
  }

  toSlug(pageUrl: string): string {
    let url: URL;
    try {
      url = new URL(pageUrl.trim());
    } catch {
      throw this.invalid(pageUrl);
    }
    if (url.origin !== this.origin) throw this.invalid(pageUrl);
    const path = url.pathname.replace(/\/+$/, '');
    const prefix = `${this.basePath}/`;
    if (!path.startsWith(prefix)) throw this.invalid(pageUrl);
    const slug = decodeURIComponent(path.slice(prefix.length)).toLowerCase();
    if (!SLUG_PATTERN.test(slug) || slug.length > 120) throw this.invalid(pageUrl);
    if (RESERVED_SLUGS.has(slug)) throw new ValidationError(`"${slug}" is reserved; choose another URL`);
    return slug;
  }

  toUrl(slug: string): string {
    return `${this.baseUrl}/${slug}`;
  }

  private invalid(value: string): ValidationError {
    return new ValidationError(
      `Page URL must look like ${this.baseUrl}/your-page-name (lowercase letters, numbers and hyphens). Got: ${value.slice(0, 200)}`,
    );
  }
}
