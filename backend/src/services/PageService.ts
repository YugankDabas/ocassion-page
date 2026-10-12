import {
  pageContentSchema,
  type CreatePageInput,
  type PageContent,
  type PageStatus,
  type UpdatePageDraftInput,
} from '../contracts';
import type { PageUrlPolicy } from '../domain/pages/PageUrlPolicy';
import type { SectionRegistry } from '../domain/sections/SectionRegistry';
import type { ITemplateFactory } from '../domain/templates/TemplateFactory';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import type {
  IBrandRepository,
  IOccasionRepository,
  IPageRepository,
  ITemplateRepository,
  PageRecord,
  RenderedPublication,
} from '../repositories/types';
import type { Actor, AuditService } from './AuditService';

const REVISIONS_TO_KEEP = 50;
const DEFAULT_FEATURED_BRANDS = 12;

export interface PageDetail extends PageRecord {
  draft: PageContent;
  hasUnpublishedChanges: boolean;
  /** Full public URL of the draft slug. */
  pageUrl: string;
  /** Full public URL currently live (may differ from pageUrl after a rename until republished). */
  liveUrl: string | null;
}

/**
 * Page lifecycle: create (from a template) → edit draft → publish → unpublish / archive.
 * (Publishing goes through PublicationService, which renders the HTML that is stored with the page.)
 * Drafts and published snapshots are separate documents, so editors can keep
 * working without affecting the live page until they publish.
 */
export class PageService {
  constructor(
    private readonly pages: IPageRepository,
    private readonly occasions: IOccasionRepository,
    private readonly templates: ITemplateRepository,
    private readonly brands: IBrandRepository,
    private readonly registry: SectionRegistry,
    private readonly templateFactory: ITemplateFactory,
    private readonly audit: AuditService,
    private readonly urls: PageUrlPolicy,
  ) {}

  async list(filter: { status?: PageStatus; occasionId?: string; search?: string }) {
    const items = await this.pages.list(filter);
    return items.map((p) => ({
      ...p,
      pageUrl: this.urls.toUrl(p.slug),
      liveUrl: p.publishedSlug ? this.urls.toUrl(p.publishedSlug) : null,
    }));
  }

  async get(id: string): Promise<PageDetail> {
    const page = await this.pages.findById(id);
    if (!page) throw new NotFoundError('Page');
    return this.toDetail(page);
  }

  async create(actor: Actor, input: CreatePageInput): Promise<PageDetail> {
    const occasion = await this.occasions.findById(input.occasionId);
    if (!occasion) throw new BadRequestError('Unknown occasion');
    const slug = this.urls.toSlug(input.pageUrl);
    await this.assertSlugAvailable(slug);

    const content = await this.buildInitialContent(input, occasion);
    const page = await this.pages.create(
      { slug, title: input.title, occasionId: occasion.id, draft: content, createdById: actor.id },
      { kind: 'SAVE', version: 1, title: input.title, slug, content, note: 'Created', createdById: actor.id },
    );
    await this.audit.record(actor, {
      action: 'page.create',
      entityType: 'page',
      entityId: page.id,
      metadata: { slug: page.slug, template: input.templateId },
    });
    return this.toDetail(page);
  }

  async saveDraft(actor: Actor, id: string, input: UpdatePageDraftInput, note = ''): Promise<PageDetail> {
    const page = await this.pages.findById(id);
    if (!page) throw new NotFoundError('Page');
    const slug = input.pageUrl ? this.urls.toSlug(input.pageUrl) : page.slug;
    if (slug !== page.slug) await this.assertSlugAvailable(slug, id);

    const content = this.prepareContent(input.content);
    const title = input.title ?? page.title;
    const saved = await this.pages.saveDraft(
      id,
      input.expectedVersion,
      { title, slug, draft: content, updatedById: actor.id },
      { kind: note ? 'RESTORE' : 'SAVE', title, slug, content, note, createdById: actor.id },
    );
    if (!saved) throw this.staleVersion();
    await this.pages.pruneRevisions(id, REVISIONS_TO_KEEP);
    await this.audit.record(actor, { action: 'page.save', entityType: 'page', entityId: id, metadata: { version: saved.draftVersion } });
    return this.toDetail(saved);
  }

  /** `rendered` is the HTML of the draft at `expectedVersion`; it is stored in the same transaction. */
  async publish(actor: Actor, id: string, expectedVersion: number, note: string, rendered: RenderedPublication): Promise<PageDetail> {
    const page = await this.pages.findById(id);
    if (!page) throw new NotFoundError('Page');
    if (page.status === 'ARCHIVED') throw new BadRequestError('Restore the page from the archive before publishing');

    const content = this.prepareContent(page.draft);
    await this.assertPublishable(content);
    await this.assertSlugAvailable(page.slug, id);

    const published = await this.pages.publish(
      id,
      expectedVersion,
      { published: content, publishedSlug: page.slug, publishedById: actor.id },
      { kind: 'PUBLISH', title: page.title, slug: page.slug, content, note, createdById: actor.id },
      rendered,
    );
    if (!published) throw this.staleVersion();

    await this.audit.record(actor, {
      action: 'page.publish',
      entityType: 'page',
      entityId: id,
      metadata: { slug: page.slug, version: expectedVersion, note },
    });
    return this.toDetail(published);
  }

  async unpublish(actor: Actor, id: string): Promise<PageDetail> {
    const page = await this.pages.findById(id);
    if (!page) throw new NotFoundError('Page');
    const updated = await this.pages.setStatus(id, 'DRAFT', { clearPublished: true });
    await this.audit.record(actor, { action: 'page.unpublish', entityType: 'page', entityId: id });
    return this.toDetail(updated);
  }

  async archive(actor: Actor, id: string): Promise<PageDetail> {
    const page = await this.pages.findById(id);
    if (!page) throw new NotFoundError('Page');
    const updated = await this.pages.setStatus(id, 'ARCHIVED', { clearPublished: true });
    await this.audit.record(actor, { action: 'page.archive', entityType: 'page', entityId: id });
    return this.toDetail(updated);
  }

  async restoreFromArchive(actor: Actor, id: string): Promise<PageDetail> {
    const page = await this.pages.findById(id);
    if (!page) throw new NotFoundError('Page');
    if (page.status !== 'ARCHIVED') throw new BadRequestError('Page is not archived');
    const updated = await this.pages.setStatus(id, 'DRAFT');
    await this.audit.record(actor, { action: 'page.unarchive', entityType: 'page', entityId: id });
    return this.toDetail(updated);
  }

  async delete(actor: Actor, id: string): Promise<void> {
    const page = await this.pages.findById(id);
    if (!page) throw new NotFoundError('Page');
    if (page.status === 'PUBLISHED') throw new BadRequestError('Unpublish the page before deleting it');
    await this.pages.delete(id);
    await this.audit.record(actor, { action: 'page.delete', entityType: 'page', entityId: id, metadata: { slug: page.slug } });
  }

  async duplicate(actor: Actor, id: string, pageUrl: string, title: string): Promise<PageDetail> {
    const source = await this.pages.findById(id);
    if (!source) throw new NotFoundError('Page');
    const slug = this.urls.toSlug(pageUrl);
    await this.assertSlugAvailable(slug);
    const content = this.prepareContent(source.draft);
    const page = await this.pages.create(
      { slug, title, occasionId: source.occasionId, draft: content, createdById: actor.id },
      { kind: 'SAVE', version: 1, title, slug, content, note: `Duplicated from ${source.slug}`, createdById: actor.id },
    );
    await this.audit.record(actor, { action: 'page.duplicate', entityType: 'page', entityId: page.id, metadata: { from: id } });
    return this.toDetail(page);
  }

  revisions(id: string) {
    return this.pages.listRevisions(id, REVISIONS_TO_KEEP + 20);
  }

  /** Copy an old revision into the draft (it still has to be published). */
  async restoreRevision(actor: Actor, id: string, revisionId: string, expectedVersion: number): Promise<PageDetail> {
    const revision = await this.pages.findRevision(id, revisionId);
    if (!revision) throw new NotFoundError('Revision');
    return this.saveDraft(
      actor,
      id,
      { expectedVersion, title: revision.title, content: pageContentSchema.parse(revision.content) },
      `Restored revision v${revision.version}`,
    );
  }

  /* ---------- internals ---------- */

  /** Validate untrusted content (e.g. an unsaved editor document) against the shared contract and sanitise its rich text. */
  validateContent(raw: unknown): PageContent {
    return this.prepareContent(raw);
  }

  /** Validate against the shared contract, then sanitise rich text. */
  private prepareContent(raw: unknown): PageContent {
    const parsed = pageContentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('Page content is invalid', parsed.error.flatten());
    }
    const ids = new Set<string>();
    for (const s of parsed.data.sections) {
      if (ids.has(s.id)) throw new ValidationError(`Duplicate section id "${s.id}"`);
      ids.add(s.id);
    }
    return this.registry.sanitizeContent(parsed.data);
  }

  private async assertPublishable(content: PageContent): Promise<void> {
    const problems: string[] = [];
    if (!content.sections.some((s) => s.visible)) problems.push('Add at least one visible section');
    const brandIds = this.registry.referencedBrandIds(content);
    if (brandIds.length) {
      const found = await this.brands.findManyByIds(brandIds);
      const missing = brandIds.length - found.length;
      if (missing > 0) problems.push(`${missing} referenced brand(s) no longer exist — remove them from the page`);
    }
    if (problems.length) throw new ValidationError('Page cannot be published yet', { problems });
  }

  private async assertSlugAvailable(slug: string, exceptPageId?: string): Promise<void> {
    const [bySlug, byPublished] = await Promise.all([this.pages.findBySlug(slug), this.pages.findByPublishedSlug(slug)]);
    const clash = [bySlug, byPublished].find((p) => p && p.id !== exceptPageId);
    if (clash) throw new ConflictError(`${this.urls.toUrl(slug)} is already used by the page "${clash.title}"`);
  }

  private async buildInitialContent(
    input: CreatePageInput,
    occasion: NonNullable<Awaited<ReturnType<IOccasionRepository['findById']>>>,
  ): Promise<PageContent> {
    let content: PageContent;
    if (input.templateId === 'blank') {
      content = this.templateFactory.createBlank(occasion);
    } else if (input.templateId === 'default') {
      const featured = await this.brands.firstActive(DEFAULT_FEATURED_BRANDS);
      content = this.templateFactory.createDefault(occasion, featured.map((b) => b.id));
    } else {
      const template = await this.templates.findById(input.templateId);
      if (!template) throw new BadRequestError('Template not found');
      content = this.prepareContent(template.content);
    }
    // Canonical URL is left empty so the renderer derives it from the page URL (survives URL changes).
    return content;
  }

  private staleVersion(): ConflictError {
    return new ConflictError(
      'This page was changed by someone else since you opened it. Reload to get the latest version.',
      { reason: 'STALE_VERSION' },
    );
  }

  private toDetail(page: PageRecord): PageDetail {
    const parsed = pageContentSchema.safeParse(page.draft);
    return {
      ...page,
      draft: parsed.success ? parsed.data : pageContentSchema.parse({}),
      hasUnpublishedChanges: page.status === 'PUBLISHED' && page.publishedVersion !== page.draftVersion,
      pageUrl: this.urls.toUrl(page.slug),
      liveUrl: page.publishedSlug ? this.urls.toUrl(page.publishedSlug) : null,
    };
  }
}
