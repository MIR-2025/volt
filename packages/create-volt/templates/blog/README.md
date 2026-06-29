# Volt blog

A blog built with [Volt](https://voltjs.com) — markdown posts, one theme, real SEO. No build step, no database, no admin to attack.

```
npm install
npm run dev        # → http://localhost:26629
```

## Where things live

| Path | What |
|---|---|
| `posts/*.md` | Blog posts → `/blog`, `/blog/<slug>`, `/category/<name>`, `/tag/<name>`, `/feed.xml` |
| `pages/*.md` | Standalone pages (e.g. `pages/about.md` → `/about`) |
| `pages/_theme.js` | The site theme (layout + CSS served at `/_theme.css`) |
| `views/index.html` | The home page |
| `.env` | `VOLT_ADDONS=pages,posts`, `SITE_NAME`, optional `SITE_URL` (absolute RSS/canonical) |

## Write a post

Drop a file in `posts/`:

```
---
title: My Post
date: 2026-07-01          # or a 2026-07-01-my-post.md filename prefix
author: You
category: Guides
tags: volt, markdown
description: A short excerpt + og:description.
---
# My Post

Markdown body. Single posts get Open Graph + an Article JSON-LD automatically.
```

Set `draft: true` to hide a post. Run `npm run dev -- --edit` to add features (auth, a database, the WYSIWYG editor).
