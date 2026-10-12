import { pageContentSchema, type PageRenderData, type PublicBrand } from '../contracts';
import type { SectionRegistry } from '../domain/sections/SectionRegistry';
import type { BrandRecord, IBrandRepository, IOccasionRepository, PageRecord } from '../repositories/types';
import type { SiteSettingsService } from './CatalogServices';

/**
 * Assembles everything the renderer needs for one page: its content plus the
 * current brand data and site settings the content refers to. Brands are
 * always read fresh, so a re-render picks up new discounts and links.
 */
export class PagePayloadService {
  constructor(
    private readonly occasions: IOccasionRepository,
    private readonly brands: IBrandRepository,
    private readonly site: SiteSettingsService,
    private readonly registry: SectionRegistry,
  ) {}

  /**
   * @param rawContent the draft, an unsaved editor document, or a published snapshot
   * @param slug       the URL slug the page is (or will be) served under
   */
  async build(page: PageRecord, rawContent: unknown, slug: string): Promise<PageRenderData> {
    const content = this.registry.sanitizeContent(pageContentSchema.parse(rawContent));
    content.sections = content.sections.filter((s) => s.visible);

    // Three independent lookups, each by primary key / id list — no joins, no per-brand queries.
    const [occasion, brands, site] = await Promise.all([
      this.occasions.findById(page.occasionId),
      this.brands.findManyByIds(this.registry.referencedBrandIds(content), { activeOnly: true }),
      this.site.get(),
    ]);

    return {
      schemaVersion: 1,
      page: {
        id: page.id,
        slug,
        title: page.title,
        occasion: { slug: occasion?.slug ?? '', name: occasion?.name ?? '' },
        publishedAt: page.publishedAt?.toISOString() ?? null,
        updatedAt: page.updatedAt.toISOString(),
      },
      content,
      brands: Object.fromEntries(brands.map((b) => [b.id, toPublicBrand(b)])),
      site,
    };
  }
}

function toPublicBrand(b: BrandRecord): PublicBrand {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    logoUrl: b.logoUrl,
    productUrl: b.productUrl,
    discountPercent: b.discountPercent,
    discountLabel: b.discountLabel,
    category: b.category,
    redemption: b.redemption,
    minDenomination: b.minDenomination,
  };
}
