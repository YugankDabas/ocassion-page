import type { PublicBrand } from './brand';
import type { PageContent } from './page';
import type { SiteSettings } from './site';

/** Everything the renderer needs to turn one page into HTML. */
export interface PageRenderData {
  schemaVersion: 1;
  page: {
    id: string;
    /** URL slug the page is served under. */
    slug: string;
    title: string;
    occasion: { slug: string; name: string };
    publishedAt: string | null;
    updatedAt: string;
  };
  /** Visible sections only. */
  content: PageContent;
  /** Every brand referenced by the content, keyed by id. Inactive brands are omitted. */
  brands: Record<string, PublicBrand>;
  site: SiteSettings;
}
