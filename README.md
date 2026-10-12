# GyFTR Occasion Page Builder

Admin panel + API for building GyFTR occasion pages (Diwali, Holi, Birthday, …) and
publishing them to gyftr.com without a code deploy.

```
diwali-gifts-admin/
├── backend/    Express + TypeScript + Prisma (PostgreSQL). REST API and page renderer
├── frontend/   React + Vite admin panel (drag-and-drop page builder)
└── docs/       OCCASION_PAGE_BUILDER.md — the complete guide (start here)
                INTEGRATION_DATABASE.md  — the contract for the gyftr.com team
```

## How it fits together

```
 Editors ──► Admin panel ──/api/v1──► Admin API ──► PostgreSQL (RDS)
                                         │  ├─► S3 + CDN (uploaded images)
                                         │  └─ renders pages to HTML (built-in renderer)
                                         ▼
 gyftr.com backend ──read-only SQL (schema "integration")──► published HTML ──► its own API
                                                    ──► gyftr.com frontend, between header and footer
```

- A page is stored as structured JSON. The API's own renderer (`backend/src/render`) turns it into HTML.
- **Publish** renders the page body (no header / footer) and stores it in the `PagePublication` table.
  The gyftr.com backend reads it from the database through one read-only view. gyftr.com *pulls*; nothing is pushed.
- gyftr.com keeps its own header, footer, session and cart; only the body of the occasion page is ours.
- There is no separate page app any more. Only this repository is deployed.

## Features

- **Occasion templates** – 37 occasions seeded with a URL, theme and illustration; a new page starts complete.
- **Drag-and-drop builder** – hero banner, intro, highlights, brand grid, brand tabs, category tiles,
  image banners, rich text, FAQs, T&Cs, call-to-action. Every visible text, image, icon and colour is a field.
- **Built-in artwork** – 19 occasion illustrations drawn in code; any slide can use an uploaded creative instead.
- **Live preview** – rendered by the same renderer as the published HTML.
- **Publish** – renders embeddable HTML: classes prefixed, styles scoped, fonts embedded, images on S3 / CDN.
  The page status and its HTML are stored in one transaction. A brand or site-settings change re-renders the
  published pages automatically (also at start-up); a page whose HTML comes out identical is not rewritten.
- **Download** – the saved draft as one self-contained `.html` file: styles, script, fonts and images inside (for reviews and sign-off).
- **Brand library** – logo, discount, voucher URL, category; CSV import. (A sync from GyFTR's brand API is planned.)
- **Media library** – uploads are re-encoded to WebP, stripped of metadata and resized. Stored in S3 when deployed.
- **Workflow** – drafts vs published, optimistic locking, version history with restore, templates, audit log.
- **Roles** – `ADMIN`, `PUBLISHER` (publish, brands, templates), `EDITOR` (drafts and media). Users are invite-only.

## Integration with gyftr.com (database contract)

The gyftr.com backend connects to this database with a read-only login and reads one view,
`integration.published_pages`: one row per published page, with `html` (style + markup + script) and the SEO
columns. It looks a page up by `slug`. A row means the page was built here and is published (`source` is
`OCCASION_PAGE_BUILDER`); no row means it is not ours.

Database access for the gyftr.com backend is granted by DevOps; it only needs `SELECT` on that view.

Full contract (columns, queries, embedding rules): [`docs/INTEGRATION_DATABASE.md`](docs/INTEGRATION_DATABASE.md).

## Local development

Prerequisites: Node 20.11+ and PostgreSQL 15+ (local PostgreSQL 17, database `occasion_admin`).

```bash
cd backend
cp .env.example .env        # fill in the "Local development only" block
npm install
npm run db:deploy           # applies prisma/migrations
npm run dev                 # http://localhost:4000 (a new database is prepared at start-up, see "First sign-in")
```

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :4000)
```

Tests: `cd backend && npm test` · Type checks: `npm run typecheck` in each folder.
The database contract (migration, view, read-only login, publish / refresh / unpublish queries) is tested against a real
PostgreSQL when `TEST_DATABASE_URL` names a throwaway database ending in `_test` (CI provides one; it is wiped).

The content contracts live in `backend/src/contracts` (source of truth). `frontend/src/contracts` is a
synced copy (`npm run sync:contracts`, run automatically before `dev` and `build`).

## First sign-in and users

There is no sign-up page and no set-up script.

- **First administrator.** When the application starts on a database with no users, it creates one
  administrator (`backend/src/bootstrap.ts`: email and default password). At the first sign-in the panel shows
  only a "Set your password" screen, and the API refuses every other request until the password is changed
  (12+ characters, letters and digits, different from the default). After that the default password no longer works.
- **Everyone else is invited.** An administrator adds users on the Users screen with a role and a temporary
  password. An invited user, or one whose password an administrator resets, must also choose their own password
  at the next sign-in.
- The same start-up step creates the occasions and default header / footer settings on a new database.

## Configuration

Locally the settings come from `backend/.env`. Deployed, the container gets two plain environment
variables on the ECS task definition and reads everything else from one Secrets Manager secret.

**Task definition (not secret)**

| Variable | Value |
| --- | --- |
| `AWS_SECRET_NAME` | Name of the secret below. |
| `AWS_REGION` | `ap-south-1` |

**Secrets Manager secret (JSON keys; names are not case-sensitive)**

| Key | Value | Why |
| --- | --- | --- |
| `DB_HOST` | RDS endpoint host name | PostgreSQL. The connection is built from the five `DB_*` fields at start-up, with TLS and at most 10 connections per container. |
| `DB_PORT` | `5432` | Optional; 5432 when left out. |
| `DB_NAME` | `occasion_admin` | |
| `DB_USER` | Database user | |
| `DB_PASSWORD` | Database password | Any characters are allowed. |
| `JWT_SECRET` | 48 random bytes (`openssl rand -base64 48`), different per environment | Signs admin sessions. |
| `PAGE_PUBLIC_BASE_URL` | `https://www.gyftr.com/occasion` | Page URLs and canonical links are built from it. |
| `S3_BUCKET` | Name of the media bucket | Uploaded images. The region is `AWS_REGION`; images are served from `https://<bucket>.s3.<region>.amazonaws.com`. |

Keys the application does not know are ignored, so the secret can hold other things too.

S3 and Secrets Manager are reached with the ECS task role; no AWS keys are stored.

## Deploying

The Dockerfile, build pipeline and infrastructure are owned by DevOps and are not part of this repository.
What the application needs from them:

**Build** (Node 20.11+; one container serves both the API and the panel)

```bash
cd frontend && npm ci && npm run build      # -> frontend/dist  (needs ../backend/src/contracts present)
cd backend  && npm ci && npm run build      # -> backend/dist   (then: npm prune --omit=dev)
```

The runtime image needs `backend/dist`, `backend/node_modules`, `backend/prisma`, `backend/assets`,
`backend/package.json`, and `frontend/dist` copied to a folder of its choice. Start command, with the working
directory at the backend folder: `node dist/server.js`.

**Environment set by the image / task definition (not secret)**

| Variable | Value | Why |
| --- | --- | --- |
| `NODE_ENV` | `production` | Secure cookies, production checks. |
| `PORT` | `4000` | HTTP port (4000 when left out). |
| `SERVE_FRONTEND_DIR` | Path of the copied `frontend/dist` | The API serves the panel from it. |
| `AWS_SECRET_NAME`, `AWS_REGION` | See Configuration | Where every other setting is read from. |

**Infrastructure**

1. **RDS PostgreSQL 15+** with an empty database, reachable from the service. The application creates the schema
   itself at start-up (`prisma/migrations`); the database user needs rights to create tables in it.
2. **Secrets Manager** secret with the keys listed under Configuration.
3. **S3 bucket** for media in the service's region, with public read on its objects (bucket policy `s3:GetObject`).
   The task role needs `s3:PutObject` / `s3:DeleteObject` on the bucket and `secretsmanager:GetSecretValue` on the secret.
4. **ECS service** behind an ALB on a restricted admin host. Health check: `GET /healthz`.
5. No one-off tasks: the first start prepares the database and creates the first administrator (see "First sign-in").
   Sign in and change the default password immediately after the first deploy.
6. Database access for the gyftr.com backend: `SELECT` on the view `integration.published_pages`, over the network
   path DevOps allows (security group). The admin host itself needs no access from gyftr.com.

Rollback = redeploy the previous image.

## Security

- Sessions: short-lived JWT in an `httpOnly`, `Secure`, `SameSite=Strict` cookie; revoked on password change.
- CSRF token on every state-changing request; RBAC on every route; full audit log.
- Passwords: bcrypt, 12+ characters; login rate-limited. A password set by someone else must be changed at first sign-in.
- All input validated with zod; rich text sanitised with an allow-list on save and again on render.
- Uploads re-encoded by sharp (no SVG, size / pixel limits), random keys.
- gyftr.com integration: read access to one database view; No public HTTP endpoint is exposed for it.
- Preview documents are served sandboxed (no access to the panel, its cookies or the API).
- helmet security headers + CSP; logs redact cookies, tokens and secrets; no stack traces to clients.

## Adding a new section type

1. `backend/src/contracts/sections.ts` – add its props schema to `sectionSchema`, `SECTION_TYPES`, `SECTION_PROPS_SCHEMAS`.
2. `backend/src/domain/sections/handlers.ts` – add a handler (sanitising / brand refs) and register it.
3. `backend/src/render/components/sections` – add the renderer, register it in `registry.tsx`, style it in
   `backend/assets/render/page.css`. If it is interactive, add its behaviour to `render/runtime.ts`.
4. `frontend` – add an editor in `features/editor/sections/editors.tsx` and an entry in `catalog.tsx`.
