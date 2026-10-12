import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_PRESETS } from '../src/domain/occasions/occasionCatalog';
import { PageUrlPolicy } from '../src/domain/pages/PageUrlPolicy';
import { SectionRegistry } from '../src/domain/sections/SectionRegistry';
import { TemplateFactory } from '../src/domain/templates/TemplateFactory';
import { HtmlSanitizer } from '../src/lib/HtmlSanitizer';
import { ConflictError, ValidationError } from '../src/lib/errors';
import type { IBrandRepository, OccasionRecord } from '../src/repositories/types';
import { AuditService } from '../src/services/AuditService';
import { PageService } from '../src/services/PageService';
import { siteSettingsSchema } from '../src/contracts';
import { PageRenderer } from '../src/render/PageRenderer';
import { PagePayloadService } from '../src/services/PagePayloadService';
import { PublicationService } from '../src/services/PublicationService';
import {
  InMemoryBrandRepository,
  InMemoryPageRepository,
  InMemoryPublicationRepository,
  brand,
  fakeOccasions,
  noAudit,
  noTemplates,
  silentLogger,
} from './fakes';

const BASE = 'https://www.gyftr.com/occasion';
const actor = { id: randomUUID(), ip: '127.0.0.1' };
const occasion: OccasionRecord = {
  id: randomUUID(),
  slug: 'diwali-gift-cards',
  name: 'Diwali Gift Cards',
  shortName: 'Diwali',
  recipients: 'family',
  emoji: '🪔',
  pageUrl: `${BASE}/diwali-gift-cards`,
  sortOrder: 0,
  isActive: true,
  theme: THEME_PRESETS.festive,
};

function setup() {
  const pages = new InMemoryPageRepository();
  const brands = new InMemoryBrandRepository([brand(), brand({ name: 'Croma', slug: 'croma' }), brand({ name: 'Old', slug: 'old', isActive: false })]);
  const registry = SectionRegistry.createDefault(new HtmlSanitizer());
  const urls = new PageUrlPolicy(BASE);
  const publicationRows = new InMemoryPublicationRepository(pages);
  const brandRepo = brands as unknown as IBrandRepository;
  const service = new PageService(pages, fakeOccasions(occasion), noTemplates, brandRepo, registry, new TemplateFactory(), new AuditService(noAudit, silentLogger), urls);
  const site = { get: async () => siteSettingsSchema.parse({}) };
  const payloads = new PagePayloadService(fakeOccasions(occasion), brandRepo, site as never, registry);
  const publications = new PublicationService(service, pages, publicationRows, payloads, new PageRenderer(), { inline: async (html) => html }, urls, silentLogger, { requireHttpsImages: true });
  return { service, pages, brands, publications, hosted: (slug: string) => publicationRows.bySlug(slug) };
}

describe('PageService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('creates a page from the occasion template using the page URL', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    expect(page.slug).toBe('diwali-gift-cards');
    expect(page.pageUrl).toBe(`${BASE}/diwali-gift-cards`);
    expect(page.draft.sections.map((s) => s.type)).toEqual(['hero', 'intro', 'features', 'brandGrid', 'brandTabs', 'richText', 'faq', 'terms']);
    expect(page.draft.theme.primary).toBe(THEME_PRESETS.festive.primary);
    const grid = page.draft.sections.find((s) => s.type === 'brandGrid');
    expect(grid?.type === 'brandGrid' && grid.props.brands).toHaveLength(2); // only active brands are featured
  });

  it('rejects URLs outside the public base and duplicate URLs', async () => {
    await expect(
      ctx.service.create(actor, { occasionId: occasion.id, title: 'X', pageUrl: 'https://evil.example/occasion/x', templateId: 'blank' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await ctx.service.create(actor, { occasionId: occasion.id, title: 'A', pageUrl: `${BASE}/a-page`, templateId: 'blank' });
    await expect(
      ctx.service.create(actor, { occasionId: occasion.id, title: 'B', pageUrl: `${BASE}/a-page/`, templateId: 'blank' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('sanitises rich text on save and enforces optimistic concurrency', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    const content = structuredClone(page.draft);
    const intro = content.sections.find((s) => s.type === 'intro');
    if (intro?.type !== 'intro') throw new Error('no intro');
    intro.props.body = '<p onclick="steal()">Hi<script>alert(1)</script><a href="javascript:alert(1)">x</a></p>';

    const saved = await ctx.service.saveDraft(actor, page.id, { expectedVersion: 1, content });
    const savedIntro = saved.draft.sections.find((s) => s.type === 'intro');
    expect(savedIntro?.type === 'intro' && savedIntro.props.body).toBe('<p>Hi<a>x</a></p>');
    expect(saved.draftVersion).toBe(2);

    await expect(ctx.service.saveDraft(actor, page.id, { expectedVersion: 1, content })).rejects.toBeInstanceOf(ConflictError);
  });

  it('publishes embeddable HTML and keeps draft edits private until republished', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    expect(ctx.hosted('diwali-gift-cards')).toBeNull();

    const published = await ctx.publications.publish(actor, page.id, 1);
    expect(published.status).toBe('PUBLISHED');

    const hosted = ctx.hosted('diwali-gift-cards');
    if (!hosted) throw new Error('page is not hosted');
    expect(hosted).toMatchObject({ slug: 'diwali-gift-cards', pageId: page.id, version: 1 });

    // One string: <style> + markup + <script>. Body only — no document shell, no site header / footer.
    const parts = /^<style>([\s\S]*?)<\/style>\n([\s\S]*)\n<script>([\s\S]*)<\/script>$/.exec(hosted.html);
    if (!parts) throw new Error('unexpected HTML shape');
    const [, css = '', body = ''] = parts;
    expect(hosted.html).not.toMatch(/<(?:html|head|body)[\s>]|site-header|site-footer/);
    // Isolated from the host site: every class is prefixed and every rule is scoped to the root.
    expect(body.startsWith('<div class="occ-occasion"')).toBe(true);
    const classes = [...body.matchAll(/ class="([^"]*)"/g)].flatMap((m) => m[1]!.split(' '));
    expect(classes.length).toBeGreaterThan(50);
    expect(classes.filter((c) => !c.startsWith('occ-'))).toEqual([]);
    expect(css).toContain('.occ-occasion .occ-brand-card');
    expect(css).not.toMatch(/[};](?:body|html|:root|\*)[,{]/);
    expect(body).toContain('Amazon Pay');
    expect(hosted.seo.canonicalUrl).toBe(`${BASE}/diwali-gift-cards`);

    // Draft edits stay private until republished.
    const content = structuredClone(published.draft);
    content.sections = content.sections.filter((s) => s.type !== 'faq');
    await ctx.service.saveDraft(actor, page.id, { expectedVersion: 1, content });
    expect(ctx.hosted('diwali-gift-cards')?.html).toBe(hosted.html);

    await ctx.publications.publish(actor, page.id, 2);
    const republished = ctx.hosted('diwali-gift-cards');
    expect(republished?.version).toBe(2);
    expect(republished?.html).not.toBe(hosted.html);

    await ctx.publications.unpublish(actor, page.id);
    expect(ctx.hosted('diwali-gift-cards')).toBeNull();
  });

  it('rejects a publish made from a stale version without changing what is live', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    await ctx.publications.publish(actor, page.id, 1);
    await ctx.service.saveDraft(actor, page.id, { expectedVersion: 1, content: page.draft });
    await expect(ctx.publications.publish(actor, page.id, 1)).rejects.toBeInstanceOf(ConflictError);
    expect(ctx.hosted('diwali-gift-cards')?.version).toBe(1);
  });

  it('re-renders published pages when brand data changes', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    await ctx.publications.publish(actor, page.id, 1);
    const before = ctx.hosted('diwali-gift-cards');
    expect(before?.html).toContain('Save 2%');

    ctx.brands.brands[0]!.discountPercent = 15;
    expect(await ctx.publications.refreshAll()).toEqual({ refreshed: 1, unchanged: 0, failed: 0 });
    const after = ctx.hosted('diwali-gift-cards');
    expect(after?.html).toContain('Save 15%');
    expect(after?.version).toBe(1); // same published version, new rendering
    expect(after!.renderedAt.getTime()).toBeGreaterThanOrEqual(before!.renderedAt.getTime());
  });

  it('writes nothing when a re-render produces the same HTML', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    await ctx.publications.publish(actor, page.id, 1);
    const renderedAt = ctx.hosted('diwali-gift-cards')!.renderedAt;
    expect(await ctx.publications.refreshAll()).toEqual({ refreshed: 0, unchanged: 1, failed: 0 });
    expect(ctx.hosted('diwali-gift-cards')!.renderedAt).toBe(renderedAt); // updated_at does not move
  });

  it('never brings back a page that is unpublished while it is being re-rendered', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    await ctx.publications.publish(actor, page.id, 1);
    ctx.brands.brands[0]!.discountPercent = 15;

    // The unpublish lands in the middle of the refresh: after the page was listed, before its HTML is stored.
    const findManyByIds = ctx.brands.findManyByIds.bind(ctx.brands);
    let unpublished = false;
    ctx.brands.findManyByIds = async (ids, opts) => {
      if (!unpublished) {
        unpublished = true;
        await ctx.publications.unpublish(actor, page.id);
      }
      return findManyByIds(ids, opts);
    };
    expect(await ctx.publications.refreshAll()).toEqual({ refreshed: 0, unchanged: 0, failed: 0 });
    expect(ctx.hosted('diwali-gift-cards')).toBeNull();
    expect((await ctx.service.get(page.id)).status).toBe('DRAFT');
  });

  it('folds refresh requests made during a pass into one follow-up pass', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    await ctx.publications.publish(actor, page.id, 1);
    let passes = 0;
    const listPublished = ctx.pages.listPublished.bind(ctx.pages);
    ctx.pages.listPublished = async () => {
      passes++;
      return listPublished();
    };
    const results = await Promise.all([ctx.publications.refreshAll(), ctx.publications.refreshAll(), ctx.publications.refreshAll(), ctx.publications.refreshAll()]);
    expect(passes).toBe(2); // the running pass + one for everything that arrived meanwhile
    expect(new Set(results).size).toBe(1);
  });

  it('keeps the page unpublished and stores nothing when publishing fails', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    ctx.pages.publish = async () => {
      throw new Error('database unavailable');
    };
    await expect(ctx.publications.publish(actor, page.id, 1)).rejects.toThrow('database unavailable');
    expect((await ctx.service.get(page.id)).status).toBe('DRAFT');
    expect(ctx.hosted('diwali-gift-cards')).toBeNull();
  });

  it('refuses to publish images that are not served over https', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    ctx.brands.brands[0]!.logoUrl = 'http://insecure.example/logo.png';
    await expect(ctx.publications.publish(actor, page.id, 1)).rejects.toBeInstanceOf(ValidationError);
    expect(ctx.hosted('diwali-gift-cards')).toBeNull();
  });

  it('refuses to publish a page that references deleted brands', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    ctx.brands.brands = [];
    await expect(ctx.publications.publish(actor, page.id, 1)).rejects.toBeInstanceOf(ValidationError);
  });

  it('moves the hosted page when its URL changes', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-old`, templateId: 'blank' });
    const content = { ...page.draft, sections: [{ id: 's1', type: 'intro' as const, visible: true, anchor: '', props: { eyebrow: '', heading: 'Hi', body: '', align: 'center' as const, tone: 'surface' as const } }] };
    await ctx.service.saveDraft(actor, page.id, { expectedVersion: 1, content });
    await ctx.publications.publish(actor, page.id, 2);
    const renamed = await ctx.service.saveDraft(actor, page.id, { expectedVersion: 2, pageUrl: `${BASE}/diwali-new`, content });
    expect(renamed.liveUrl).toBe(`${BASE}/diwali-old`);
    await ctx.publications.publish(actor, page.id, 3);
    expect(ctx.hosted('diwali-old')).toBeNull();
    expect(ctx.hosted('diwali-new')?.version).toBe(3);
  });
});
