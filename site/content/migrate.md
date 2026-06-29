# Migrate from WordPress

Two ways to bring a WordPress site's content into Volt as markdown pages.

## Automated — pull from the live site (recommended)

Modern WordPress exposes a REST API, so you can import directly:

```
npx create-volt@latest import-wp https://yourblog.com
```

This fetches published posts + pages over the REST API and writes each to `pages/<slug>.md`. **No credentials are needed for published content.**

For drafts/private content, create an **Application Password** (WordPress → Users → Profile → Application Passwords) and pass it over HTTPS via environment variables:

```
WP_USER=you WP_APP_PASSWORD="xxxx xxxx xxxx xxxx" \
  npx create-volt@latest import-wp https://yourblog.com --drafts
```

Credentials are sent only over HTTPS and are never stored or logged.

## From an export file (fallback)

If the REST API is disabled, export in WordPress (**Tools → Export → All content**) to get a WXR `.xml`, then:

```
npx create-volt@latest import-wxr export.xml
```

## What you get

Each published page/post becomes `pages/<slug>.md` — front-matter `title` (plus `date`, `tags`), Gutenberg block comments stripped, body kept as HTML/markdown. Drafts and attachments are skipped.

| Flag | Effect |
| --- | --- |
| `--out <dir>` | Output directory (default `pages`). |
| `--drafts` | Include drafts, not just published. |
| `--force` | Overwrite files that already exist. |

Then enable the **pages** add-on to serve them:

```
npm run dev -- --edit   # tick "pages"
```

`pages/about.md` is served at `/about`. The importer brings over **content** — not themes or plugins. The layout is yours to build in Volt (that's the point).
