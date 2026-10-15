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
import { sectionSchema, siteSettingsSchema } from '../src/contracts';
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

function setup(siteInput: Record<string, unknown> = {}) {
  const pages = new InMemoryPageRepository();
  const brands = new InMemoryBrandRepository([brand(), brand({ name: 'Croma', slug: 'croma' }), brand({ name: 'Old', slug: 'old', isActive: false })]);
  const registry = SectionRegistry.createDefault(new HtmlSanitizer());
  const urls = new PageUrlPolicy(BASE);
  const publicationRows = new InMemoryPublicationRepository(pages);
  const brandRepo = brands as unknown as IBrandRepository;
  const service = new PageService(pages, fakeOccasions(occasion), noTemplates, brandRepo, registry, new TemplateFactory(), new AuditService(noAudit, silentLogger), urls);
  const site = { get: async () => siteSettingsSchema.parse(siteInput) };
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
    const parts = /^<style>([\s\S]*?)<\/style>([\s\S]*)<script>([\s\S]*)<\/script>$/.exec(hosted.html);
    if (!parts) throw new Error('unexpected HTML shape');
    const [, css = '', body = ''] = parts;
    expect(hosted.html).not.toMatch(/<(?:html|head|body)[\s>]|site-header|site-footer/);
    // Reads the same inside JSON: no double quotes, backslashes or line breaks to escape.
    expect(JSON.stringify(hosted.html)).toBe(`"${hosted.html}"`);
    // Isolated from the host site: every class is prefixed and every rule is scoped to the root.
    expect(body.startsWith("<div class='occ-occasion'")).toBe(true);
    const classes = [...body.matchAll(/ class='([^']*)'/g)].flatMap((m) => m[1]!.split(' '));
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

  it('publishes section spacing and terms tables / images, still JSON-safe; a section name stays in the panel', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    const content = structuredClone(page.draft);
    content.sections = content.sections.filter((s) => s.type !== 'terms');
    content.sections.push(sectionSchema.parse({
      id: 'terms-x',
      type: 'terms',
      visible: true,
      anchor: '',
      name: 'Panel-only name',
      layout: { paddingTop: 8, paddingBottom: 0, marginTop: null, marginBottom: 24, headingGap: 12 },
      props: {
        heading: 'More about "Diwali" Gift Cards',
        body: '<table><tbody><tr><th>Brand</th><th>Validity</th></tr><tr><td><p>Amazon</p></td><td>1 year</td></tr></tbody></table><img src="https://cdn.gyftr.com/a.png" alt="A &quot;card&quot;"><img src="x.png">',
        collapsible: false,
        defaultOpen: true,
      },
    }));
    const saved = await ctx.service.saveDraft(actor, page.id, { expectedVersion: 1, content });
    const terms = saved.draft.sections.find((s) => s.id === 'terms-x');
    expect(terms?.type === 'terms' && terms.props.body).not.toContain('x.png'); // only full http(s) image addresses are kept

    await ctx.publications.publish(actor, page.id, 2);
    const html = ctx.hosted('diwali-gift-cards')!.html;
    expect(JSON.stringify(html)).toBe(`"${html}"`);
    // Desktop size from ~1330px wide, half on a phone (like the built-in spacing); 0 stays 0.
    expect(html).toContain(" style='padding-top:clamp(4px, 0.6vw, 8px);padding-bottom:0;margin-bottom:clamp(12px, 1.8vw, 24px);--heading-gap:clamp(6px, 0.9vw, 12px)'>");
    expect(html).toContain('<th>Brand</th>');
    expect(html).toContain("<img src='https://cdn.gyftr.com/a.png'");
    expect(html).not.toContain('Panel-only name');
  });

  it('leaves no empty pill, box or line behind when a label or field is cleared', async () => {
    // Every label emptied, and a brand with no discount (the "Gift card" placeholder pill used to stay as a grey box).
    const labels = Object.fromEntries(Object.keys(siteSettingsSchema.parse({}).labels).map((k) => [k, '']));
    const c = setup({ labels });
    c.brands.brands[0]!.discountPercent = null;
    const page = await c.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    const content = structuredClone(page.draft);
    for (const section of content.sections) {
      if (section.type === 'hero') for (const t of section.props.trustItems) Object.assign(t, { title: '', text: '' });
      if (section.type === 'features') for (const f of section.props.items) Object.assign(f, { title: '', emoji: '' });
      if (section.type === 'faq') Object.assign(section.props, { eyebrow: '', heading: '', intro: '', helpTitle: '', helpText: '' });
      if (section.type === 'intro') Object.assign(section.props, { eyebrow: '', heading: '', body: '' });
    }
    await c.service.saveDraft(actor, page.id, { expectedVersion: 1, content });
    await c.publications.publish(actor, page.id, 2);
    const html = c.hosted('diwali-gift-cards')!.html;
    const body = html.slice(html.indexOf('</style>'));

    expect(body).toContain('Amazon Pay'); // the page still renders its brands
    expect(body).not.toContain('occ-brand-discount occ-muted');
    // Any element left empty must be purely decorative (aria-hidden), never a visible box with nothing in it.
    const empty = [...body.matchAll(/<(span|p|strong|small|h2|h3|li|div|header|aside)(\s[^>]*)?><\/\1>/g)]
      .map((m) => m[0])
      .filter((tag) => !/aria-hidden/.test(tag));
    expect(empty).toEqual([]);
    expect(body).not.toContain("class='occ-faq-aside'");
    expect(body).not.toContain("class='occ-feature-icon'");
    expect(body).not.toContain("data-section='intro'"); // an intro with nothing in it is left out
    expect(body).toContain("data-section='faq'"); // the questions still show, full width
  });

  it('shows every filter set in the panel: discount ranges without gaps, and categories', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    const chips = async () => {
      const html = ctx.hosted('diwali-gift-cards')!.html;
      return [...html.matchAll(/<button type='button' class='occ-chip'([^>]*)>([^<]*)<\/button>/g)].map((m) => {
        const attrs = m[1]!;
        if (/data-min/.test(attrs)) return `${m[2]} [${/data-min='([^']*)'/.exec(attrs)![1]}, ${/data-max='([^']*)'/.exec(attrs)?.[1] ?? '∞'}]`;
        if (/data-category/.test(attrs)) return `${m[2]} [category ${/data-category='([^']*)'/.exec(attrs)![1]}]`;
        return m[2];
      });
    };

    // Defaults: all four filters, even the ones no brand on this page falls into (both brands here are at 2%).
    await ctx.publications.publish(actor, page.id, 1);
    expect(await chips()).toEqual(['All', 'Up to 5% [0, 5]', '5% – 10% [5, 10]', '10% – 25% [10, 25]', 'Above 25% [25, ∞]']);

    // Edited in the panel: own text, own ranges, and filters with no brands left out.
    const content = structuredClone(page.draft);
    const grid = content.sections.find((s) => s.type === 'brandGrid');
    if (grid?.type !== 'brandGrid') throw new Error('no brand grid');
    grid.props.discountFilters = [
      { id: 'a', kind: 'discount', label: 'Small savings', min: 0, max: 3, category: '' },
      { id: 'b', kind: 'discount', label: '', min: 3, max: null, category: '' },
      { id: 'c', kind: 'category', label: '', min: 0, max: null, category: 'e-commerce' }, // brands are "E-Commerce": case is ignored
      { id: 'd', kind: 'category', label: 'Fashion', min: 0, max: null, category: 'Fashion' },
    ];
    grid.props.hideEmptyFilters = true;
    await ctx.service.saveDraft(actor, page.id, { expectedVersion: 1, content });
    await ctx.publications.publish(actor, page.id, 2);
    expect(await chips()).toEqual(['All', 'Small savings [0, 3]', 'e-commerce [category e-commerce]']);
    // The cards carry what the page script filters on.
    expect(ctx.hosted('diwali-gift-cards')!.html).toContain("data-category='E-Commerce'");
  });

  it('draws every section icon and decoration as set in the panel: another icon, an image, or none', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    await ctx.publications.publish(actor, page.id, 1);
    const before = ctx.hosted('diwali-gift-cards')!.html;
    // Defaults draw what the pages always had: the T&C shield, the FAQ "+", numbers and ornaments.
    expect(before).toContain("class='occ-faq-toggle'");
    expect(before).toContain("class='occ-faq-index'");
    expect(before).toContain("class='occ-ornament");
    expect(before).toContain(`<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4'`); // the shield

    const content = structuredClone(page.draft);
    const none = { name: 'none' as const, image: { url: '', alt: '' } };
    for (const s of content.sections) {
      if (s.type === 'terms') Object.assign(s.props, { headingIcon: { name: 'none', image: { url: 'https://cdn.gyftr.com/rules.png', alt: '' } }, toggleIcon: none });
      if (s.type === 'faq') Object.assign(s.props, { toggleIcon: none, helpIcon: { name: 'star', image: { url: '', alt: '' } }, showNumbers: false, showOrnament: false });
      if (s.type === 'features') Object.assign(s.props, { showNumbers: false, showOrnament: false });
      if (s.type === 'brandGrid' || s.type === 'brandTabs') Object.assign(s.props, { discountIcon: none, ctaIcon: none, showOrnament: false });
      if (s.type === 'intro') Object.assign(s.props, { showOrnament: false, showDecorations: false });
      if (s.type === 'richText') Object.assign(s.props, { showMark: false });
      if (s.type === 'hero') Object.assign(s.props, { ctaIcon: none });
    }
    await ctx.service.saveDraft(actor, page.id, { expectedVersion: 1, content });
    await ctx.publications.publish(actor, page.id, 2);
    const html = ctx.hosted('diwali-gift-cards')!.html;

    expect(JSON.stringify(html)).toBe(`"${html}"`); // still JSON-safe
    expect(html).toContain("<img src='https://cdn.gyftr.com/rules.png' alt='' width='18' height='18' loading='lazy' class='occ-slot-icon' aria-hidden='true'/>"); // the T&C icon is the uploaded image
    const terms = /<section[^>]*data-section='terms'[\s\S]*?<\/section>/.exec(html)![0];
    expect(terms).not.toContain('<svg'); // no shield, no open / close arrow: only the uploaded image
    expect(html).not.toContain("class='occ-faq-toggle'");
    expect(html).not.toContain("class='occ-faq-index'");
    expect(html).not.toContain("class='occ-feature-num'");
    expect(html).not.toContain("class='occ-ornament");
    expect(html).not.toContain("class='occ-rich-text-mark'");
    expect(html).not.toMatch(/occ-brand-discount'><svg/); // no ticket icon before the discount
    expect(html).toContain('M12 3l2.7 5.6'); // the FAQ help box now shows a star
  });

  it('stores the top banner images and the published flag for gyftr.com', async () => {
    const page = await ctx.service.create(actor, { occasionId: occasion.id, title: 'Diwali', pageUrl: `${BASE}/diwali-gift-cards`, templateId: 'default' });
    await ctx.publications.publish(actor, page.id, 1);
    expect(ctx.hosted('diwali-gift-cards')).toMatchObject({ isPublished: true, desktopBanner: null, mobileBanner: null }); // no banner image yet

    const content = structuredClone((await ctx.service.get(page.id)).draft);
    const hero = content.sections.find((s) => s.type === 'hero');
    if (hero?.type !== 'hero') throw new Error('template has no banner section');
    hero.props.slides[0]!.desktopImage.url = 'https://media.example/occasion-pages/desktop.webp';
    hero.props.slides[0]!.mobileImage.url = 'https://media.example/occasion-pages/mobile.webp';
    await ctx.service.saveDraft(actor, page.id, { expectedVersion: 1, content });
    await ctx.publications.publish(actor, page.id, 2);
    expect(ctx.hosted('diwali-gift-cards')).toMatchObject({
      isPublished: true,
      desktopBanner: 'https://media.example/occasion-pages/desktop.webp',
      mobileBanner: 'https://media.example/occasion-pages/mobile.webp',
    });

    hero.visible = false; // a hidden banner section is not on the page, so there is no banner
    await ctx.service.saveDraft(actor, page.id, { expectedVersion: 2, content });
    await ctx.publications.publish(actor, page.id, 3);
    expect(ctx.hosted('diwali-gift-cards')).toMatchObject({ desktopBanner: null, mobileBanner: null });
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
    const content = { ...page.draft, sections: [sectionSchema.parse({ id: 's1', type: 'intro', visible: true, anchor: '', props: { eyebrow: '', heading: 'Hi', body: '', align: 'center', tone: 'surface' } })] };
    await ctx.service.saveDraft(actor, page.id, { expectedVersion: 1, content });
    await ctx.publications.publish(actor, page.id, 2);
    const renamed = await ctx.service.saveDraft(actor, page.id, { expectedVersion: 2, pageUrl: `${BASE}/diwali-new`, content });
    expect(renamed.liveUrl).toBe(`${BASE}/diwali-old`);
    await ctx.publications.publish(actor, page.id, 3);
    expect(ctx.hosted('diwali-old')).toBeNull();
    expect(ctx.hosted('diwali-new')?.version).toBe(3);
  });
});
