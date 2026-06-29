# Volt docs

A documentation site built with [Volt](https://voltjs.com) — markdown pages in a sidebar layout. No build step, no database.

```
npm install
npm run dev        # → http://localhost:26629  (redirects to /getting-started)
```

## Where things live

| Path | What |
|---|---|
| `pages/*.md` | Each becomes a doc page at `/<slug>` |
| `pages/_theme.js` | The sidebar layout + CSS. Add pages to the `NAV` list here |
| `views/index.html` | Redirects `/` to the first page |
| `.env` | `VOLT_ADDONS=pages`, `SITE_NAME` |

## Add a page

1. Create `pages/my-topic.md` with front-matter (`title`, `description`).
2. Add `["/my-topic", "My topic"]` to `NAV` in `pages/_theme.js`.

Run `npm run dev -- --edit` to add features (auth, a database, the WYSIWYG editor), or set `THEME=<name>` to use a published `volt-theme-*`.
