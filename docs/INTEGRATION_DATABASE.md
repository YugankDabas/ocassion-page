# Occasion Pages — Database contract for the gyftr.com backend

The Occasion Page Builder renders each published occasion page to HTML and stores it in its
PostgreSQL database. The gyftr.com backend connects to that database **read-only**, reads the
HTML from one view, and exposes it to the gyftr.com frontend through its own API.

Nothing is pushed to gyftr.com. Publishing in the panel writes a row; unpublishing deletes it.

## Connection

| Item | Value |
| --- | --- |
| Engine | PostgreSQL (RDS) |
| Host, port, database, login | Provided by DevOps per environment, through a secure channel |
| TLS | Required (`sslmode=require` or stricter) |
| Object to read | The view `integration.published_pages` |

The gyftr.com backend only needs `SELECT` on that one view. Recommended for the login DevOps provides:
read-only, limited to this view, with a connection limit and a statement timeout. On the client side, keep
the connection pool small (10 or fewer) and never write to this database.

**The view is the contract.** Its name, columns and meanings will not change without
notice. Everything else in the database is internal and may change at any time.

## The view: `integration.published_pages`

One row per **published** page. A row exists only while the page is published.

| Column | Type | Meaning |
| --- | --- | --- |
| `slug` | text | Last part of the page URL (`/occasion/<slug>`). Unique; the lookup key. |
| `source` | text | Always `OCCASION_PAGE_BUILDER`: the system that produced the page. Stored on every row, so it identifies a panel page when the row is merged with gyftr.com's own page data. |
| `version` | integer | Increases each time an editor publishes. |
| `html` | text | The page body, ready to insert: one `<style>`, the markup, one `<script>`. No `<html>`, `<head>`, `<body>`, header or footer. About 240 KB. |
| `meta_title` | text | For `<title>` and `og:title`. |
| `meta_description` | text | For the meta description and `og:description`. |
| `meta_keywords` | text | May be empty. |
| `canonical_url` | text | For `<link rel="canonical">`. |
| `no_index` | boolean | `true` = emit `noindex, nofollow`. |
| `og_image` | text | Absolute URL, or empty. |
| `json_ld` | jsonb | Array of schema.org objects. Emit each as `<script type="application/ld+json">`. |
| `published_at` | timestamp (UTC) | When the current version was published. |
| `updated_at` | timestamp (UTC) | Last time `html` changed: on publish, or when brand data shown on the page changed. Safe to use as the cache key. |

### Get one page

```sql
SELECT source, html, meta_title, meta_description, meta_keywords, canonical_url, no_index, og_image, json_ld,
       version, updated_at
FROM integration.published_pages
WHERE slug = $1;
```

- **One row**: the page was built in the panel and is published. Send `html` to the frontend to render between the site header and footer.
- **No row**: the panel has no published page for that URL. Serve the existing gyftr.com page.

That single check is how the backend tells a panel page from gyftr.com's own page. A page is in this
view only while it is published: unpublishing or archiving it in the panel removes the row.

### Check for a change without fetching the HTML

```sql
SELECT version, updated_at FROM integration.published_pages WHERE slug = $1;
```

`updated_at` changes only when the stored `html` (or its SEO data) actually changes: on publish, and when a brand
discount or link used by the page changes. `version` changes only when an editor publishes.

### List the pages the panel hosts

```sql
SELECT slug, version, published_at, updated_at FROM integration.published_pages ORDER BY slug;
```

## Rules for the backend

1. **Cache.** Keep each page in memory (or Redis) for 30 to 60 seconds, keyed by `slug`,
   and cache "no row" as well. Do not query on every page view. A publish is then visible within the cache time.
2. **Never fail the page.** If the query errors or times out, serve the cached copy if there is one,
   otherwise the existing gyftr.com page.
3. **Select `html` only when it is needed.** It is large; listings and change checks should not read it.
4. **Validate the slug** before querying (`^[a-z0-9]+(-[a-z0-9]+)*$`, at most 120 characters) and always use bound parameters.
5. **Treat `html` as trusted markup from this system only.** Do not modify it or merge anything into it.

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
  Bootstrap and site rules cannot match it, and its rules cannot leak out.
- The root resets inherited typography, so the site's fonts and colours do not bleed in.
- Fonts are embedded as `data:` URIs and images are `https` URLs, which the current gyftr.com
  Content-Security-Policy already allows.
- The script touches only elements inside `.occ-occasion` and defines one global, `window.GyftrOccasion`.

## Suggested shape for the gyftr.com API (to its frontend)

```
GET /occasion-pages/{slug}
200 → { "slug": "...", "version": 3, "html": "...", "seo": { "title": "...", "description": "...",
        "keywords": "...", "canonicalUrl": "...", "noIndex": false, "ogImage": "...", "jsonLd": [ ... ] } }
404 → the page is not hosted by the panel; the frontend shows the existing page
```
