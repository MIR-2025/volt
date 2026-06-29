// pages.js — markdown pages. Drop *.md files in pages/ and each is served as
// HTML at /<slug>. No database, no admin: author them in your editor or with AI.
// Pages are code-owned files (trusted), so their markdown HTML is served as-is.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
// express + marked are imported lazily in pagesRouter() so this module's pure
// helpers (parseFrontMatter, isSafeSlug) load without those deps installed.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const SAMPLE = `---
title: Welcome
---

# Your Volt pages

This page is a markdown file at \`pages/welcome.md\`, served at \`/welcome\`.

- Drop more \`.md\` files in \`pages/\` — each becomes a page at \`/<filename>\`.
- Add front-matter to set the title:

\`\`\`
---
title: About us
---
\`\`\`

Author them in your editor, or ask an AI to write them. No database, no admin.
`;

function ensure(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "welcome.md"), SAMPLE);
  }
}

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
export function parseFrontMatter(src) {
  const m = src.match(FM);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: src.slice(m[0].length) };
}

// slugs are restricted to a safe charset — no dots/slashes → no path traversal
export const isSafeSlug = (s) => /^[a-z0-9][a-z0-9-]*$/i.test(s);

// SEO/social head from front-matter: description, image, type, canonical, jsonld.
function metaHead(meta) {
  const t = [];
  const title = meta.title || "";
  const desc = meta.description || "";
  if (title) t.push(`<meta property="og:title" content="${esc(title)}" />`);
  if (desc) {
    t.push(`<meta name="description" content="${esc(desc)}" />`);
    t.push(`<meta property="og:description" content="${esc(desc)}" />`);
  }
  t.push(`<meta property="og:type" content="${esc(meta.type || "website")}" />`);
  const image = meta.image || process.env.OG_IMAGE; // per-page, else a site-wide default
  if (image) t.push(`<meta property="og:image" content="${esc(image)}" />`);
  if (meta.url || meta.canonical) t.push(`<meta property="og:url" content="${esc(meta.url || meta.canonical)}" />`);
  if (meta.canonical) t.push(`<link rel="canonical" href="${esc(meta.canonical)}" />`);
  t.push(`<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`);
  if (meta.jsonld) {
    let ok = false;
    try {
      JSON.parse(meta.jsonld);
      ok = true;
    } catch {
      /* invalid JSON-LD → skip */
    }
    if (ok) t.push(`<script type="application/ld+json">${meta.jsonld.replace(/</g, "\\u003c")}</script>`);
  }
  return t.join("\n");
}

const DEFAULT_CSS = `:root { color-scheme: light dark }
body { max-width: 720px; margin: 0 auto; padding: 2rem 1.1rem; font: 17px/1.7 system-ui, -apple-system, sans-serif; }
h1, h2, h3 { line-height: 1.25; margin: 1.6rem 0 .6rem }
pre { background: #0b0d11; color: #cfe3ff; padding: 1rem; border-radius: 10px; overflow: auto }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em }
:not(pre) > code { background: rgba(127,127,127,.18); padding: .1em .35em; border-radius: 5px }
img { max-width: 100% } a { color: #0b67d6 }
blockquote { border-left: 3px solid #ccc; margin: 1rem 0; padding: .2rem 1rem; opacity: .8 }
table { border-collapse: collapse } td, th { border: 1px solid #ccc; padding: .4rem .7rem }
header, footer { max-width: 720px; margin: 0 auto; padding: 0 1.1rem }`;

// Built-in default theme: wraps content with optional pages/_header.html and
// pages/_footer.html partials (read fresh each request → live edits).
function defaultLayout(dir) {
  const part = (f) => {
    const p = path.join(dir, f);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  };
  // links /_theme.css (the active theme's CSS) so the page and the editor preview
  // share one stylesheet.
  return ({ title, head, content }) => `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
${head}
<link rel="stylesheet" href="/_theme.css" /></head><body>${part("_header.html")}<main>${content}</main>${part("_footer.html")}</body></html>`;
}

// The active theme's CSS — a `_theme.css` override in pages/, else the default.
function themeCss(dir) {
  const p = path.join(dir, "_theme.css");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : DEFAULT_CSS;
}

// Resolve the layout + its CSS. THEME=<name> → npm "volt-theme-<name>"; else a
// local pages/_theme.js; else the built-in default. A theme may `export const css`
// (served at /_theme.css, shared with the editor); otherwise pages/_theme.css or
// the default CSS is used.
async function loadTheme(dir, env) {
  const wrap = (m) => {
    const layout = m && (m.layout || m.default);
    return layout ? { layout, css: m.css || themeCss(dir) } : null;
  };
  if (env.THEME) {
    for (const id of [`volt-theme-${env.THEME}`, env.THEME]) {
      try {
        const t = wrap(await import(id));
        if (t) return t;
      } catch {
        /* try next */
      }
    }
  }
  const local = path.join(dir, "_theme.js");
  if (fs.existsSync(local)) {
    const t = wrap(await import(pathToFileURL(local).href));
    if (t) return t;
  }
  return { layout: defaultLayout(dir), css: themeCss(dir) };
}

export async function pagesRouter({ dir }) {
  const express = (await import("express")).default;
  const { marked } = await import("marked");
  ensure(dir);
  const { layout, css } = await loadTheme(dir, process.env);
  const r = express.Router();
  r.get("/_theme.css", (_req, res) => res.type("css").send(css));
  r.get("/:slug", (req, res, next) => {
    const slug = req.params.slug;
    if (!isSafeSlug(slug)) return next(); // safe slug only — no traversal
    const file = path.join(dir, slug + ".md");
    if (!fs.existsSync(file)) return next();
    const { meta, body } = parseFrontMatter(fs.readFileSync(file, "utf8"));
    // `format: html` pages (e.g. from the WYSIWYG editor) are served verbatim to
    // preserve complex layouts; everything else is markdown rendered with marked.
    const content = meta.format === "html" ? body : marked.parse(body);
    const m = { ...meta, title: meta.title || slug };
    res.type("html").send(layout({ title: m.title, head: metaHead(m), content, meta: m }));
  });
  return r;
}
