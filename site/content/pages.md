# Markdown pages

The `pages` add-on serves markdown files as HTML — no database, no admin. Author them in your editor or with AI.

```
npm run dev -- --edit   # tick the "pages" add-on
```

Drop `.md` files in the `pages/` directory (created automatically on first run). Each file is served at its slug:

```
pages/about.md     ->  /about
pages/pricing.md   ->  /pricing
```

Front-matter sets the page title:

```
---
title: About us
---

# About us

Written in **markdown**, served as HTML.
```

Pages are code-owned files (trusted), so their HTML renders as-is. A page with `format: html` in its front-matter is served **verbatim** (no markdown processing) — used by the WYSIWYG editor to preserve complex layouts. The router is mounted last, so your app routes always win; unknown slugs fall through to 404.
