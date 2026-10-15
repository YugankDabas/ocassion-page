import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import type {
  BrandRecord,
  IAuditRepository,
  IBrandRepository,
  IOccasionRepository,
  IPageRepository,
  IPublicationRepository,
  ITemplateRepository,
  OccasionRecord,
  PageRecord,
  PublicationRecord,
  RefreshOutcome,
  RenderedPublication,
  RevisionRecord,
} from '../src/repositories/types';

/* In-memory repository fakes: exercise service logic without a database (DIP in action). */

export const silentLogger = pino({ level: 'silent' });

export class InMemoryPageRepository implements IPageRepository {
  pages = new Map<string, PageRecord>();
  revisions: (RevisionRecord & { pageId: string })[] = [];
  /** The PagePublication table: written together with the page, as in the real repository. */
  publications: PublicationRecord[] = [];

  async findById(id: string) {
    return this.pages.get(id) ?? null;
  }
  async findBySlug(slug: string) {
    return [...this.pages.values()].find((p) => p.slug === slug) ?? null;
  }
  async findByPublishedSlug(slug: string) {
    return [...this.pages.values()].find((p) => p.publishedSlug === slug && p.status === 'PUBLISHED') ?? null;
  }
  async list() {
    return [];
  }
  async listPublished() {
    return [...this.pages.values()].filter((p) => p.status === 'PUBLISHED');
  }
  async create(data: { slug: string; title: string; occasionId: string; draft: unknown }, revision: Omit<RevisionRecord, 'id' | 'createdAt' | 'createdBy' | 'pageId'>) {
    const page: PageRecord = {
      id: randomUUID(),
      slug: data.slug,
      title: data.title,
      occasionId: data.occasionId,
      status: 'DRAFT',
      draft: data.draft,
      draftVersion: 1,
      published: null,
      publishedVersion: null,
      publishedSlug: null,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.pages.set(page.id, page);
    this.addRevision(page.id, revision.version, revision);
    return page;
  }
  async saveDraft(id: string, expectedVersion: number, data: { title: string; slug: string; draft: unknown }, revision: { kind: 'SAVE' | 'PUBLISH' | 'RESTORE'; title: string; slug: string; content: unknown; note: string }) {
    const page = this.pages.get(id);
    if (!page || page.draftVersion !== expectedVersion) return null;
    const next = { ...page, title: data.title, slug: data.slug, draft: data.draft, draftVersion: page.draftVersion + 1, updatedAt: new Date() };
    this.pages.set(id, next);
    this.addRevision(id, next.draftVersion, revision);
    return next;
  }
  async publish(id: string, expectedVersion: number, data: { published: unknown; publishedSlug: string }, revision: { kind: 'SAVE' | 'PUBLISH' | 'RESTORE'; title: string; slug: string; content: unknown; note: string }, rendered: RenderedPublication) {
    const page = this.pages.get(id);
    if (!page || page.draftVersion !== expectedVersion) return null;
    const next: PageRecord = { ...page, status: 'PUBLISHED', published: data.published, publishedSlug: data.publishedSlug, publishedVersion: expectedVersion, publishedAt: new Date() };
    this.pages.set(id, next);
    this.addRevision(id, expectedVersion, revision);
    this.publications = this.publications.filter((r) => r.pageId !== id);
    this.publications.push({ slug: data.publishedSlug, pageId: id, version: expectedVersion, html: rendered.html, seo: rendered.seo, desktopBanner: rendered.desktopBanner, mobileBanner: rendered.mobileBanner, isPublished: true, publishedAt: next.publishedAt!, renderedAt: next.publishedAt! });
    return next;
  }
  async setStatus(id: string, status: PageRecord['status'], opts: { clearPublished?: boolean } = {}) {
    const page = this.pages.get(id)!;
    const next = { ...page, status, ...(opts.clearPublished ? { published: null, publishedSlug: null, publishedVersion: null, publishedAt: null } : {}) };
    this.pages.set(id, next);
    if (opts.clearPublished) this.publications = this.publications.filter((r) => r.pageId !== id);
    return next;
  }
  async delete(id: string) {
    this.pages.delete(id);
  }
  async listRevisions(pageId: string) {
    return this.revisions.filter((r) => r.pageId === pageId).reverse();
  }
  async findRevision(pageId: string, revisionId: string) {
    return this.revisions.find((r) => r.pageId === pageId && r.id === revisionId) ?? null;
  }
  async pruneRevisions() {}
  private addRevision(pageId: string, version: number, r: { kind: 'SAVE' | 'PUBLISH' | 'RESTORE'; title: string; slug: string; content: unknown; note: string }) {
    this.revisions.push({ id: randomUUID(), pageId, version, kind: r.kind, title: r.title, slug: r.slug, content: r.content, note: r.note, createdAt: new Date(), createdBy: null });
  }
}

export class InMemoryBrandRepository implements Partial<IBrandRepository> {
  constructor(public brands: BrandRecord[] = []) {}
  async findManyByIds(ids: string[], opts: { activeOnly?: boolean } = {}) {
    return this.brands.filter((b) => ids.includes(b.id) && (!opts.activeOnly || b.isActive));
  }
  async firstActive(limit: number) {
    return this.brands.filter((b) => b.isActive).slice(0, limit);
  }
}

export function fakeOccasions(occasion: OccasionRecord): IOccasionRepository {
  return {
    list: async () => [occasion],
    findById: async (id) => (id === occasion.id ? occasion : null),
    findBySlug: async (slug) => (slug === occasion.slug ? occasion : null),
    create: async () => occasion,
    update: async () => occasion,
  };
}

export const noTemplates: ITemplateRepository = {
  list: async () => [],
  findById: async () => null,
  create: async () => {
    throw new Error('not used');
  },
  delete: async () => {},
};

export const noAudit: IAuditRepository = {
  record: async () => {},
  list: async () => ({ items: [], total: 0, page: 1, pageSize: 1 }),
};

export class InMemoryPublicationRepository implements IPublicationRepository {
  constructor(private readonly store: InMemoryPageRepository) {}

  async findByPageId(pageId: string) {
    return this.store.publications.find((r) => r.pageId === pageId) ?? null;
  }
  async refresh(pageId: string, version: number, render: () => Promise<RenderedPublication>): Promise<RefreshOutcome> {
    const before = await this.findByPageId(pageId);
    if (!before || before.version !== version) return 'gone';
    const next = await render();
    // Like the real repository: the row is re-checked at write time, never created.
    const row = await this.findByPageId(pageId);
    if (!row || row.version !== version) return 'gone';
    if (next.html === row.html && JSON.stringify(next.seo) === JSON.stringify(row.seo) && next.desktopBanner === row.desktopBanner && next.mobileBanner === row.mobileBanner) return 'unchanged';
    Object.assign(row, { html: next.html, seo: next.seo, desktopBanner: next.desktopBanner, mobileBanner: next.mobileBanner, renderedAt: new Date() });
    return 'updated';
  }
  /** What the gyftr.com backend finds for a URL slug (a lookup on PagePublication by its primary key). */
  bySlug(slug: string) {
    return this.store.publications.find((r) => r.slug === slug) ?? null;
  }
}

export function brand(partial: Partial<BrandRecord> = {}): BrandRecord {
  return {
    id: randomUUID(),
    name: 'Amazon Pay',
    slug: 'amazon',
    logoUrl: '',
    productUrl: 'https://www.gyftr.com/amazon',
    discountPercent: 2,
    discountLabel: '',
    category: 'E-Commerce',
    redemption: 'ONLINE',
    minDenomination: 100,
    isActive: true,
    gyftrId: null,
    manualFields: [],
    syncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}
