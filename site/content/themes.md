# Themes (shared header, footer, layout, CSS)

By default each page renders in a minimal built-in theme. Give your pages a shared look three ways — zero-code to a publishable package.

## 1. Header & footer partials (no code)

Drop `pages/_header.html` and `pages/_footer.html` — they wrap **every** page.

## 2. A local theme

`pages/_theme.js` owns the document:

```
export const css = `body { max-width: 760px; margin: 0 auto } header { padding: 1rem }`;

export function layout({ title, head, content, meta }) {
  return `<!doctype html><html lang="en"><head>${head}<title>${title}</title>
    <link rel="stylesheet" href="/_theme.css"></head>
    <body><nav>…</nav><main>${content}</main><footer>…</footer></body></html>`;
}
```

Put `head` in `<head>` (it carries the page's SEO/OG/JSON-LD tags).

## 3. A third-party theme

```
npx create-volt create-theme my-theme   # scaffolds a publishable volt-theme-my-theme
cd volt-theme-my-theme && npm publish

# in your app:
npm install volt-theme-my-theme         # then set THEME=my-theme in .env
```

**Resolution:** `THEME` env (`volt-theme-<name>`) → local `pages/_theme.js` → built-in default.

## One stylesheet for page + editor

The active theme's CSS is served at **`/_theme.css`** — from a theme's `export const css`, or a `pages/_theme.css` file, or the default. Pages link it, and the **WYSIWYG editor loads the same `/_theme.css` into RTEPro**, so the editor preview matches the published page. CSS is authored once, in the theme — never duplicated.

## OG images

Per-page in front-matter (`image: /media/og.webp`), or a site-wide default with `OG_IMAGE` in `.env`.
