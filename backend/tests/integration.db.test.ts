import { randomBytes, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/config/migrate';
import { createPrismaClient } from '../src/db';
import { PrismaPageRepository } from '../src/repositories/prisma/PrismaPageRepository';
import { PrismaPublicationRepository } from '../src/repositories/prisma/PrismaPublicationRepository';
import type { PageSeo } from '../src/render/seo';
import { ensureTechReader } from '../src/techAccess';

/**
 * What the gyftr.com tech team depends on, checked against a real PostgreSQL: the schema the
 * application creates at start-up, the publish / refresh / unpublish queries, the read-only login
 * created by prisma/tech_reader.sql, and the two queries their backend runs with it
 * (docs/INTEGRATION_DATABASE.md).
 *
 * Runs only when TEST_DATABASE_URL points at a THROWAWAY database whose name ends in "_test"
 * (CI provides one). The database is wiped first.
 */
const url = process.env.TEST_DATABASE_URL;

/** A login of its own, so a real tech_reader on the same server is never touched. */
const LOGIN = 'tech_reader_test';

/** Query 1 of docs/INTEGRATION_DATABASE.md, word for word: every occasion, and whether it has a published page. */
const PUBLISHED_OCCASIONS = `
SELECT o."slug"                          AS occasion_slug,
       o."name"                          AS occasion_name,
       COALESCE(pp."isPublished", false) AS is_published,
       pp."slug"                         AS page_slug,
       pp."desktopBanner"                AS desktop_banner,
       pp."mobileBanner"                 AS mobile_banner,
       pp."version"                      AS version,
       pp."publishedAt"                  AS published_at,
       pp."renderedAt"                   AS updated_at
FROM "Occasion" o
LEFT JOIN ("Page" p JOIN "PagePublication" pp ON pp."pageId" = p."id")
       ON p."occasionId" = o."id"
ORDER BY is_published DESC, o."name", pp."slug"`;

/** Query 2 of docs/INTEGRATION_DATABASE.md, word for word: the HTML of one page, by page_slug from query 1. */
const PAGE_HTML = `
SELECT pp."slug"                          AS page_slug,
       pp."source"                        AS source,
       pp."isPublished"                   AS is_published,
       pp."version"                       AS version,
       pp."html"                          AS html,
       pp."desktopBanner"                 AS desktop_banner,
       pp."mobileBanner"                  AS mobile_banner,
       pp."seo" ->> 'title'               AS meta_title,
       pp."seo" ->> 'description'         AS meta_description,
       pp."seo" ->> 'keywords'            AS meta_keywords,
       pp."seo" ->> 'canonicalUrl'        AS canonical_url,
       (pp."seo" ->> 'noIndex')::boolean  AS no_index,
       pp."seo" ->> 'ogImage'             AS og_image,
       pp."seo" -> 'jsonLd'               AS json_ld,
       pp."publishedAt"                   AS published_at,
       pp."renderedAt"                    AS updated_at
FROM "PagePublication" pp
WHERE pp."slug" = $1`;

type Row = Record<string, unknown>;

describe.skipIf(!url)('database: schema at start-up and the tech team\'s read-only login', () => {
  let db: PrismaClient;
  let tech: PrismaClient;
  const password = randomBytes(18).toString('base64'); // like `openssl rand -base64 24`: may contain + / =
  const migrationResults: string[] = [];
  const seo: PageSeo = { title: 'Diwali | GyFTR', description: 'd', keywords: 'k', canonicalUrl: 'https://www.gyftr.com/occasion/diwali', noIndex: false, ogImage: '', jsonLd: [{ '@type': 'FAQPage' }] };
  const banners = { desktopBanner: 'https://media.example/occasion-pages/d.webp', mobileBanner: 'https://media.example/occasion-pages/m.webp' };
  const userId = randomUUID();
  let pageId: string;

  /** A connection signed in as the tech login, with its password: exactly what their backend has. */
  const signInAsTech = (withPassword: string): PrismaClient => {
    const target = new URL(url!);
    target.username = LOGIN;
    target.password = encodeURIComponent(withPassword);
    return createPrismaClient(target.toString());
  };
  const loginExists = async () => (await db.$queryRawUnsafe<{ exists: boolean }[]>(`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LOGIN}') AS "exists"`))[0]!.exists;
  const dropLogin = async () => {
    if (!(await loginExists())) return;
    await db.$executeRawUnsafe(`DROP OWNED BY ${LOGIN}`);
    await db.$executeRawUnsafe(`DROP ROLE ${LOGIN}`);
  };
  const asTech = <T = Row[]>(sql: string, ...params: unknown[]): Promise<T> => tech.$queryRawUnsafe<T>(sql, ...params);

  beforeAll(async () => {
    const target = new URL(url!);
    if (!target.pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL must name a database ending in "_test": it is wiped');
    db = createPrismaClient(url!);
    await dropLogin();
    await db.$executeRawUnsafe('DROP SCHEMA public CASCADE');
    await db.$executeRawUnsafe('CREATE SCHEMA public');
    await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO PUBLIC'); // as in every new database

    // A record left by an attempt that failed (for example before a permission was granted) must not block the next one.
    await db.$executeRawUnsafe('CREATE TABLE "_prisma_migrations" ("id" VARCHAR(36) PRIMARY KEY NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ, "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ, "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)');
    await db.$executeRawUnsafe(`INSERT INTO "_prisma_migrations" (id, checksum, migration_name, logs) VALUES ('00000000-0000-0000-0000-000000000000', 'x', '20261011120000_init', 'permission denied for database')`);

    migrationResults.push(await runMigrations(url!));
    migrationResults.push(await runMigrations(url!)); // every start-up runs it again

    await db.user.create({ data: { id: userId, email: 'a@gyftr.net', name: 'A', passwordHash: 'x' } });
    const occasion = await db.occasion.create({ data: { slug: 'diwali-gift-cards', name: 'Diwali Gift Cards', shortName: 'Diwali', pageUrl: 'https://www.gyftr.com/occasion/diwali', theme: {} } });
    await db.occasion.create({ data: { slug: 'holi-gift-ideas', name: 'Holi Gift Cards', shortName: 'Holi', pageUrl: 'https://www.gyftr.com/occasion/holi', theme: {} } });
    const page = await db.page.create({ data: { slug: 'diwali', title: 'Diwali', occasionId: occasion.id, draft: {} } });
    pageId = page.id;
  }, 120_000);

  afterAll(async () => {
    await tech?.$disconnect();
    if (db) await dropLogin().catch(() => undefined);
    await db?.$disconnect();
  });

  const revision = { kind: 'PUBLISH' as const, title: 'Diwali', slug: 'diwali', content: {}, note: '', createdById: userId };
  const html = async () => (await asTech(PAGE_HTML, 'diwali'))[0];

  it('creates the schema once, and recovers from an earlier failed attempt', async () => {
    expect(migrationResults).toEqual(['Applied 20261011120000_init, 20261012120000_user_must_change_password, 20261014120000_publication_banners_and_status', 'No pending migrations']);
    const history = await db.$queryRawUnsafe<{ migration_name: string; applied: boolean; rolled_back: boolean }[]>(
      'SELECT migration_name, finished_at IS NOT NULL AS applied, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY started_at, migration_name',
    );
    expect(history).toEqual([
      { migration_name: '20261011120000_init', applied: false, rolled_back: true }, // the failed attempt, closed
      { migration_name: '20261011120000_init', applied: true, rolled_back: false },
      { migration_name: '20261012120000_user_must_change_password', applied: true, rolled_back: false },
      { migration_name: '20261014120000_publication_banners_and_status', applied: true, rolled_back: false },
    ]);
    const tables = await db.$queryRawUnsafe<{ count: number }[]>(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'`);
    expect(tables[0]!.count).toBe(10);
    const otherSchemas = await db.$queryRawUnsafe<{ count: number }[]>(`SELECT count(*)::int AS count FROM information_schema.schemata WHERE schema_name = 'integration'`);
    expect(otherSchemas[0]!.count).toBe(0); // tables in "public" only: no other schema is created
  });

  it('the start-up script creates the tech login from the configured password, and only then', async () => {
    expect((await ensureTechReader(url!, undefined, LOGIN)).warnings).toEqual([]); // no password configured: nothing is created
    expect(await loginExists()).toBe(false);

    // Several containers start together: one creates the login, the others wait for it.
    const together = await Promise.all([1, 2, 3].map(() => ensureTechReader(url!, password, LOGIN)));
    expect(together.flatMap((r) => r.warnings)).toEqual([]);
    expect(await loginExists()).toBe(true);

    // Every start-up runs it again, and leaves a password that is already the configured one alone.
    const stored = () => db.$queryRawUnsafe<{ rolpassword: string }[]>(`SELECT rolpassword FROM pg_authid WHERE rolname = '${LOGIN}'`).catch(() => []);
    const before = await stored();
    expect((await ensureTechReader(url!, password, LOGIN)).warnings).toEqual([]);
    expect(await stored()).toEqual(before);
    if (before.length) expect(before[0]!.rolpassword).toMatch(/^SCRAM-SHA-256\$/); // where pg_authid is readable: stored hashed

    tech = signInAsTech(password); // a real sign-in with the password, as their backend does
    expect(await asTech('SELECT current_user::text AS "user"')).toEqual([{ user: LOGIN }]);
    await expect(signInAsTech('not-the-password').$queryRawUnsafe('SELECT 1')).rejects.toThrow(/password authentication failed/);

    const attributes = await db.$queryRawUnsafe<Row[]>(`SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit, rolcanlogin, rolconnlimit FROM pg_roles WHERE rolname = '${LOGIN}'`);
    expect(attributes).toEqual([{ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false, rolinherit: false, rolcanlogin: true, rolconnlimit: 20 }]);
    const limits = await asTech(`SELECT current_setting('default_transaction_read_only') AS read_only, current_setting('statement_timeout') AS statement_timeout, current_setting('lock_timeout') AS lock_timeout, current_setting('idle_in_transaction_session_timeout') AS idle_in_transaction`);
    expect(limits).toEqual([{ read_only: 'on', statement_timeout: '15s', lock_timeout: '5s', idle_in_transaction: '1min' }]);
  });

  it('refuses to manage anything but a plain login', async () => {
    const [me] = await db.$queryRawUnsafe<{ user: string }[]>('SELECT current_user::text AS "user"');
    await expect(ensureTechReader(url!, undefined, me!.user)).rejects.toThrow(/refusing to manage/);
  });

  it('lists every occasion as not published while no page is published', async () => {
    expect(await asTech(PUBLISHED_OCCASIONS)).toMatchObject([
      { occasion_slug: 'diwali-gift-cards', is_published: false, page_slug: null, desktop_banner: null },
      { occasion_slug: 'holi-gift-ideas', is_published: false, page_slug: null },
    ]);
    expect(await asTech(PAGE_HTML, 'diwali')).toEqual([]);
  });

  it('after a publish: query 1 lists the occasion, and query 2 returns its HTML by page_slug', async () => {
    const pages = new PrismaPageRepository(db);
    const published = await pages.publish(pageId, 1, { published: {}, publishedSlug: 'diwali', publishedById: userId }, revision, { html: '<style></style>\n<div>v1</div>\n<script></script>', seo, ...banners });
    expect(published?.status).toBe('PUBLISHED');

    const list = await asTech(PUBLISHED_OCCASIONS);
    expect(Object.keys(list[0]!)).toEqual(['occasion_slug', 'occasion_name', 'is_published', 'page_slug', 'desktop_banner', 'mobile_banner', 'version', 'published_at', 'updated_at']);
    expect(list).toMatchObject([
      { occasion_slug: 'diwali-gift-cards', occasion_name: 'Diwali Gift Cards', is_published: true, page_slug: 'diwali', ...{ desktop_banner: banners.desktopBanner, mobile_banner: banners.mobileBanner }, version: 1 },
      { occasion_slug: 'holi-gift-ideas', is_published: false, page_slug: null }, // Holi has no published page
    ]);

    const rows = await asTech(PAGE_HTML, list[0]!.page_slug);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!)).toEqual(['page_slug', 'source', 'is_published', 'version', 'html', 'desktop_banner', 'mobile_banner', 'meta_title', 'meta_description', 'meta_keywords', 'canonical_url', 'no_index', 'og_image', 'json_ld', 'published_at', 'updated_at']);
    expect(rows[0]).toMatchObject({
      page_slug: 'diwali',
      source: 'OCCASION_PAGE_BUILDER',
      is_published: true,
      version: 1,
      html: '<style></style>\n<div>v1</div>\n<script></script>',
      desktop_banner: banners.desktopBanner,
      mobile_banner: banners.mobileBanner,
      meta_title: seo.title,
      meta_description: 'd',
      meta_keywords: 'k',
      canonical_url: seo.canonicalUrl,
      no_index: false,
      og_image: '',
      json_ld: seo.jsonLd,
    });
    expect(rows[0]!.published_at).toBeInstanceOf(Date);
  });

  it('the tech login reads only what the two queries need, and cannot change anything', async () => {
    await expect(asTech('SELECT count(*) FROM "Occasion"')).resolves.toHaveLength(1);
    await expect(asTech('SELECT "id", "occasionId" FROM "Page"')).resolves.toHaveLength(1);
    // Of "Page" only the two linking columns: drafts and unpublished content stay private.
    for (const sql of ['SELECT * FROM "Page"', 'SELECT "draft" FROM "Page"', 'SELECT "title" FROM "Page"']) {
      await expect(asTech(sql), sql).rejects.toThrow(/permission denied/);
    }
    for (const table of ['User', 'AuditLog', 'Brand', 'Media', 'PageRevision', 'SiteSetting', 'Template', '_prisma_migrations']) {
      await expect(asTech(`SELECT count(*) FROM "${table}"`), table).rejects.toThrow(/permission denied/);
    }
    const writes = [
      `UPDATE "PagePublication" SET "html" = 'changed'`,
      `DELETE FROM "PagePublication"`,
      `DELETE FROM "Page"`,
      `INSERT INTO "Occasion" ("id", "slug", "name", "shortName", "pageUrl", "theme", "updatedAt") VALUES (gen_random_uuid(), 'x', 'x', 'x', 'x', '{}', now())`,
      'CREATE TABLE intruder (id int)',
      'DROP TABLE "PagePublication"',
    ];
    for (const sql of writes) {
      // Refused as it comes (its transactions are read-only) ...
      await expect(tech.$executeRawUnsafe(sql), sql).rejects.toThrow(/read-only transaction|permission denied|must be owner/);
      // ... and still refused when the session switches that off: it simply has no right to write.
      await expect(
        tech.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET TRANSACTION READ WRITE');
          await tx.$executeRawUnsafe(sql);
        }),
        sql,
      ).rejects.toThrow(/permission denied|must be owner/);
    }
    expect((await html())!.html).toContain('v1'); // nothing was changed
  });

  it('every start-up puts the rights back to exactly these, whatever was granted in between', async () => {
    await db.$executeRawUnsafe(`GRANT SELECT ON "User", "Page" TO ${LOGIN}`);
    await db.$executeRawUnsafe(`GRANT INSERT, UPDATE, DELETE ON "PagePublication" TO ${LOGIN}`);
    await expect(asTech('SELECT count(*) FROM "User"')).resolves.toHaveLength(1);

    expect((await ensureTechReader(url!, password, LOGIN)).warnings).toEqual([]);
    await expect(asTech('SELECT count(*) FROM "User"')).rejects.toThrow(/permission denied/);
    await expect(asTech('SELECT "draft" FROM "Page"')).rejects.toThrow(/permission denied/);
    const tables = await db.$queryRawUnsafe<Row[]>(`SELECT table_name::text AS "table", privilege_type::text AS "right" FROM information_schema.role_table_grants WHERE grantee = '${LOGIN}' ORDER BY 1, 2`);
    expect(tables).toEqual([{ table: 'Occasion', right: 'SELECT' }, { table: 'PagePublication', right: 'SELECT' }]);
    const columns = await db.$queryRawUnsafe<Row[]>(`SELECT column_name::text AS "column", privilege_type::text AS "right" FROM information_schema.column_privileges WHERE grantee = '${LOGIN}' AND table_name = 'Page' ORDER BY 1, 2`);
    expect(columns).toEqual([{ column: 'id', right: 'SELECT' }, { column: 'occasionId', right: 'SELECT' }]);
    expect((await asTech(PUBLISHED_OCCASIONS))[0]).toMatchObject({ is_published: true }); // and the two queries still work
  });

  it('a stale publish changes nothing', async () => {
    const pages = new PrismaPageRepository(db);
    expect(await pages.publish(pageId, 7, { published: {}, publishedSlug: 'diwali', publishedById: userId }, revision, { html: 'stale', seo, ...banners })).toBeNull();
    expect((await html())!.html).toContain('v1');
  });

  it('a refresh updates changed HTML, skips identical HTML, and ignores other versions', async () => {
    const publications = new PrismaPublicationRepository(db);
    const before = (await html())!.updated_at as Date;

    expect(await publications.refresh(pageId, 1, async () => ({ html: '<style></style>\n<div>v1</div>\n<script></script>', seo, ...banners }))).toBe('unchanged');
    expect(((await html())!.updated_at as Date).getTime()).toBe(before.getTime());

    expect(await publications.refresh(pageId, 1, async () => ({ html: 'new discount', seo, ...banners }))).toBe('updated');
    const row = await html();
    expect(row!.html).toBe('new discount');
    expect((row!.updated_at as Date).getTime()).toBeGreaterThan(before.getTime());

    // A new banner image alone is a change too.
    const newBanner = { ...banners, mobileBanner: 'https://media.example/occasion-pages/m2.webp' };
    expect(await publications.refresh(pageId, 1, async () => ({ html: 'new discount', seo, ...newBanner }))).toBe('updated');
    expect((await html())!.mobile_banner).toBe(newBanner.mobileBanner);

    expect(await publications.refresh(pageId, 2, async () => ({ html: 'wrong version', seo, ...banners }))).toBe('gone');
    expect((await html())!.html).toBe('new discount');
  });

  it('unpublishing removes the page from both queries in the same step, and a late refresh cannot bring it back', async () => {
    const page = await new PrismaPageRepository(db).setStatus(pageId, 'DRAFT', { clearPublished: true });
    expect(page).toMatchObject({ status: 'DRAFT', publishedSlug: null });
    expect((await asTech(PUBLISHED_OCCASIONS)).map((r) => r.is_published)).toEqual([false, false]);
    expect(await asTech(PAGE_HTML, 'diwali')).toEqual([]);
    expect(await new PrismaPublicationRepository(db).refresh(pageId, 1, async () => ({ html: 'late', seo, ...banners }))).toBe('gone');
    expect(await asTech(PAGE_HTML, 'diwali')).toEqual([]);
  });

  it('a changed password in the settings replaces the login\'s password at the next start-up', async () => {
    const next = randomBytes(18).toString('base64');
    expect((await ensureTechReader(url!, next, LOGIN)).warnings).toEqual([]);
    await expect(signInAsTech(password).$queryRawUnsafe('SELECT 1')).rejects.toThrow(/password authentication failed/);
    const again = signInAsTech(next);
    expect(await again.$queryRawUnsafe('SELECT 1 AS ok')).toEqual([{ ok: 1 }]);
    await again.$disconnect();
  });
});
