# GyFTR Occasion Page Builder — complete guide

One document that explains the whole system: what it does, how a page reaches gyftr.com, the database,
the exact queries, every folder and file of the backend, the configuration, and what DevOps and the
gyftr.com backend team need to do.

Related files: [`README.md`](../README.md) (quick start) and
[`INTEGRATION_DATABASE.md`](INTEGRATION_DATABASE.md) (the short contract to hand to the gyftr.com backend team).

---

## 1. What it is

An admin panel where the GyFTR team builds occasion landing pages (Diwali, Holi, Christmas, …) without a
code deploy.

- An editor builds a page from sections (banner, intro, brand grid, FAQs, …) by drag and drop.
- **Publish** turns the page into HTML and stores it in the database.
- The gyftr.com backend reads that HTML from the database and gives it to the gyftr.com frontend, which
  shows it between the site's own header and footer.

What the panel does **not** do: it does not push anything to gyftr.com, it exposes no API to gyftr.com, and
it does not render the site header, footer, login or cart. Those stay with gyftr.com.

## 2. How a page reaches gyftr.com

```
 Editor ──► Admin panel ──► Admin API ──► PostgreSQL (RDS)
                               │              ▲
                               │ images       │ SELECT … FROM integration.published_pages WHERE slug = ?
                               ▼              │
                              S3        gyftr.com backend ──► gyftr.com frontend (header + OUR HTML + footer)
```

1. The editor saves. The page is stored as JSON in `Page.draft`. gyftr.com sees nothing yet.
2. The editor clicks **Publish**. The API renders the page body to one HTML string
   (`<style>` + markup + `<script>`) and writes one row to the table `PagePublication`.
3. A visitor opens `https://www.gyftr.com/occasion/<slug>`. The gyftr.com backend looks the slug up in the
   view `integration.published_pages`.
4. **Row found** → the page is ours: it sends `html` to the frontend. **No row** → gyftr.com serves its own page.
5. **Unpublish** or **Archive** deletes the row. A brand discount change re-renders the row automatically.

## 3. What identifies our page

| Question | Answer |
| --- | --- |
| Which table holds the published HTML? | `PagePublication` |
| What uniquely identifies a page? | `slug` — the primary key. It is the last part of the URL `/occasion/<slug>`. |
| Which field says "this is a panel page"? | `source`, a stored column, always `OCCASION_PAGE_BUILDER`. |
| What is the real test? | A row exists for the slug only while the page is published from the panel. |

## 4. For the gyftr.com backend: the view and the queries

The gyftr.com backend reads **one view**, `integration.published_pages`. It never reads our tables, so we
can change them without breaking gyftr.com.

| Column | Type | Meaning |
| --- | --- | --- |
| `slug` | text | URL slug; the lookup key. |
| `source` | text | Always `OCCASION_PAGE_BUILDER`. |
| `version` | integer | Goes up each time an editor publishes. |
| `html` | text | The page body to insert between header and footer. About 240 KB. |
| `meta_title`, `meta_description`, `meta_keywords` | text | For the `<head>`. |
| `canonical_url` | text | For `<link rel="canonical">`. |
| `no_index` | boolean | `true` = emit `noindex, nofollow`. |
| `og_image` | text | Absolute URL or empty. |
| `json_ld` | jsonb | Array of schema.org objects. |
| `published_at` | timestamp (UTC) | When this version was published. |
| `updated_at` | timestamp (UTC) | Last time `html` actually changed. Safe to use as a cache key. |

Get a page (the only query needed per request):

```sql
SELECT source, html, meta_title, meta_description, meta_keywords,
       canonical_url, no_index, og_image, json_ld, version, updated_at
FROM integration.published_pages
WHERE slug = $1;
```

Check for a change without fetching the HTML:

```sql
SELECT version, updated_at FROM integration.published_pages WHERE slug = $1;
```

List what the panel hosts:

```sql
SELECT slug, version, published_at, updated_at FROM integration.published_pages ORDER BY slug;
```

Rules for the gyftr.com side:

- Cache each slug for 30–60 seconds, including "no row". Do not query on every page view.
- If the query fails, serve the cached copy or the existing gyftr.com page. Never fail the page.
- Validate the slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, at most 120 characters) and use bound parameters.
- Insert `html` unchanged in a full-width container. On client-side navigation, a script inserted with
  `innerHTML` does not run: re-create the script element, then call `window.GyftrOccasion.init()`.
- The HTML cannot clash with the site: every class is prefixed `occ-`, every CSS rule is scoped under
  `.occ-occasion`, fonts are embedded, and the script touches only its own elements.

Database access is granted by DevOps. The gyftr.com backend needs only `SELECT` on this view; a read-only
login limited to it is recommended, so it cannot see drafts, users or password hashes.

## 5. The database: 10 tables

Images are **not** stored in the database. They are in S3; the database holds their URLs.

| Table | What it stores | Important fields |
| --- | --- | --- |
| `User` | People who can log in to the panel | `email` (unique), `passwordHash` (bcrypt), `role` (ADMIN / PUBLISHER / EDITOR), `isActive`, `tokenVersion` (bump = all sessions revoked), `lastLoginAt` |
| `Occasion` | The occasions (Diwali, Holi, …) | `slug`, `name`, `shortName`, `recipients`, `emoji` (used in template text), `pageUrl`, `theme` (default colours), `sortOrder`, `isActive` |
| `Page` | One page being built | `slug`, `title`, `occasionId`, `status` (DRAFT / PUBLISHED / ARCHIVED), `draft` (JSON being edited), `draftVersion` (optimistic lock), `published` (JSON snapshot taken at publish), `publishedSlug`, `publishedVersion`, `publishedAt`, who created / updated / published |
| `PageRevision` | History, for restore | `pageId`, `version`, `kind` (SAVE / PUBLISH / RESTORE), `content`, `note` |
| `PagePublication` | **The HTML gyftr.com reads** | `slug` (primary key), `source`, `pageId` (unique), `version`, `html`, `seo` (JSON), `publishedAt`, `renderedAt` |
| `Template` | Saved page layouts | `name`, `occasionId`, `content` |
| `Brand` | Brand cards shown on pages | `name`, `slug`, `logoUrl`, `productUrl`, `discountPercent`, `discountLabel`, `category`, `redemption`, `minDenomination`, `isActive` |
| `Media` | A record per uploaded image (the file is in S3) | `storageKey` (S3 key), `url`, `mimeType`, `width`, `height`, `sizeBytes`, `originalName`, `alt` |
| `SiteSetting` | Header / footer links used in preview and download | one row: `key = 'site'`, `value` JSON |
| `AuditLog` | Who did what | `actorId`, `action`, `entityType`, `entityId`, `metadata`, `ip` |

The view `integration.published_pages` is a plain `SELECT` over `PagePublication` that splits the `seo`
JSON into the `meta_*` columns. Table definitions: [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma).
The SQL that creates the tables and the view:
[`backend/prisma/migrations/20261011120000_init/migration.sql`](../backend/prisma/migrations/20261011120000_init/migration.sql).

Why the page is stored twice (`Page.draft` / `Page.published` JSON and `PagePublication.html`): the JSON is
what editors change; the HTML is the finished output gyftr.com reads. Editors can keep changing the draft
without touching the live page until they publish again.

## 6. The publish flow, with the SQL

Code: `PublicationService.publish` → `PageService.publish` → `PrismaPageRepository.publish`.
The SQL is generated by Prisma; long column lists are shortened to `…` here.

**Step 1 — load the page and check the version**

```sql
SELECT … FROM "Page" WHERE id = $1 LIMIT 1;
```

If `draftVersion` is not the version the editor has open → "changed by someone else", stop.

**Step 2 — collect what the page shows**

```sql
SELECT key, value FROM "SiteSetting" WHERE key = 'site' LIMIT 1;
SELECT … FROM "Occasion" WHERE id = $1 LIMIT 1;
SELECT … FROM "Brand" WHERE id IN ($1, …) AND "isActive" = true;
```

**Step 3 — render the HTML in memory.** No SQL. If rendering fails, or an image is not https, stop.
Nothing has been written.

**Step 4 — checks**: every referenced brand still exists; no other page uses this URL.

```sql
SELECT … FROM "Brand" WHERE id IN ($1, …);
SELECT … FROM "Page" WHERE "publishedSlug" = $1 AND status = 'PUBLISHED' LIMIT 1;
SELECT … FROM "Page" WHERE slug = $1 LIMIT 1;
```

**Step 5 — one transaction: all of it or none of it**

```sql
BEGIN;

UPDATE "Page"
SET status = 'PUBLISHED', published = $2, "publishedVersion" = $3, "publishedSlug" = $4,
    "publishedById" = $5, "publishedAt" = $6, "updatedAt" = $7
WHERE id = $8 AND "draftVersion" = $9;          -- 0 rows = someone saved meanwhile → nothing is written

INSERT INTO "PageRevision" (id, "pageId", version, kind, title, slug, content, note, "createdById", "createdAt")
VALUES ($1, $2, $3, 'PUBLISH', $5, $6, $7, $8, $9, $10);

DELETE FROM "PagePublication" WHERE "pageId" = $1;

INSERT INTO "PagePublication" (slug, source, "pageId", version, html, seo, "publishedAt", "renderedAt")
VALUES ($1, 'OCCASION_PAGE_BUILDER', $3, $4, $5, $6, $7, $8);

COMMIT;
```

Because it is one transaction, the panel status and the row gyftr.com reads can never disagree.

**Step 6 — audit log**

```sql
INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, ip, "createdAt")
VALUES ($1, $2, 'page.publish', 'page', $5, $6, $7, $8);
```

**Unpublish / archive** (also one transaction):

```sql
BEGIN;
DELETE FROM "PagePublication" WHERE "pageId" = $1;
UPDATE "Page" SET status = 'DRAFT', published = NULL, "publishedSlug" = NULL,
                  "publishedVersion" = NULL, "publishedAt" = NULL WHERE id = $1;
COMMIT;
```

**Re-render after a brand or site-settings change** (`PublicationService.refreshAll`, per published page):

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('occasion-publication:<pageId>'));   -- one refresh per page at a time
SELECT … FROM "PagePublication" WHERE "pageId" = $1;                        -- gone or other version → skip
-- render again; identical HTML → nothing is written and updated_at does not move
UPDATE "PagePublication" SET html = $1, seo = $2, "renderedAt" = $3 WHERE "pageId" = $4 AND version = $5;
COMMIT;
```

This never creates a row, so it cannot bring back an unpublished page. Requests arriving during a pass are
folded into one follow-up pass, failed pages are retried, and one pass runs at every start-up.

## 7. The backend, folder by folder

All database access is in `src/repositories/`. No other file runs a query.

| Path | What it does |
| --- | --- |
| `prisma/schema.prisma` | The 10 tables and their columns. |
| `prisma/migrations/…_init/migration.sql` | SQL that creates the tables and the view. |
| `prisma/seed.ts` | Inserts the 37 occasions and default header / footer settings on a new database. |
| `scripts/create-admin.ts` | Creates the first admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. |
| `assets/render/` | `page.css` (the page stylesheet) and the GyFTR logos used in preview / download. |
| **`src/server.ts`** | Entry point: read Secrets Manager, build the database connection, validate settings, run migrations, start the server. |
| `src/app.ts` | The Express app: logging, security headers, `/healthz`, `/api/v1`, serves the panel. |
| `src/container.ts` | Wires repositories, services and controllers together. |
| `src/entry/` | Deployed versions of the seed and create-admin commands (they read Secrets Manager first). |
| **`src/config/secrets.ts`** | Reads the Secrets Manager secret into the environment. |
| **`src/config/database.ts`** | Builds the database connection from `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. |
| `src/config/env.ts` | The list of settings, validated at start-up. |
| `src/config/migrate.ts` | Runs `prisma migrate deploy` at start-up. |
| `src/http/routes.ts` | Every URL the panel calls and the permission each needs. |
| `src/http/controllers.ts` | Reads the request, validates it, calls a service, sends the response. |
| `src/http/middleware.ts` | Login check, CSRF check, role check, rate limits, upload limits, error responses. |
| **`src/services/PublicationService.ts`** | Publish, unpublish, re-render on brand change, preview, download. |
| `src/services/PageService.ts` | Create page, save draft, version check, revisions, URL rules. |
| `src/services/PagePayloadService.ts` | Collects what a render needs: page content, its brands, site settings. |
| `src/services/ContentChanges.ts` | The "a brand / setting changed" signal that triggers re-rendering. |
| `src/services/BrandService.ts` | Brands: create, update, delete, CSV import. |
| `src/services/MediaService.ts` | Image upload: re-encode to WebP, store in S3, save the record. |
| `src/services/CatalogServices.ts` | Occasions, templates, site settings. |
| `src/services/AuthService.ts`, `UserService.ts`, `security.ts` | Login, sessions (JWT), password hashing, users. |
| `src/services/AuditService.ts` | Writes the audit log. |
| `src/repositories/types.ts` | The list of database operations services may use. |
| **`src/repositories/prisma/PrismaPageRepository.ts`** | Page queries, including the publish transaction. |
| `src/repositories/prisma/PrismaPublicationRepository.ts` | Reads the stored HTML; `refresh()` updates it. |
| `src/repositories/prisma/PrismaBrandRepository.ts`, `PrismaRepositories.ts` | Brands, users, occasions, templates, media, settings, audit log. |
| `src/render/PageRenderer.tsx` | Turns page JSON into HTML: body only for gyftr.com, a full document for preview / download. |
| `src/render/components/` | One component per section, brand cards, illustrations, and the header / footer used only in preview. |
| `src/render/css.ts` | Prefixes every class with `occ-` and scopes the CSS. |
| `src/render/runtime.ts` | The small script in the page (slider, brand search, tabs). |
| `src/render/seo.ts` | Title, description, canonical URL, JSON-LD (what becomes the `meta_*` columns). |
| `src/render/ImageInliner.ts` | Downloads only: embeds images into the single file. |
| `src/contracts/` | Validation rules for everything the panel sends. The panel uses a synced copy. |
| `src/domain/` | Rules with no database: URL ↔ slug, the occasion list, the default template, per-section sanitising. |
| `src/lib/` | Errors, logger, HTML sanitiser, random tokens. |
| `src/storage/StorageProvider.ts` | Saves images to S3 (deployed) or local disk (development). |
| `tests/` | Unit tests, plus `integration.db.test.ts` which runs the migration, the view and the publish queries against a real PostgreSQL. |

The panel (`frontend/`) is a React + Vite app. It calls `/api/v1` on its own origin and has no configuration.

## 8. Configuration

**Nothing is hard-coded to a host.** In a deployed environment every setting comes from one AWS Secrets
Manager secret; the container is told only the secret's name.

### 8.1 On the ECS task definition (plain values)

| Variable | Value |
| --- | --- |
| `AWS_SECRET_NAME` | Name of the secret |
| `AWS_REGION` | `ap-south-1` |
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `SERVE_FRONTEND_DIR` | Path of the built panel inside the image |
| `RUN_MIGRATIONS_ON_START` | `true` |

### 8.2 In the Secrets Manager secret

```json
{
  "DB_HOST": "<rds-endpoint>.ap-south-1.rds.amazonaws.com",
  "DB_PORT": "5432",
  "DB_NAME": "occasion_admin",
  "DB_USER": "<database-user>",
  "DB_PASSWORD": "<database-password>",
  "JWT_SECRET": "<output of: openssl rand -base64 48>",
  "PAGE_PUBLIC_BASE_URL": "https://www.gyftr.com/occasion",
  "S3_BUCKET": "<bucket-name>"
}
```

- Key names are not case-sensitive (`db_host` = `DB_HOST`). Keys the application does not know are ignored.
- `DB_HOST` is the host name only: no `postgresql://`, no port.
- The database connection is built in memory at start-up, with TLS required and at most 10 connections per container.
- `JWT_SECRET` must be at least 32 characters and different in staging and production.
- `S3_BUCKET` is the bucket name only: no `s3://`, no dots. The region is `AWS_REGION`. Images are served
  from `https://<bucket>.s3.<region>.amazonaws.com`, so the bucket must allow public reads of its objects.
- No AWS access keys are stored: S3 and Secrets Manager are reached with the ECS task role.

### 8.3 What happens at start-up

1. `AWS_SECRET_NAME` is read → the secret is fetched from Secrets Manager (3 attempts).
2. The known keys are copied into the environment; the database connection is built from the `DB_*` fields.
3. Every setting is validated. A missing or malformed value stops the start-up with a message naming it,
   for example `Database configuration is incomplete. Missing: DB_PASSWORD`.
4. Pending database migrations are applied.
5. The server starts and re-checks the published pages once.

### 8.4 Optional settings (defaults)

`LOG_LEVEL=info`, `TRUST_PROXY=1`, `SESSION_TTL_HOURS=8`, `MAX_UPLOAD_MB=8`, `S3_PREFIX=occasion-pages`.

### 8.5 Local development only

`backend/.env` with `DATABASE_URL` (the Prisma commands read it) and `PUBLIC_UPLOADS_BASE_URL`; uploads go
to local disk. None of this is used when deployed.

## 9. Deployment (owned by DevOps)

The Dockerfile and pipeline are not in this repository. What the application needs:

- **Build**: `cd frontend && npm ci && npm run build`, then `cd backend && npm ci && npm run build`.
- **Runtime image**: `backend/dist`, `backend/node_modules` (production), `backend/prisma`, `backend/assets`,
  `backend/package.json`, and `frontend/dist`. Start with `node dist/server.js` from the backend folder.
- **RDS PostgreSQL 15+**, reachable from the service.
- **S3 bucket** with public read on objects; task role with `s3:PutObject`, `s3:DeleteObject` on it and
  `secretsmanager:GetSecretValue` on the secret.
- **ECS service** behind an ALB on a restricted admin host. Health check: `GET /healthz`.
- **First deploy only** (one-off tasks): `node dist/seed.js`, then `node dist/create-admin.js` with
  `ADMIN_EMAIL` / `ADMIN_PASSWORD` passed as overrides.
- **gyftr.com backend access**: `SELECT` on `integration.published_pages`, over a network path DevOps allows.

## 10. Security

- Sessions: JWT in an `httpOnly`, `Secure`, `SameSite=Strict` cookie; revoked on password change.
- CSRF token on every state-changing request; a role check on every route; an audit log.
- Passwords: bcrypt, 12+ characters; login is rate-limited.
- Every input is validated; rich text is sanitised on save and again on render.
- Uploads are re-encoded (no SVG), size-limited, stored under random keys.
- Preview pages are served sandboxed: no access to the panel, its cookies or the API.
- No endpoint is exposed for gyftr.com; it reads one database view.

Roles: `ADMIN` (everything, including users), `PUBLISHER` (publish, brands, templates), `EDITOR` (drafts and media).

## 11. Questions a reviewer may ask

- **Why a view instead of the table?** Our tables can change without breaking gyftr.com, and its login
  never needs to see drafts, users or password hashes.
- **Will it load the database?** One primary-key lookup per request, and the gyftr.com backend caches.
- **Why store HTML instead of rendering per request?** Reading becomes one row fetch; rendering happens once, at publish.
- **What if a discount changes?** Published pages re-render automatically; `updated_at` changes, `version` does not.
- **What if publishing fails half way?** It cannot: page status, history and HTML are written in one transaction.
- **Can an unpublished page still be served?** No. The row is deleted in the same transaction as the status
  change, and a re-render never creates a row.
- **Where are images?** In S3. The database stores their URLs and metadata only.

## 12. What is verified and what is not

Verified: unit tests; the migration, view and publish queries against a real PostgreSQL; the production
build started with only `AWS_SECRET_NAME` / `AWS_REGION` against a stand-in Secrets Manager endpoint,
then login, publish, read from the view, unpublish.

Not verified here: a real AWS Secrets Manager secret, a real S3 upload, the image DevOps builds, the panel
screens in a browser test, and how gyftr.com's frontend runs the page script on client-side navigation.

Not built yet: syncing brands from GyFTR's brands API (waiting for its specification). Brands are entered
in the panel or imported by CSV.
