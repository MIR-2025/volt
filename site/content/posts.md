# Posts (blog with categories, tags & RSS)

The `posts` add-on turns markdown files into a blog — the content type a WordPress site is built around. It depends on `pages` (for the theme + SEO machinery) and renders in your site theme.

## Write a post

Drop a file in `posts/`:

```
---
title: Hello World
date: 2026-06-29          # or use a 2026-06-29-hello.md filename prefix
author: Rich
category: Tech
tags: javascript, volt    # comma-separated
description: A short excerpt + og:description.
---
# Hello

Your **markdown** body. `format: html` is honored too (for editor-authored layouts).
```

Set `draft: true` to keep a post unpublished.

## Routes you get

| URL | What |
|---|---|
| `/blog` | Paginated index, newest first (`POSTS_PER_PAGE`, default 10) |
| `/blog/<slug>` | Single post — renders with an Article **JSON-LD** + `og:type=article` |
| `/category/<name>` | Posts in a category |
| `/tag/<name>` | Posts with a tag |
| `/feed.xml` | RSS 2.0 (set `SITE_URL` for absolute links) |

Everything is markdown-on-disk — author in your editor, with AI, or via the WYSIWYG editor add-on. Per-post SEO (description, image, JSON-LD) works exactly like `pages`.
