import type { PrismaClient } from '@prisma/client';

/**
 * The contract with the gyftr.com backend: one view, integration.published_pages.
 *
 * One row per PUBLISHED page; a row exists only while the page is published.
 * Look up by slug (the primary key of "PagePublication", so one index lookup):
 *   row    -> the page was built in the Occasion Page Builder: render `html`
 *   no row -> not ours: gyftr.com serves its own page
 *
 * It is created here, at start-up, and not by a migration: creating a schema needs a
 * database-level right (CREATE on the database) that a login which may only create
 * tables does not have. The panel must not depend on that right to start; without it
 * the panel works and /healthz says what to grant for the view.
 */
const CREATE_SCHEMA = `
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'integration') THEN
        CREATE SCHEMA integration;
    END IF;
END $$`;

// CREATE OR REPLACE keeps the grants given on the view (the gyftr.com login's SELECT).
// New columns may only be added at the end.
const CREATE_VIEW = `
CREATE OR REPLACE VIEW integration.published_pages AS
SELECT
    pp."slug"                          AS slug,
    pp."source"                        AS source,
    pp."version"                       AS version,
    pp."html"                          AS html,
    pp."seo" ->> 'title'               AS meta_title,
    pp."seo" ->> 'description'         AS meta_description,
    pp."seo" ->> 'keywords'            AS meta_keywords,
    pp."seo" ->> 'canonicalUrl'        AS canonical_url,
    (pp."seo" ->> 'noIndex')::boolean  AS no_index,
    pp."seo" ->> 'ogImage'             AS og_image,
    pp."seo" -> 'jsonLd'               AS json_ld,
    pp."publishedAt"                   AS published_at,
    pp."renderedAt"                    AS updated_at
FROM "PagePublication" pp`;

/** Creates the schema and the view when missing; does nothing harmful when they exist. */
export async function ensureIntegrationView(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(CREATE_SCHEMA);
  await prisma.$executeRawUnsafe(CREATE_VIEW);
}
