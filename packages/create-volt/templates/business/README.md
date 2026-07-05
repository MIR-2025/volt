# Northwind — a full Volt site template

A complete, multi-page business/store site: **Home, About, Products, Contact**, a
sticky nav, hero, feature + product grids, and a call-to-action band — all in your
site theme.

```
npm create volt@latest my-site -- --template business
cd my-site && npm run dev
```

## Make it yours

Everything is editable content, no code required:

- **Text** — open the config (`npm run dev -- --edit`) → **Manage content**, and edit
  each page in the visual editor.
- **Images & video** — every `.slot` block (`📷 / 🎬`) is a placeholder. Drop your own
  image or video in via the editor; the media add-on stores it and swaps it in.
- **Brand** — set `SITE_NAME` in the config; the nav, footer, and titles pick it up.
- **Theme** — colors, spacing, and layout live in `pages/_theme.js` (CSS variables at
  the top). Edit there, or pick a different theme in the config.

Pages are `pages/*.md` with `format: html` for rich layouts; add or remove pages by
adding/removing files in `pages/`.
