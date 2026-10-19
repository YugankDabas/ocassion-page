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
                               │ images       │ SELECT … FROM "PagePublication" WHERE "slug" = ?
                               ▼              │
                              S3        gyftr.com backend ──► gyftr.com frontend (header + OUR HTML + footer)
```

1. The editor saves. The page is stored as JSON in `Page.draft`. gyftr.com sees nothing yet.
2. The editor clicks **Publish**. The API renders the page body to one HTML string
   (`<style>` + markup + `<script>`) and writes one row to the table `PagePublication`.
3. A visitor opens `https://www.gyftr.com/occasion/<slug>`. The gyftr.com backend looks the slug up in the
   table `PagePublication`, with its own read-only login.
4. **Row found** → the page is ours: it sends `html` to the frontend. **No row** → gyftr.com serves its own page.
5. **Unpublish** or **Archive** deletes the row. A brand discount change re-renders the row automatically.

## 3. What identifies our page

| Question | Answer |
| --- | --- |
| Which table holds the published HTML? | `PagePublication` |
| What uniquely identifies a page? | `slug` — the primary key. It is the last part of the URL `/occasion/<slug>`. |
| Which field says "this is a panel page"? | `source`, a stored column, always `OCCASION_PAGE_BUILDER`. |
| What is the real test? | A row exists for the slug only while the page is published from the panel. |

## 4. For the gyftr.com backend: the login and the two queries

The gyftr.com backend connects with its own login, `tech_reader`. It can `SELECT` from `Occasion` and
`PagePublication`, and from two columns of `Page` (`id`, `occasionId`): exactly what the two queries read.
Nothing else: no drafts, no users, no audit log, and no insert, update or delete. It is limited to 20
connections, 15 seconds per statement and 60 seconds for an idle open transaction.

Table and column names are case-sensitive; keep the double quotes.

**Query 1 — occasions that have a published page**

```sql
SELECT o."slug"           AS occasion_slug,
       o."name"           AS occasion_name,
       pp."isPublished"   AS is_published,
       pp."slug"          AS page_slug,
       pp."desktopBanner" AS desktop_banner,
       pp."mobileBanner"  AS mobile_banner,
       pp."version"       AS version,
       pp."publishedAt"   AS published_at,
       pp."renderedAt"    AS updated_at
FROM "PagePublication" pp
JOIN "Page"     p ON p."id" = pp."pageId"
JOIN "Occasion" o ON o."id" = p."occasionId"
ORDER BY o."name", pp."slug";
```

**Query 2 — the HTML of one page** (`$1` is a `page_slug` from query 1)

```sql
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
WHERE pp."slug" = $1;
```

- A row from query 2 means the page was built here and is published (`source` is `OCCASION_PAGE_BUILDER`):
  render `html`. No row means gyftr.com serves its own page.
- The key is `page_slug`, the primary key of `PagePublication` and the last part of the URL. An occasion can
  have more than one page, so the occasion is not the key.

Rules for the gyftr.com side:

- Cache each page for 30–60 seconds, including "no row". Do not query on every page view.
- If a query fails, serve the cached copy or the existing gyftr.com page. Never fail the page.
- Validate the slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, at most 120 characters) and use bound parameters.
- Insert `html` unchanged in a full-width container. On client-side navigation, a script inserted with
  `innerHTML` does not run: re-create the script element, then call `window.GyftrOccasion.init()`.
- The HTML cannot clash with the site: every class is prefixed `occ-`, every CSS rule is scoped under
  `.occ-occasion`, fonts are embedded, and the script touches only its own elements.

**The login.** The login is created by the panel's backend at start-up, by running the SQL script
`backend/prisma/tech_reader.sql`. Its password is the setting `TECH_READER_PASSWORD` (a key in the Secrets
Manager secret). The plain password is never sent to the database: it is stored as a SCRAM-SHA-256 hash.

The script runs at every start-up and is safe to repeat:

- The first time, it creates the login. Only this step needs a special right for the panel's database user.
  Without it the panel still works and `GET /healthz` shows the statement the database administrator has to
  run: `ALTER ROLE "<panel database user>" CREATEROLE;` Once the login exists the right can be taken away
  again (`... NOCREATEROLE;`).
- Every time after that, it only puts the login's rights back to exactly the ones above. This needs no
  special right.
- The password is set only when the login does not accept the configured one, so changing
  `TECH_READER_PASSWORD` changes the password at the next start-up (which needs `CREATEROLE` for that start-up).
- Without `TECH_READER_PASSWORD`, no login is created.

On staging the panel's database user may not create logins, so the database administrator created `tech_reader`
by hand and `TECH_READER_PASSWORD` is left out of the secret; the panel only puts its rights back at start-up.
The statements for that, and how to end the access, are in `docs/INTEGRATION_DATABASE.md` ("How the login is created").

## 5. The database: 10 tables

Images are **not** stored in the database. They are in S3; the database holds their URLs.

| Table | What it stores | Important fields |
| --- | --- | --- |
| `User` | People who can log in to the panel | `email` (unique), `passwordHash` (bcrypt), `role` (EDITOR = Edit only / PUBLISHER = Edit & publish / ADMIN), `isActive`, `mustChangePassword` (password was given by someone else; must be changed at next sign-in), `tokenVersion` (bump = all sessions revoked), `lastLoginAt` |
| `Occasion` | The occasions (Diwali, Holi, …) | `slug`, `name`, `shortName`, `recipients`, `emoji` (used in template text), `pageUrl`, `theme` (default colours), `sortOrder`, `isActive` |
| `Page` | One page being built | `slug`, `title`, `occasionId`, `status` (DRAFT / PUBLISHED / ARCHIVED), `draft` (JSON being edited), `draftVersion` (optimistic lock), `published` (JSON snapshot taken at publish), `publishedSlug`, `publishedVersion`, `publishedAt`, who created / updated / published |
| `PageRevision` | History, for restore | `pageId`, `version`, `kind` (SAVE / PUBLISH / RESTORE), `content`, `note` |
| `PagePublication` | **The HTML gyftr.com reads** | `slug` (primary key), `source`, `pageId` (unique), `version`, `html`, `seo` (JSON), `publishedAt`, `renderedAt` |
| `Template` | Saved page layouts | `name`, `occasionId`, `content` |
| `Brand` | Brand cards shown on pages | `name`, `slug`, `logoUrl`, `productUrl`, `discountPercent`, `discountLabel`, `category`, `redemption`, `minDenomination`, `isActive`; `gyftrId` (GyFTR's brand id, empty for a brand added by hand), `manualFields` (fields changed by hand, which the sync leaves alone), `syncedAt` |
| `Media` | A record per uploaded image (the file is in S3) | `storageKey` (S3 key), `url`, `mimeType`, `width`, `height`, `sizeBytes`, `originalName`, `alt` |
| `SiteSetting` | Header / footer links used in preview and download | one row: `key = 'site'`, `value` JSON |
| `AuditLog` | Who did what | `actorId`, `action`, `entityType`, `entityId`, `metadata`, `ip` |

Table definitions: [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma).
The SQL that creates the tables:
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
| `prisma/migrations/…_init/migration.sql` | SQL that creates the tables. Needs only the right to create tables in schema `public`. |
| `prisma/migrations/…_user_must_change_password/migration.sql` | Adds `User.mustChangePassword`. |
| `assets/render/` | `page.css` (the page stylesheet) and the GyFTR logos used in preview / download. |
| **`src/server.ts`** | Entry point: read Secrets Manager, build the database connection, validate settings, run migrations, prepare a new database, start the server. |
| **`src/techAccess.ts`** | Runs `prisma/tech_reader.sql` at start-up: creates the tech team's read-only login (`tech_reader`) with the password from `TECH_READER_PASSWORD` and gives it `SELECT` on `Occasion`, `PagePublication` and two columns of `Page`. |
| `prisma/tech_reader.sql` | The SQL script for that login. Run by the application only. |
| **`src/startup.ts`** | The start-up report behind `GET /healthz`: whether the secret was read, which settings were found (names only), and what is wrong. |
| **`src/bootstrap.ts`** | Runs at every start-up; on a new database it creates the 37 occasions, the default header / footer settings and the first administrator. Does nothing once they exist. |
| `src/app.ts` | The Express app: logging, security headers, `/healthz`, `/api/v1`, serves the panel. |
| `src/container.ts` | Wires repositories, services and controllers together. |
| **`src/config/secrets.ts`** | Reads the Secrets Manager secret into the environment. |
| **`src/config/database.ts`** | Builds the database connection from `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. |
| `src/config/env.ts` | The list of settings, validated at start-up. |
| **`src/db.ts`** | The database connection: the plain `pg` driver (as in the other GyFTR panels) with Prisma on top for typed queries. TLS for RDS, at most 10 connections. No native database engine. |
| `src/config/migrate.ts` | Creates / updates the schema at start-up by running the SQL files in `prisma/migrations` once each, over the same `pg` driver. No command-line tool is involved. |
| `src/http/routes.ts` | Every URL the panel calls and the permission each needs. |
| `src/http/controllers.ts` | Reads the request, validates it, calls a service, sends the response. |
| `src/http/middleware.ts` | Login check, CSRF check, forced password change, role check, rate limits, upload limits, error responses. |
| **`src/services/PublicationService.ts`** | Publish, unpublish, re-render on brand change, preview, download. |
| `src/services/PageService.ts` | Create page, save draft, version check, revisions, URL rules. |
| `src/services/PagePayloadService.ts` | Collects what a render needs: page content, its brands, site settings. |
| `src/services/ContentChanges.ts` | The "a brand / setting changed" signal that triggers re-rendering. |
| `src/services/BrandService.ts` | Brands: create, update, delete, CSV import. Remembers which GyFTR fields were changed by hand. |
| `src/services/BrandSyncService.ts` | Brand sync from GyFTR's public API, run in the background after each sign-in and on demand. |
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

The panel (`frontend/`) is a React + Vite app, deployed as its own service (`frontend/Dockerfile`, served by
`frontend/server.mjs`). It is built with `VITE_API_BASE_URL` (the API host) and calls `<that host>/api/v1` with the
session cookie. The API accepts browser requests only from `ADMIN_FRONTEND_ORIGIN` (the panel's address).

## 8. Configuration

**Nothing is hard-coded to a host.** In a deployed environment every setting comes from one AWS Secrets
Manager secret; the container is told only the secret's name.

### 8.1 On the ECS task definition (plain values)

| Variable | Value |
| --- | --- |
| `AWS_SECRET_NAME` | Name of the secret |
| `AWS_REGION` | `ap-south-1` |
| `NODE_ENV` | `production` |
| `PORT` | `4545` (set by `backend/Dockerfile` and `taskdef-backend.json`) |
| `ADMIN_FRONTEND_ORIGIN` | `https://occasion-admin.gyftr.net` — the panel's address; required in production |

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
  "S3_BUCKET": "<bucket-name>",
  "TECH_READER_PASSWORD": "<output of: openssl rand -base64 24>",
  "GYFTR_API_URL": "https://gyftrapi.gyftr.net/gyftrapi/api/v1",
  "GYFTR_BRAND_PAGE_BASE_URL": "https://www.gvhelpdesk.net"
}
```

(The two `GYFTR_*` values above are staging's. Production: `https://api.gyftr.com/gyftrapi/api/v1` and
`https://www.gyftr.com`.)

- **The secret must be valid JSON: every value in double quotes**, including `DB_NAME` and `DB_PORT`. Use the
  console's Key/value tab to avoid mistakes. (A hand-typed secret with an unquoted value, such as
  `"DB_NAME": occasion_admin`, is still read, with a warning in the log asking to fix it.)
- Key names are not case-sensitive (`db_host` = `DB_HOST`). Keys the application does not know are ignored.
- `DB_HOST` is the host name only: no `postgresql://`, no port.
- The database connection is built in memory at start-up and made with the plain `pg` driver: always encrypted
  (TLS) for a remote database, at most 10 connections per container. The RDS certificate chain is not verified
  (`rejectUnauthorized: false`), the same as in the other GyFTR panels.
- `JWT_SECRET` must be at least 32 characters and different in staging and production.
- `GYFTR_API_URL` / `GYFTR_BRAND_PAGE_BASE_URL`: the GyFTR brand API the brand library syncs from, and the site brand
  cards link to (`<base>/<slug>`). The staging and production APIs number their brands independently, so each synced
  brand records the API it came from; after a change, the next sync takes existing brands over **by slug**. Brands
  from another API are switched off at start-up (never deleted) and are not listed anywhere in the panel; a page that
  still refers to one shows it as "No longer in the brand list" in the editor and leaves it out of the page. Left out, they are chosen from
  `ADMIN_FRONTEND_ORIGIN` (a panel on `*.gyftr.net` follows staging, any other production).
- `S3_BUCKET` is the bucket name only: no `s3://`, no dots. The region is `AWS_REGION`. Only the folder
  `occasion-pages/` is used (written, read, deleted), so the bucket can be shared, and it stays private: this
  API serves the images at `https://api-occasion-admin.gyftr.net/media/occasion-pages/...`, reading them from
  the bucket. The task role needs `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on `<bucket>/occasion-pages/*`.
  The `/media` route serves images of that folder only.
- `MEDIA_BASE_URL` is optional and not needed: set it only to serve the images from another address, such as a
  CloudFront distribution in front of the bucket (production). Images keep the address they were uploaded with.
- `TECH_READER_PASSWORD` is optional: it is the password of the tech team's read-only database login (section 4).
  Leave it out and no such login is created.
- No AWS access keys are stored: S3 and Secrets Manager are reached with the ECS task role.

### 8.3 What happens at start-up

The server answers from the first moment and never exits because of a configuration or database problem.
It repeats these steps every 15 seconds until all succeed, so fixing the cause in AWS is enough: no redeploy.

1. `AWS_SECRET_NAME` is read and the secret is fetched from Secrets Manager (read again on every attempt).
2. The known keys are copied into the environment; the database connection is built from the `DB_*` fields.
3. Every setting is validated.
4. The database schema is created or updated: the application runs the SQL files in `prisma/migrations`
   itself, each once, in a transaction (no separate tool or step). This needs the right to create tables in
   schema `public`:  `GRANT USAGE, CREATE ON SCHEMA public TO "<DB_USER>";`  (on PostgreSQL 15+,
   `GRANT ALL ON DATABASE` does not include it). A failed earlier attempt is retried automatically.
5. A new database is prepared: occasions, default site settings, the first administrator (section 9.1).
6. The tech team's read-only login `tech_reader` is created from `TECH_READER_PASSWORD` if it does not
   exist yet, and its rights are put back to exactly what the two queries read (`prisma/tech_reader.sql`).
   A failure does not stop the panel; it is shown on `/healthz` and tried again.

`GET /healthz` always answers 200 and never shows a value, a host name or a user name:

```json
{ "status": "ok", "database": "ready", "builtAt": "2026-10-13T09:35:24Z",
  "secrets": { "source": "AWS Secrets Manager", "fetched": true, "missing": [] }, "errors": [] }
```

| Field | Meaning |
| --- | --- |
| `database` | `ready`, `starting`, `unavailable` or `not_configured` |
| `builtAt` | When the running build was made, to tell which build is deployed |
| `secrets` | Whether the Secrets Manager secret was fetched, and the names of required settings that are missing |
| `errors` | What is wrong and what to do about it, with passwords and keys removed |

### 8.4 Optional settings (defaults)

`LOG_LEVEL=info`, `TRUST_PROXY=1`, `SESSION_TTL_HOURS=8`, `MAX_UPLOAD_MB=8`, `S3_PREFIX=occasion-pages`.

### 8.5 Local development only

`backend/.env` with `DATABASE_URL` (the Prisma commands read it) and `PUBLIC_UPLOADS_BASE_URL`; uploads go
to local disk. None of this is used when deployed.

## 9. Deployment (owned by DevOps)

Two services, built and deployed by DevOps's pipeline (`buildspec.yml`, `backend/Dockerfile`,
`frontend/Dockerfile`, `taskdef-backend.json`, `taskdef-frontend.json`; details in `README.md`):

| Service | Address | Port |
| --- | --- | --- |
| Panel (frontend) | `https://occasion-admin.gyftr.net` | 4546 |
| API (backend) | `https://api-occasion-admin.gyftr.net` | 4545 |

Both addresses must stay under the same site (`gyftr.net`): the session cookie is `SameSite=Strict`, so a panel on
a different domain could not stay signed in.

What the backend needs:

- **RDS PostgreSQL 15+** with an empty database, reachable from the service. The application creates the
  schema itself at start-up; its database user needs rights to create tables.
- **S3 bucket** with public read on objects; task role with `s3:PutObject`, `s3:DeleteObject` on it and
  `secretsmanager:GetSecretValue` on the secret.
- Health check: `GET /healthz` on both services.
- **No one-off tasks or scripts.** The first start prepares the database (section 9.1).
- **gyftr.com backend access**: the login `tech_reader` (section 4), over a network path DevOps allows.

### 9.1 First sign-in and users

There is no sign-up page and no set-up script.

1. On a database with no users, start-up creates **one administrator** with a default password
   (email and password are in `backend/src/bootstrap.ts`). Only its bcrypt hash is stored.
2. At the first sign-in the panel shows only a "Set your password" screen. The API enforces it as well:
   until the password is changed, every request except the account endpoints is answered with 403.
3. The new password must have 12+ characters with letters and digits and differ from the default. Once it
   is changed, the default password no longer works and is never restored on later starts.
4. **Everyone else is invited**: an administrator adds users on the Users screen with a role and a temporary
   password. An invited user, or one whose password an administrator resets, must also choose their own
   password at the next sign-in.

Change the default password immediately after the first deploy: until then, anyone who can reach the admin
host and knows the default can take the administrator account. Keeping the admin host restricted (VPN / IP
allow-list) is what protects that window.

## 10. Security

- Sessions: JWT in an `httpOnly`, `Secure`, `SameSite=Strict` cookie; revoked on password change.
- CSRF token on every state-changing request; a role check on every route; an audit log.
- Passwords: bcrypt, 12+ characters; login is rate-limited; a given password must be changed at first sign-in.
- Every input is validated; rich text is sanitised on save and again on render.
- Uploads are re-encoded (no SVG), size-limited, stored under random keys.
- Preview pages are served sandboxed: no access to the panel, its cookies or the API.
- No endpoint is exposed for gyftr.com; it reads the published pages with a read-only database login.

Access, chosen per person: **Edit only** (`EDITOR`: pages, brands, images, templates), **Edit & publish** (`PUBLISHER`:
also publish, unpublish, archive) or **Admin** (`ADMIN`: everything, plus users, occasions, header & footer, deleting
pages, audit log). Nobody can change their own access.

## 11. Questions a reviewer may ask

- **What can the gyftr.com login see?** Three tables (`Occasion`, `Page`, `PagePublication`), read-only. Not users,
  password hashes or the audit log.
- **Will it load the database?** One primary-key lookup per request, and the gyftr.com backend caches.
- **Why store HTML instead of rendering per request?** Reading becomes one row fetch; rendering happens once, at publish.
- **What if a discount changes?** Published pages re-render automatically; `updated_at` changes, `version` does not.
- **Where do brands come from?** GyFTR's public brand API, fetched every time someone signs in to the panel
  (list: `https://api.gyftr.com/gyftrapi/api/v1/home/brand/list`; discount `defaut_pg_dis` and redemption from
  `.../brand/detail/:slug`). Brands are matched on GyFTR's id. A brand GyFTR no longer lists is set inactive,
  never deleted. If the API cannot be reached, nothing changes and the Brands page shows the error. The API
  service needs outbound HTTPS to `api.gyftr.com`.
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

Brand sync: unit tests with a stand-in API, and a live run against GyFTR's API locally (490 brands listed;
one slug, `black-+-decker`, is rejected by GyFTR's own detail endpoint and keeps its list data without a discount).
