import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/config/migrate';
import { createPrismaClient } from '../src/db';
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
  const migrationResults: string[] = [];
  const seo: PageSeo = { title: 'Diwali | GyFTR', description: 'd', keywords: 'k', canonicalUrl: 'https://www.gyftr.com/occasion/diwali', noIndex: false, ogImage: '', jsonLd: [{ '@type': 'FAQPage' }] };
  const userId = randomUUID();
  let pageId: string;

  beforeAll(async () => {
    const target = new URL(url!);
    if (!target.pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL must name a database ending in "_test": it is wiped');
    db = createPrismaClient(url!);
    await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS integration CASCADE');
    await db.$executeRawUnsafe('DROP SCHEMA public CASCADE');
    await db.$executeRawUnsafe('CREATE SCHEMA public');

    // A record left by an attempt that failed (for example before a permission was granted) must not block the next one.
    await db.$executeRawUnsafe('CREATE TABLE "_prisma_migrations" ("id" VARCHAR(36) PRIMARY KEY NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ, "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ, "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)');
    await db.$executeRawUnsafe(`INSERT INTO "_prisma_migrations" (id, checksum, migration_name, logs) VALUES ('00000000-0000-0000-0000-000000000000', 'x', '20261011120000_init', 'permission denied for database')`);

    migrationResults.push(await runMigrations(url!));
    migrationResults.push(await runMigrations(url!)); // every start-up runs it again

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

  it('creates the schema once, and recovers from an earlier failed attempt', async () => {
    expect(migrationResults).toEqual(['Applied 20261011120000_init, 20261012120000_user_must_change_password', 'No pending migrations']);
    const history = await db.$queryRawUnsafe<{ migration_name: string; applied: boolean; rolled_back: boolean }[]>(
      'SELECT migration_name, finished_at IS NOT NULL AS applied, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY started_at, migration_name',
    );
    expect(history).toEqual([
      { migration_name: '20261011120000_init', applied: false, rolled_back: true }, // the failed attempt, closed
      { migration_name: '20261011120000_init', applied: true, rolled_back: false },
      { migration_name: '20261012120000_user_must_change_password', applied: true, rolled_back: false },
    ]);
    const tables = await db.$queryRawUnsafe<{ count: number }[]>(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'`);
    expect(tables[0]!.count).toBe(10);
  });

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
