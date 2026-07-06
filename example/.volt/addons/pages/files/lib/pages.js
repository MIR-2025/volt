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
export function metaHead(meta) {
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
  // custom <script> tags for third-party libs: per-page front-matter `scripts:`
  // (comma-separated URLs) and/or a site-wide SITE_SCRIPTS env. Loaded deferred.
  const scripts = [process.env.SITE_SCRIPTS, meta.scripts].filter(Boolean).join(",");
  for (const url of scripts.split(",").map((s) => s.trim()).filter(Boolean)) {
    t.push(`<script src="${esc(url)}" defer></script>`);
  }
  return t.join("\n");
}

// Canonical color tokens with an automatic dark set (prefers-color-scheme), so the
// bare default still adapts to the OS AND a SITE_SCHEME can override the palette.
const DEFAULT_CSS = `:root { color-scheme: light dark; --bg:#ffffff; --surface:#f5f6f8; --ink:#1b1f24; --muted:#666e78; --line:#d9dde2; --brand:#0b67d6; --brand-ink:#ffffff }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0e1116; --surface:#171b21; --ink:#e6e8ee; --muted:#9aa4b2; --line:#2a313b; --brand:#6ea8ff; --brand-ink:#0e1116 } }
:root[data-theme="dark"] { --bg:#0e1116; --surface:#171b21; --ink:#e6e8ee; --muted:#9aa4b2; --line:#2a313b; --brand:#6ea8ff; --brand-ink:#0e1116 }
body { max-width: 720px; margin: 0 auto; padding: 2rem 1.1rem; font: 17px/1.7 system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--ink) }
h1, h2, h3 { line-height: 1.25; margin: 1.6rem 0 .6rem }
pre { background: #0b0d11; color: #cfe3ff; padding: 1rem; border-radius: 10px; overflow: auto }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em }
:not(pre) > code { background: color-mix(in srgb, var(--ink) 12%, transparent); padding: .1em .35em; border-radius: 5px }
img { max-width: 100% } a { color: var(--brand) }
blockquote { border-left: 3px solid var(--line); margin: 1rem 0; padding: .2rem 1rem; color: var(--muted) }
table { border-collapse: collapse } td, th { border: 1px solid var(--line); padding: .4rem .7rem }
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
const DEV = process.env.NODE_ENV !== "production";
// In dev, cache-bust theme imports by mtime so editing _theme.js shows up without
// a restart (ESM caches a given URL forever); unchanged files keep the same URL.
const freshUrl = (f) => pathToFileURL(f).href + (DEV ? "?t=" + fs.statSync(f).mtimeMs : "");

// In dev, inject the hot-reload client into served pages — content pages don't
// otherwise load volt.js, so they'd never receive reload/morph events. socket.io
// serves its client at /socket.io/socket.io.js; volt.js (a module) runs the
// hot-reload IIFE. Nothing is injected in production.
const HOT = DEV ? '\n<script src="/socket.io/socket.io.js"></script><script type="module" src="/volt.js"></script>\n' : "";
export const injectHot = (html) => (!HOT ? html : html.includes("</body>") ? html.replace("</body>", HOT + "</body>") : html + HOT);

// --- color schemes -------------------------------------------------------
// A scheme swaps the *palette* without touching a theme's *structure*: it sets
// the canonical color tokens below, which themes consume via var(). Pick one with
// data-scheme="<id>" on <html>; data-theme="dark" (or prefers-color-scheme) selects
// the dark set. A theme's own :root provides the defaults a scheme overrides.
// Canonical tokens: --bg --surface --ink --muted --line --brand --brand-ink
export const SCHEMES = [
  { id: "slate", label: "Slate", light: { bg: "#f7f8fa", surface: "#ffffff", ink: "#1a1f26", muted: "#57606b", line: "#e4e7ec", brand: "#475569", brandInk: "#ffffff" }, dark: { bg: "#0f141a", surface: "#181e26", ink: "#e6ebf1", muted: "#9aa7b5", line: "#27313d", brand: "#8fa3ba", brandInk: "#0f141a" } },
  { id: "ocean", label: "Ocean", light: { bg: "#f3f7f6", surface: "#ffffff", ink: "#10201c", muted: "#4c635e", line: "#dce8e4", brand: "#0e7c66", brandInk: "#ffffff" }, dark: { bg: "#08120f", surface: "#101d19", ink: "#e2f0eb", muted: "#86aaa0", line: "#1d302a", brand: "#34bd9e", brandInk: "#04130f" } },
  { id: "indigo", label: "Indigo", light: { bg: "#f6f6fc", surface: "#ffffff", ink: "#17182b", muted: "#565b78", line: "#e5e5f1", brand: "#4f46e5", brandInk: "#ffffff" }, dark: { bg: "#0d0e1a", surface: "#161829", ink: "#e8e9f6", muted: "#9294ba", line: "#272a41", brand: "#8f8bf6", brandInk: "#0c0d18" } },
  { id: "rose", label: "Rose", light: { bg: "#fcf6f7", surface: "#ffffff", ink: "#2a1418", muted: "#785459", line: "#f1e1e4", brand: "#c11d5a", brandInk: "#ffffff" }, dark: { bg: "#18090c", surface: "#231015", ink: "#f6e4e8", muted: "#c48d97", line: "#3b1e25", brand: "#f4588c", brandInk: "#180a0d" } },
  { id: "forest", label: "Forest", light: { bg: "#f4f8f2", surface: "#ffffff", ink: "#14230d", muted: "#4f6047", line: "#e1ebda", brand: "#2f7d32", brandInk: "#ffffff" }, dark: { bg: "#0a1408", surface: "#121f10", ink: "#e4f0e0", muted: "#8bab84", line: "#1e3019", brand: "#58c15b", brandInk: "#08140a" } },
  { id: "amber", label: "Amber", light: { bg: "#fbf7f0", surface: "#ffffff", ink: "#271c0c", muted: "#6f5f45", line: "#eee5d5", brand: "#b45309", brandInk: "#ffffff" }, dark: { bg: "#16110a", surface: "#201a10", ink: "#f2ebdd", muted: "#bda98a", line: "#352c1d", brand: "#e9a23b", brandInk: "#1a1308" } },
  { id: "mono", label: "Mono", light: { bg: "#f6f6f6", surface: "#ffffff", ink: "#17171a", muted: "#5c5c60", line: "#e6e6e8", brand: "#18181b", brandInk: "#ffffff" }, dark: { bg: "#0e0e10", surface: "#17171a", ink: "#ececee", muted: "#98989c", line: "#2a2a2e", brand: "#ededf0", brandInk: "#0e0e10" } },
  { id: "contrast", label: "High contrast", light: { bg: "#ffffff", surface: "#ffffff", ink: "#000000", muted: "#333333", line: "#000000", brand: "#0031c8", brandInk: "#ffffff" }, dark: { bg: "#000000", surface: "#0a0a0a", ink: "#ffffff", muted: "#d6d6d6", line: "#ffffff", brand: "#6ea8ff", brandInk: "#000000" } },
];
const schemeVars = (p) => `--bg:${p.bg};--surface:${p.surface};--ink:${p.ink};--muted:${p.muted};--line:${p.line};--brand:${p.brand};--brand-ink:${p.brandInk}`;
export function schemesCss(schemes = SCHEMES) {
  return schemes
    .map(
      (s) =>
        `[data-scheme="${s.id}"]{${schemeVars(s.light)}}\n` +
        `@media(prefers-color-scheme:dark){[data-scheme="${s.id}"]:not([data-theme="light"]){${schemeVars(s.dark)}}}\n` +
        `[data-scheme="${s.id}"][data-theme="dark"]{${schemeVars(s.dark)}}`
    )
    .join("\n");
}
// Stamp the owner's default scheme (palette) + mode (light/dark) onto <html>,
// server-side so there's no flash. SITE_MODE unset = auto (follows the device via
// prefers-color-scheme); "light"/"dark" force it. A visitor switcher can override
// data-scheme/data-theme client-side later.
export function injectScheme(html, env) {
  const id = String(env.SITE_SCHEME || "").replace(/[^a-z0-9-]/gi, "");
  const mode = String(env.SITE_MODE || "").toLowerCase();
  const attrs = [id ? `data-scheme="${id}"` : "", mode === "light" || mode === "dark" ? `data-theme="${mode}"` : ""].filter(Boolean).join(" ");
  return attrs && html.includes("<html") ? html.replace("<html", `<html ${attrs}`) : html;
}

// Theme-side utility (appended to every theme's /_theme.css): mark a block
// class="full-bleed" to break it OUT of the content column to full viewport width —
// e.g. a hero image or video from the editor. The theme keeps its readable text
// column; only flagged blocks span edge-to-edge. No editor change needed.
export const UTIL_CSS = `.full-bleed{width:100vw;max-width:100vw;margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw)}
.full-bleed>img,.full-bleed>video{width:100%;display:block}`;

export async function loadTheme(dir, env) {
  const wrap = (m) => {
    const layout = m && (m.layout || m.default);
    return layout ? { layout, css: m.css || themeCss(dir) } : null;
  };
  if (env.THEME) {
    // a theme bundled by create-volt (.volt/themes/<name>/index.js) — no npm needed
    const bundled = path.resolve(dir, "..", ".volt", "themes", env.THEME, "index.js");
    if (fs.existsSync(bundled)) {
      const t = wrap(await import(freshUrl(bundled)));
      if (t) return t;
    }
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
    const t = wrap(await import(freshUrl(local)));
    if (t) return t;
  }
  return { layout: defaultLayout(dir), css: themeCss(dir) };
}

// A theme getter that caches in production but re-resolves every call in dev, so
// theme edits hot-reload. Shared by pages + posts so they render the same theme.
export function themeResolver(dir) {
  let cached = null;
  return async () => (cached && !DEV ? cached : (cached = await loadTheme(dir, process.env)));
}

export async function pagesRouter({ dir }) {
  const express = (await import("express")).default;
  const { marked } = await import("marked");
  ensure(dir);
  const getTheme = themeResolver(dir);
  // render one markdown file into the theme. `format: html` pages (e.g. from the
  // WYSIWYG editor) are served verbatim; everything else is rendered with marked.
  const renderFile = async (file, fallbackTitle, res) => {
    const { meta, body } = parseFrontMatter(fs.readFileSync(file, "utf8"));
    const content = meta.format === "html" ? body : marked.parse(body);
    const m = { ...meta, title: meta.title || fallbackTitle };
    const { layout } = await getTheme();
    res.type("html").send(injectHot(injectScheme(layout({ title: m.title, head: metaHead(m), content, meta: m }), process.env)));
  };
  const r = express.Router();
  r.get("/_theme.css", async (_req, res) => res.type("css").send((await getTheme()).css + "\n" + schemesCss() + "\n" + UTIL_CSS));
  // themed home: pages/index.md takes over "/" (the site's front page) when present
  r.get("/", async (_req, res, next) => {
    const file = path.join(dir, "index.md");
    if (!fs.existsSync(file)) return next();
    await renderFile(file, "Home", res);
  });
  r.get("/:slug", async (req, res, next) => {
    const slug = req.params.slug;
    if (!isSafeSlug(slug)) return next(); // safe slug only — no traversal
    const file = path.join(dir, slug + ".md");
    if (!fs.existsSync(file)) return next();
    await renderFile(file, slug, res);
  });
  return r;
}
