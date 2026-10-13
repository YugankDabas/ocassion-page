# Occasion Pages — reading published pages from the database (for the gyftr.com backend)

The Occasion Page Builder renders each published occasion page to HTML and stores it in its
PostgreSQL database. The gyftr.com backend connects to that database with a **read-only login**,
runs the two queries below, and gives the HTML to the gyftr.com frontend through its own API.

Nothing is pushed to gyftr.com. Publishing in the panel writes a row; unpublishing deletes it.

## Connection

| Item | Value |
| --- | --- |
| Engine | PostgreSQL (RDS) |
| Host, port, database | Same as the panel's database, per environment |
| Login | `tech_reader` (password shared through a secure channel) |
| TLS | Required (`sslmode=require`) |

What the login can do:

- `SELECT` on `"Occasion"` and `"PagePublication"`, and on two columns of `"Page"` (`"id"`, `"occasionId"`):
  exactly what the two queries below read. `SELECT * FROM "Page"` is refused.
- Nothing else. It cannot read drafts, users, the audit log or any other table, and it cannot insert,
  update, delete or create anything.

Limits on the login (so a fault on one side cannot hurt the other):

- At most 20 connections at the same time. Use a small pool, 2 to 5 connections per backend instance.
- A statement is stopped after 15 seconds. Both queries take a few milliseconds.
- A transaction left open and idle is closed after 60 seconds.

Table and column names are case-sensitive: keep the double quotes exactly as written below.

## Query 1 — occasions that have a published page

```sql
SELECT o."slug"         AS occasion_slug,
       o."name"         AS occasion_name,
       pp."slug"        AS page_slug,
       pp."version"     AS version,
       pp."publishedAt" AS published_at,
       pp."renderedAt"  AS updated_at
FROM "PagePublication" pp
JOIN "Page"     p ON p."id" = pp."pageId"
JOIN "Occasion" o ON o."id" = p."occasionId"
ORDER BY o."name", pp."slug";
```

| Column | Meaning |
| --- | --- |
| `occasion_slug`, `occasion_name` | The occasion, e.g. `diwali-gift-cards`, `Diwali Gift Cards`. |
| `page_slug` | The key for query 2. It is the last part of the page URL (`/occasion/<page_slug>`) and is unique. |
| `version` | Goes up each time an editor publishes. |
| `published_at` | When the current version was published (UTC). |
| `updated_at` | Last time the HTML changed: on publish, or when a brand discount shown on the page changed (UTC). |

Only occasions with a published page appear. An occasion can have more than one page; each published
page is one row, which is why the key is `page_slug` and not the occasion.

## Query 2 — the HTML of one page

`$1` is a `page_slug` from query 1.

```sql
SELECT pp."slug"                          AS page_slug,
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
FROM "PagePublication" pp
WHERE pp."slug" = $1;
```

| Column | Meaning |
| --- | --- |
| `page_slug` | The page; primary key of `"PagePublication"`, so this is a single index lookup. |
| `source` | Always `OCCASION_PAGE_BUILDER`: the page was built in the panel. |
| `html` | The page body, ready to insert: one `<style>`, the markup, one `<script>`. No `<html>`, `<head>`, header or footer. About 240 KB. |
| `meta_title`, `meta_description`, `meta_keywords` | For the `<head>`. |
| `canonical_url` | For `<link rel="canonical">`. |
| `no_index` | `true` = emit `noindex, nofollow`. |
| `og_image` | Absolute URL, or empty. |
| `json_ld` | Array of schema.org objects. Emit each as `<script type="application/ld+json">`. |

- **One row**: the page was built in the panel and is published. Render `html` between the site header and footer.
- **No row**: the panel has no published page with that slug. Serve the existing gyftr.com page.

## Rules for the backend

1. **Cache.** Keep each page for 30 to 60 seconds, keyed by `page_slug`, and cache "no row" as well.
   Do not query on every page view. `updated_at` tells whether the HTML changed.
2. **Never fail the page.** If a query errors or times out, serve the cached copy if there is one,
   otherwise the existing gyftr.com page.
3. **Select `html` only when it is needed.** It is large; query 1 does not read it.
4. **Validate the slug** before querying (`^[a-z0-9]+(-[a-z0-9]+)*$`, at most 120 characters) and always use bound parameters.
5. **Do not modify `html`.** Insert it as it is.

## Rules for the frontend

1. **Where.** Insert `html` in a full-width container between the site header and footer. Inside
   Bootstrap's `.container-fluid`, use a `.row` with a `.px-0` child; otherwise the coloured bands are inset.
2. **Server render.** Insert it during server rendering so search engines and the first paint get the content.
3. **Client-side navigation.** A `<script>` inserted with `innerHTML` does not run. After inserting the HTML
   on the client, re-create the script element so it executes, then call `window.GyftrOccasion.init()`.
   Calling it more than once is harmless. Without the script the page is still fully readable; only the
   slider, brand search/filter, tabs and "read more" stay inactive.
4. **Head tags.** Use the `meta_*`, `canonical_url`, `no_index`, `og_image` and `json_ld` columns.

### Why the HTML does not clash with gyftr.com's styles

- Every class is prefixed `occ-`, and every CSS rule is scoped under the root `.occ-occasion`.
- The root resets inherited typography, so the site's fonts and colours do not bleed in.
- Fonts are embedded as `data:` URIs and images are `https` URLs.
- The script touches only elements inside `.occ-occasion` and defines one global, `window.GyftrOccasion`.

## How the login is created

The login is created by the panel's backend at start-up, by running the SQL script
`backend/prisma/tech_reader.sql`. Its password is the setting `TECH_READER_PASSWORD` (a key in the Secrets
Manager secret). The plain password is never sent to the database: it is stored as a SCRAM-SHA-256 hash.

The script runs at every start-up and is safe to repeat:

- The first time, it creates the login. This is the only step that needs a special database right
  (`CREATEROLE`) for the panel's database user. Without it the panel still works, and `GET /healthz` shows
  the statement the database administrator has to run: `ALTER ROLE "<panel database user>" CREATEROLE;`
  Once the login exists, the right can be taken away again: `ALTER ROLE "<panel database user>" NOCREATEROLE;`
- Every time after that, it only puts the login's rights back to exactly the ones listed above (anything
  granted in between is removed). This needs no special right: the panel's database user owns the tables.
- The password is set only when the login does not accept the configured one. So changing
  `TECH_READER_PASSWORD` changes the login's password at the next start-up, which needs `CREATEROLE` again
  for that one start-up.
- Without `TECH_READER_PASSWORD`, no login is created. Removing the setting later does not remove the
  login: to end the access, the database administrator runs
  `DROP OWNED BY tech_reader; DROP ROLE tech_reader;`
- What the login may do is decided by its rights. The session settings (read-only transactions, timeouts)
  only prevent accidents.

If the panel's database user may not create logins, the database administrator creates the login once
instead, and the panel only puts its rights back at every start-up. This is how it is done on staging:
`TECH_READER_PASSWORD` is left out of the secret there, and the password is the one the administrator set.

```sql
CREATE ROLE tech_reader LOGIN PASSWORD '<the value of TECH_READER_PASSWORD>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 20;
ALTER ROLE tech_reader SET default_transaction_read_only = 'on';
ALTER ROLE tech_reader SET statement_timeout = '15s';
ALTER ROLE tech_reader SET lock_timeout = '5s';
ALTER ROLE tech_reader SET idle_in_transaction_session_timeout = '60s';
```
