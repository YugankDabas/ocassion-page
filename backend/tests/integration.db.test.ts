import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureIntegrationView } from '../src/integrationView';
import { PrismaPageRepository } from '../src/repositories/prisma/PrismaPageRepository';
import { PrismaPublicationRepository } from '../src/repositories/prisma/PrismaPublicationRepository';
import type { PageSeo } from '../src/render/seo';

/**
 * The database contract the gyftr.com backend depends on, checked against a real PostgreSQL:
 * the migration, the view and the publish / refresh / unpublish queries.
 *
 * Runs only when TEST_DATABASE_URL points at a THROWAWAY database whose name ends in "_test"
 * (CI provides one). The database is wiped first.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('database contract (integration.published_pages)', () => {
  let db: PrismaClient;
  const seo: PageSeo = { title: 'Diwali | GyFTR', description: 'd', keywords: 'k', canonicalUrl: 'https://www.gyftr.com/occasion/diwali', noIndex: false, ogImage: '', jsonLd: [{ '@type': 'FAQPage' }] };
  const userId = randomUUID();
  let pageId: string;

  beforeAll(async () => {
    const target = new URL(url!);
    if (!target.pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL must name a database ending in "_test": it is wiped');
    db = new PrismaClient({ datasourceUrl: url });
    await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS integration CASCADE');
    await db.$executeRawUnsafe('DROP SCHEMA public CASCADE');
    await db.$executeRawUnsafe('CREATE SCHEMA public');

    const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });

    // The application creates the view at start-up; doing it twice must be harmless.
    await ensureIntegrationView(db);
    await ensureIntegrationView(db);

    await db.user.create({ data: { id: userId, email: 'a@gyftr.net', name: 'A', passwordHash: 'x' } });
    const occasion = await db.occasion.create({ data: { slug: 'diwali', name: 'Diwali', shortName: 'Diwali', pageUrl: 'https://www.gyftr.com/occasion/diwali', theme: {} } });
    const page = await db.page.create({ data: { slug: 'diwali', title: 'Diwali', occasionId: occasion.id, draft: {} } });
    pageId = page.id;
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  const revision = { kind: 'PUBLISH' as const, title: 'Diwali', slug: 'diwali', content: {}, note: '', createdById: userId };
  const view = () => db.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM integration.published_pages WHERE slug = 'diwali'`);

  it('has no row for a page that is not published', async () => {
    expect(await view()).toEqual([]);
  });

  it('publishing stores the page and its HTML together, and the view exposes the documented columns', async () => {
    const pages = new PrismaPageRepository(db);
    const published = await pages.publish(pageId, 1, { published: {}, publishedSlug: 'diwali', publishedById: userId }, revision, { html: '<style></style>\n<div>v1</div>\n<script></script>', seo });
    expect(published?.status).toBe('PUBLISHED');

    const [row] = await view();
    expect(Object.keys(row!)).toEqual(['slug', 'source', 'version', 'html', 'meta_title', 'meta_description', 'meta_keywords', 'canonical_url', 'no_index', 'og_image', 'json_ld', 'published_at', 'updated_at']);
    expect(row).toMatchObject({
      slug: 'diwali',
      source: 'OCCASION_PAGE_BUILDER',
      version: 1,
      html: '<style></style>\n<div>v1</div>\n<script></script>',
      meta_title: seo.title,
      meta_description: 'd',
      meta_keywords: 'k',
      canonical_url: seo.canonicalUrl,
      no_index: false,
      og_image: '',
      json_ld: seo.jsonLd,
    });
    expect(row!.published_at).toBeInstanceOf(Date);
  });

  it('a stale publish changes nothing', async () => {
    const pages = new PrismaPageRepository(db);
    expect(await pages.publish(pageId, 7, { published: {}, publishedSlug: 'diwali', publishedById: userId }, revision, { html: 'stale', seo })).toBeNull();
    expect((await view())[0]!.html).toContain('v1');
  });

  it('a refresh updates changed HTML, skips identical HTML, and ignores other versions', async () => {
    const publications = new PrismaPublicationRepository(db);
    const before = (await view())[0]!.updated_at as Date;

    expect(await publications.refresh(pageId, 1, async () => ({ html: '<style></style>\n<div>v1</div>\n<script></script>', seo }))).toBe('unchanged');
    expect(((await view())[0]!.updated_at as Date).getTime()).toBe(before.getTime());

    expect(await publications.refresh(pageId, 1, async () => ({ html: 'new discount', seo }))).toBe('updated');
    const [row] = await view();
    expect(row!.html).toBe('new discount');
    expect((row!.updated_at as Date).getTime()).toBeGreaterThan(before.getTime());

    expect(await publications.refresh(pageId, 2, async () => ({ html: 'wrong version', seo }))).toBe('gone');
    expect((await view())[0]!.html).toBe('new discount');
  });

  it('unpublishing removes the row in the same step, and a late refresh cannot bring it back', async () => {
    const page = await new PrismaPageRepository(db).setStatus(pageId, 'DRAFT', { clearPublished: true });
    expect(page).toMatchObject({ status: 'DRAFT', publishedSlug: null });
    expect(await view()).toEqual([]);
    expect(await new PrismaPublicationRepository(db).refresh(pageId, 1, async () => ({ html: 'late', seo }))).toBe('gone');
    expect(await view()).toEqual([]);
  });
});
