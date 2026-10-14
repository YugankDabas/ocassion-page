# GyFTR Occasion Page Builder

Admin panel + API for building GyFTR occasion pages (Diwali, Holi, Birthday, …) and
publishing them to gyftr.com without a code deploy.

```
diwali-gifts-admin/
├── backend/    Express + TypeScript + Prisma over the pg driver (PostgreSQL). REST API and page renderer
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
  The gyftr.com backend reads it from that table with a read-only login. gyftr.com *pulls*; nothing is pushed.
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

The gyftr.com backend connects to this database with its own read-only login, `tech_reader`, and reads
the published pages straight from the tables: one query lists the occasions that have a published page, the
other returns a page's `html` (style + markup + script) and SEO values from `PagePublication` by slug. A row
means the page was built here and is published (`source` is `OCCASION_PAGE_BUILDER`); no row means it is not ours.

The login can `SELECT` from `Occasion`, `PagePublication` and two columns of `Page` only. The backend creates it
at start-up by running `backend/prisma/tech_reader.sql`, with the password from `TECH_READER_PASSWORD`.

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

Locally the settings come from `backend/.env`. Deployed, the backend gets three plain environment
variables on the ECS task definition and reads everything else from one Secrets Manager secret.

**Task definition (not secret)**

| Variable | Value |
| --- | --- |
| `AWS_SECRET_NAME` | Name of the secret below. |
| `AWS_REGION` | `ap-south-1` |
| `ADMIN_FRONTEND_ORIGIN` | `https://occasion-admin.gyftr.net` (the only allowed browser origin for API requests). |

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
| `S3_BUCKET` | Name of the media bucket | Uploaded images, in the bucket's folder `occasion-pages/` only (the bucket can be shared and stays private). This API serves them at `https://<api-host>/media/...`; the task role needs `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `<bucket>/occasion-pages/*`. |
| `MEDIA_BASE_URL` | not set | Optional. Serve the images from this address instead, e.g. CloudFront in front of the bucket (production). |
| `TECH_READER_PASSWORD` | `openssl rand -base64 24` | Optional. Password of the read-only database login for the gyftr.com tech team (`tech_reader`), created at start-up. |

Keys the application does not know are ignored, so the secret can hold other things too.

S3 and Secrets Manager are reached with the ECS task role; no AWS keys are stored.

## Deploying

The repository has two independent ARM64 images and ECS task definitions, built and deployed by one AWS CodePipeline.

| Service | Public URL | Container port | Files |
| --- | --- | --- | --- |
| Frontend | `https://occasion-admin.gyftr.net` | `4546` | `frontend/Dockerfile`, `taskdef-frontend.json` |
| Backend | `https://api-occasion-admin.gyftr.net` | `4545` | `backend/Dockerfile`, `taskdef-backend.json` |

The frontend calls the API host directly and includes the secure session cookies. The API allows browser
requests only from `https://occasion-admin.gyftr.net`. Both ECS services need an ALB target group using
their respective container port and `GET /healthz` health check; DNS/TLS must route both hostnames to the ALB.

**Prerequisites (existing AWS resources):**

1. ECS cluster `B2C-APPNode` using Managed Instances and separate backend/frontend services
   `Occasion-Admin-Backend-Service` and `Occasion-Admin-Frontend-Service` in `ap-south-1`.
   Create these services before running the pipeline. Task definitions use ARM64 Managed Instances;
   container names are `Occasion-Admin-Backend-Container` and `Occasion-Admin-Frontend-Container`.
2. An S3 bucket for CodePipeline artifacts and an active CodeStar connection to the GitHub repository.
3. ECS task execution role with ECR image-pull and CloudWatch Logs permissions; backend task role with
   Secrets Manager and media S3 permissions.
4. The backend Secrets Manager JSON secret and its PostgreSQL/S3 dependencies, as described above.
5. Cross-account ECR pull access from the CodeBuild role for the supplied private Node base image.

Create the AWS resources manually in `ap-south-1`:

1. Create ECR repositories `occasion-admin-backend` and `occasion-admin-frontend`.
2. Create one CodeBuild project using this repository's `buildspec.yml`; use an ARM64 build environment
   with Docker privileged mode enabled. Configure the environment variables below.
3. Create one CodePipeline with your GitHub source action and a single CodeBuild build action targeting
   that project. Configure the source artifact as the build action's input and an artifact bucket.
4. Create the two ECS services and their ALB target groups/DNS/TLS separately, using `taskdef-backend.json`
   and `taskdef-frontend.json` from the repository root.

**CodeBuild environment variables**

| Variable | Value |
| --- | --- |
| `AWS_DEFAULT_REGION` | `ap-south-1` |
| `BACKEND_ECR_URI` | `653380732738.dkr.ecr.ap-south-1.amazonaws.com/occasion-admin-backend` |
| `FRONTEND_ECR_URI` | `653380732738.dkr.ecr.ap-south-1.amazonaws.com/occasion-admin-frontend` |
| `BACKEND_CONTAINER_NAME` | `Occasion-Admin-Backend-Container` |
| `FRONTEND_CONTAINER_NAME` | `Occasion-Admin-Frontend-Container` |
| `ECS_CLUSTER_NAME` | `B2C-APPNode` |
| `BACKEND_ECS_SERVICE` | `Occasion-Admin-Backend-Service` |
| `FRONTEND_ECS_SERVICE` | `Occasion-Admin-Frontend-Service` |
| `TASK_EXECUTION_ROLE_ARN` | `arn:aws:iam::653380732738:role/ecsTaskExecutionRole` (the ECS task execution role from your sample) |
| `BACKEND_TASK_ROLE_ARN` | Backend task role ARN; if reusing the sample role, use the same ARN above and add the permissions described below |
| `BACKEND_SECRET_NAME` | The exact name or ARN of the Secrets Manager JSON secret you create, e.g. `occasion-admin/production` |
| `NODE_IMAGE` | `653380732738.dkr.ecr.ap-south-1.amazonaws.com/node-24.18.0-alpine3.24-arm:node-24.18.0-alpine3.24-arm-patch-20260915` |
| `VITE_API_BASE_URL` | `https://api-occasion-admin.gyftr.net` |
| `DEPLOY_SERVICES` | `true` after both ECS services exist. If unset or `false`, the pipeline only builds/pushes images and registers task definitions (default: `false`). |

The AWS account ID in the ECR URIs is the account where you create the two repositories. `CODEBUILD_RESOLVED_SOURCE_VERSION`
and `CODEBUILD_BUILD_NUMBER` are automatically provided by CodeBuild; do not add them yourself. Do not put
database passwords or JWT secrets in CodeBuild variables; the backend retrieves those from Secrets Manager.

For the **first run**, leave `DEPLOY_SERVICES` unset or set it to `false`. The build pushes both images and registers both task
definitions without trying to update services that do not exist yet. Create both ECS services from the
registered task-definition revisions (configure their networking/load balancers), then set
`DEPLOY_SERVICES=true` for later pipeline runs. If the CodeBuild project already has `DEPLOY_SERVICES=true`,
change or remove that project-level override for the bootstrap build.

The CodeBuild service role is selected in the CodeBuild project settings; it is not a task role ARN
environment variable. It needs ECR push permissions on both application repositories, pull access to the
cross-account Node base-image repository, ECS task-definition registration and service update/describe
permissions, `iam:PassRole` for the task roles, and the standard CodePipeline artifact bucket and CloudWatch Logs
permissions. The backend ECS task role needs the Secrets Manager and media S3 permissions described above.
If ECS returns `ServiceNotFoundException`, verify the exact ECS cluster and service names in the CodeBuild
variables, confirm the services already exist in `ap-south-1`, and check the CodeBuild role has
`ecs:DescribeServices` / `ecs:UpdateService` access.

The task-definition JSON files use `requiresCompatibilities: ["MANAGED_INSTANCES"]`, following the sample
task definition; do not select Fargate. The sample uses `ecsTaskExecutionRole` for both role fields. That can
work if you give it ECR/logging permissions for execution and scoped `secretsmanager:GetSecretValue`,
`s3:PutObject`, and `s3:DeleteObject` permissions for the backend at runtime. Prefer a separate backend task
role with just the runtime permissions; put that role's full ARN in `BACKEND_TASK_ROLE_ARN`.

The ECS task definitions set `NODE_ENV=production`, service ports, the frontend origin and
`RUN_MIGRATIONS_ON_START=true`; the backend reads sensitive configuration from Secrets Manager at startup.
The frontend image is built with `VITE_API_BASE_URL=https://api-occasion-admin.gyftr.net`; the app appends `/api/v1`.

The backend needs RDS PostgreSQL 15+ and an S3 media bucket with public object reads. Its task role needs
`s3:PutObject` / `s3:DeleteObject` on that bucket and `secretsmanager:GetSecretValue` on the backend secret.
The database only has to exist and be empty: the backend creates the schema at start-up (its database user needs
rights to create tables). No one-off tasks are needed: the first start also creates the occasions, the default
settings and the first administrator (see "First sign-in and users"); sign in and change the default password
immediately after the first deploy. The gyftr.com backend uses the login `tech_reader` (see docs/INTEGRATION_DATABASE.md) over the network path DevOps allows.

Rollback = redeploy the previous image.

## Security

- Sessions: short-lived JWT in an `httpOnly`, `Secure`, `SameSite=Strict` cookie; revoked on password change.
- CSRF token on every state-changing request; RBAC on every route; full audit log.
- Passwords: bcrypt, 12+ characters; login rate-limited. A password set by someone else must be changed at first sign-in.
- All input validated with zod; rich text sanitised with an allow-list on save and again on render.
- Uploads re-encoded by sharp (no SVG, size / pixel limits), random keys.
- gyftr.com integration: a read-only database login limited to what its two queries read; No public HTTP endpoint is exposed for it.
- Preview documents are served sandboxed (no access to the panel, its cookies or the API).
- helmet security headers + CSP; logs redact cookies, tokens and secrets; no stack traces to clients.

## Adding a new section type

1. `backend/src/contracts/sections.ts` – add its props schema to `sectionSchema`, `SECTION_TYPES`, `SECTION_PROPS_SCHEMAS`.
2. `backend/src/domain/sections/handlers.ts` – add a handler (sanitising / brand refs) and register it.
3. `backend/src/render/components/sections` – add the renderer, register it in `registry.tsx`, style it in
   `backend/assets/render/page.css`. If it is interactive, add its behaviour to `render/runtime.ts`.
4. `frontend` – add an editor in `features/editor/sections/editors.tsx` and an entry in `catalog.tsx`.
