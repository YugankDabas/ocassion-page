import { pageContentSchema, siteSettingsSchema, type OccasionInput, type SiteSettings } from '../contracts';
import type { PageUrlPolicy } from '../domain/pages/PageUrlPolicy';
import { ConflictError, NotFoundError } from '../lib/errors';
import type { IOccasionRepository, IPageRepository, ISettingsRepository, ITemplateRepository } from '../repositories/types';
import type { Actor, AuditService } from './AuditService';
import type { IContentChangeNotifier } from './ContentChanges';

export class OccasionService {
  constructor(
    private readonly occasions: IOccasionRepository,
    private readonly urls: PageUrlPolicy,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.occasions.list();
  }

  async create(actor: Actor, input: OccasionInput) {
    if (await this.occasions.findBySlug(input.slug)) throw new ConflictError(`Occasion "${input.slug}" already exists`);
    this.urls.toSlug(input.pageUrl); // must be a URL under the public base
    const created = await this.occasions.create(input);
    await this.audit.record(actor, { action: 'occasion.create', entityType: 'occasion', entityId: created.id });
    return created;
  }

  async update(actor: Actor, id: string, input: Partial<OccasionInput>) {
    if (!(await this.occasions.findById(id))) throw new NotFoundError('Occasion');
    if (input.slug) {
      const clash = await this.occasions.findBySlug(input.slug);
      if (clash && clash.id !== id) throw new ConflictError(`Occasion "${input.slug}" already exists`);
    }
    if (input.pageUrl) this.urls.toSlug(input.pageUrl);
    const updated = await this.occasions.update(id, input);
    await this.audit.record(actor, { action: 'occasion.update', entityType: 'occasion', entityId: id });
    return updated;
  }
}

export class TemplateService {
  constructor(
    private readonly templates: ITemplateRepository,
    private readonly pages: IPageRepository,
    private readonly audit: AuditService,
  ) {}

  list(occasionId?: string) {
    return this.templates.list(occasionId);
  }

  async saveFromPage(
    actor: Actor,
    pageId: string,
    input: { name: string; description: string; occasionSpecific: boolean },
  ) {
    const page = await this.pages.findById(pageId);
    if (!page) throw new NotFoundError('Page');
    const template = await this.templates.create({
      name: input.name,
      description: input.description,
      occasionId: input.occasionSpecific ? page.occasionId : null,
      content: pageContentSchema.parse(page.draft),
      createdById: actor.id,
    });
    await this.audit.record(actor, { action: 'template.create', entityType: 'template', entityId: template.id, metadata: { fromPage: pageId } });
    return template;
  }

  async delete(actor: Actor, id: string) {
    if (!(await this.templates.findById(id))) throw new NotFoundError('Template');
    await this.templates.delete(id);
    await this.audit.record(actor, { action: 'template.delete', entityType: 'template', entityId: id });
  }
}

const SITE_KEY = 'site';

export class SiteSettingsService {
  constructor(
    private readonly settings: ISettingsRepository,
    private readonly changes: IContentChangeNotifier,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<SiteSettings> {
    const raw = await this.settings.get(SITE_KEY);
    const parsed = siteSettingsSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : siteSettingsSchema.parse({});
  }

  async update(actor: Actor, input: SiteSettings): Promise<SiteSettings> {
    const value = siteSettingsSchema.parse(input);
    await this.settings.set(SITE_KEY, value);
    this.changes.changed('site'); // published pages are re-rendered with the new settings
    await this.audit.record(actor, { action: 'settings.update', entityType: 'settings', entityId: SITE_KEY });
    return value;
  }
}
