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
  const unquote = (s) => s.replace(/^["']|["']$/g, "");
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const raw = line.slice(i + 1).trim();
    // YAML inline array (tags: [a, b, c]) → string[]; otherwise a scalar with quotes stripped.
    meta[key] =
      raw.startsWith("[") && raw.endsWith("]")
        ? raw.slice(1, -1).split(",").map((s) => unquote(s.trim())).filter(Boolean)
        : unquote(raw);
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
  if (process.env.SITE_FAVICON) {
    // media role: favicon (browser tab + apple-touch icon), site-wide
    t.push(`<link rel="icon" href="${esc(process.env.SITE_FAVICON)}" />`);
    t.push(`<link rel="apple-touch-icon" href="${esc(process.env.SITE_FAVICON)}" />`);
  }
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
const DEFAULT_CSS = `:root { color-scheme: light dark; --bg:#ffffff; --surface:#f5f6f8; --ink:#1b1f24; --muted:#666e78; --line:#d9dde2; --brand:#0b67d6; --brand-ink:#ffffff; --font-body: system-ui, -apple-system, sans-serif; --font-heading: var(--font-body); --font-subhead: var(--font-heading); --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0e1116; --surface:#171b21; --ink:#e6e8ee; --muted:#9aa4b2; --line:#2a313b; --brand:#6ea8ff; --brand-ink:#0e1116 } }
:root[data-theme="dark"] { --bg:#0e1116; --surface:#171b21; --ink:#e6e8ee; --muted:#9aa4b2; --line:#2a313b; --brand:#6ea8ff; --brand-ink:#0e1116 }
body { max-width: 720px; margin: 0 auto; padding: 2rem 1.1rem; font: 17px/1.7 var(--font-body); background: var(--bg); color: var(--ink) }
h1, h2, h3, h4 { line-height: 1.25; margin: 1.6rem 0 .6rem }
h1 { font-family: var(--font-heading) }
h2, h3, h4 { font-family: var(--font-subhead) }
pre { background: #0b0d11; color: #cfe3ff; padding: 1rem; border-radius: 10px; overflow: auto }
code { font-family: var(--font-mono); font-size: .9em }
:not(pre) > code { background: color-mix(in srgb, var(--ink) 12%, transparent); padding: .1em .35em; border-radius: 5px }
img { max-width: 100% } a { color: var(--brand) }
blockquote { border-left: 3px solid var(--line); margin: 1rem 0; padding: .2rem 1rem; color: var(--muted) }
table { border-collapse: collapse } td, th { border: 1px solid var(--line); padding: .4rem .7rem }
header, footer { max-width: 720px; margin: 0 auto; padding: 0 1.1rem }`;

// Built-in default theme: wraps content with optional pages/_header.html and
// pages/_footer.html partials (read fresh each request → live edits).
// Shared header: brand + the configured nav (pages/_nav.md) + a responsive
// hamburger. Standalone themes can build their own header from `nav` instead.
function navHeader(nav) {
  const name = process.env.SITE_NAME || "Home";
  const menu = nav.length ? `<input type="checkbox" id="__navt" class="nav-toggle" hidden /><label for="__navt" class="nav-burger" aria-label="Menu">☰</label><nav class="nav-links">${navLinks(nav)}</nav>` : "";
  return `<header class="site-nav"><div class="nav-wrap"><a class="brand" href="/">${brandMark(name)}</a>${menu}</div></header>`;
}
function defaultLayout(dir) {
  const part = (f) => {
    const p = path.join(dir, f);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  };
  // links /_theme.css (shared with the editor preview). A pages/_header.html
  // overrides the auto nav header.
  return ({ title, head, content, nav = [] }) => `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
${head}
<link rel="stylesheet" href="/_theme.css" /></head><body>${part("_header.html") || navHeader(nav)}<main>${content}</main>${part("_footer.html")}</body></html>`;
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
// Curated self-hostable fonts (SIL OFL / Apache). slug = fontsource slug; the config
// downloads their woff2 to public/fonts/<slug>/<weight>.woff2, so at runtime nothing loads
// from a third party (unlike Google Fonts — no visitor IPs leak to Google). family = CSS name.
export const FONTS = [
  { slug: "inter", family: "Inter", cat: "Sans-serif", stack: "sans-serif" },
  { slug: "roboto", family: "Roboto", cat: "Sans-serif", stack: "sans-serif" },
  { slug: "open-sans", family: "Open Sans", cat: "Sans-serif", stack: "sans-serif" },
  { slug: "work-sans", family: "Work Sans", cat: "Sans-serif", stack: "sans-serif" },
  { slug: "nunito", family: "Nunito", cat: "Sans-serif", stack: "sans-serif" },
  { slug: "poppins", family: "Poppins", cat: "Display", stack: "sans-serif" },
  { slug: "montserrat", family: "Montserrat", cat: "Display", stack: "sans-serif" },
  { slug: "merriweather", family: "Merriweather", cat: "Serif", stack: "serif" },
  { slug: "lora", family: "Lora", cat: "Serif", stack: "serif" },
  { slug: "source-serif-4", family: "Source Serif 4", cat: "Serif", stack: "serif" },
  { slug: "playfair-display", family: "Playfair Display", cat: "Serif", stack: "serif" },
  { slug: "jetbrains-mono", family: "JetBrains Mono", cat: "Monospace", stack: "monospace" },
  { slug: "fira-code", family: "Fira Code", cat: "Monospace", stack: "monospace" },
  { slug: "ibm-plex-mono", family: "IBM Plex Mono", cat: "Monospace", stack: "monospace" },
];
export const FONT_WEIGHTS = [400, 700];
const FONT_BY_SLUG = Object.fromEntries(FONTS.map((f) => [f.slug, f]));
// @font-face + the four role variables from FONT_HEADING/FONT_SUBHEAD/FONT_BODY/FONT_MONO
// (each a font slug). Appended to /_theme.css; overrides the theme's system-font defaults.
export function fontsCss(env = process.env) {
  const roles = { heading: env.FONT_HEADING, subhead: env.FONT_SUBHEAD, body: env.FONT_BODY, mono: env.FONT_MONO };
  // A .volt/fonts.json override (written live by the web admin) wins over .env — so a remote
  // owner can retune typography without an .env edit or a restart (served per-request).
  try {
    const o = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".volt", "fonts.json"), "utf8"));
    for (const k of ["heading", "subhead", "body", "mono"]) if (o[k] != null) roles[k] = o[k];
  } catch {}
  const used = new Set();
  let faces = "";
  const vars = [];
  for (const [role, slug] of Object.entries(roles)) {
    const f = slug && FONT_BY_SLUG[slug];
    if (!f) continue;
    if (!used.has(slug)) {
      used.add(slug);
      for (const w of FONT_WEIGHTS) faces += `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${w};font-display:swap;src:url(/fonts/${slug}/${w}.woff2) format('woff2')}\n`;
    }
    vars.push(`--font-${role}:'${f.family}',${f.stack}`);
  }
  return faces + (vars.length ? `:root{${vars.join(";")}}\n` : "");
}

export const UTIL_CSS = `.full-bleed{width:100vw;max-width:100vw;margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw)}
.full-bleed>img,.full-bleed>video{width:100%;display:block}
.site-nav{border-bottom:1px solid var(--line);margin-bottom:1.5rem;padding:.5rem 0}
.nav-wrap{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
.nav-wrap .brand{font-weight:800;color:var(--ink);text-decoration:none;font-size:1.15rem}
.brand-logo{height:1.9em;width:auto;display:block}
.nav-toggle{display:none}
.nav-burger{display:none;cursor:pointer;font-size:1.35rem;line-height:1;user-select:none;margin-left:auto;color:var(--ink)}
.nav-links{display:flex;gap:1.1rem;align-items:center;margin-left:auto;flex-wrap:wrap}
.nav-links a{text-decoration:none;color:var(--muted)}
.nav-links a:hover,.nav-links a.active{color:var(--brand)}
@media(max-width:640px){.nav-burger{display:inline-block}.nav-links{display:none;flex-direction:column;align-items:flex-start;width:100%;gap:.5rem;margin:.4rem 0 0}.nav-toggle:checked~.nav-links{display:flex}}
.nav-dd{position:relative}
.nav-dd>a,.nav-parent{color:var(--muted);cursor:pointer}
.nav-dd>*:first-child::after{content:"▾";font-size:.7em;margin-left:.25em;opacity:.55}
.nav-dd:hover>a,.nav-dd:hover>.nav-parent,.nav-dd:focus-within>a,.nav-dd:focus-within>.nav-parent,.nav-dd>a.active,.nav-dd>.nav-parent.active{color:var(--brand)}
.nav-sub{display:none;position:absolute;top:100%;left:0;min-width:11rem;flex-direction:column;gap:.35rem;padding:.5rem;margin-top:.35rem;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.14);z-index:30}
.nav-dd:hover>.nav-sub,.nav-dd:focus-within>.nav-sub{display:flex}
.nav-sub a{white-space:nowrap;color:var(--muted)}.nav-sub a:hover,.nav-sub a.active{color:var(--brand)}
@media(max-width:640px){.nav-dd{width:100%}.nav-sub{display:flex;position:static;box-shadow:none;border:0;background:transparent;margin:.15rem 0 .3rem;padding:.15rem 0 .2rem 1rem;min-width:0}}
.volt-hero{position:relative;overflow:hidden}
.vh-slide{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .8s ease}`;

// media role: hero. When SITE_HERO is set, fill every .volt-hero element on the page
// with those image(s)/video(s). Multiple → a fading carousel. No dependency, no build.
export function injectHero(html, env) {
  const imgs = String(env.SITE_HERO || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!imgs.length || !html.includes("</body>")) return html;
  const script = `<script>(function(){var H=${JSON.stringify(imgs)};document.querySelectorAll(".volt-hero").forEach(function(el){el.innerHTML=H.map(function(u,i){var v=/\\.(mp4|webm|mov|ogv|m4v)$/i.test(u),o="opacity:"+(i?0:1);return v?'<video src="'+u+'" autoplay muted loop playsinline class="vh-slide" style="'+o+'"></video>':'<img src="'+u+'" alt="" class="vh-slide" style="'+o+'">';}).join("");var k=el.querySelectorAll(".vh-slide");if(k.length<2)return;var i=0;setInterval(function(){k[i].style.opacity=0;i=(i+1)%k.length;k[i].style.opacity=1;},4500);});})();</script>`;
  return html.replace("</body>", script + "</body>");
}

// SPA navigation (opt-in, SITE_SPA=on). Pages stay server-rendered (SEO intact); this
// turns internal link clicks into fetch-and-swap so there's no full reload. Delegated
// on document (survives body swaps); re-runs inline scripts so the hero re-inits;
// falls back to a normal navigation on any error. External/hash/download links skip it.
export function injectSpa(html, env) {
  if (!/^(1|true|on|yes)$/i.test(String(env.SITE_SPA || "")) || !html.includes("</body>")) return html;
  const s = `<script>(function(){if(window.__vspa)return;window.__vspa=1;function run(r){r.querySelectorAll("script:not([src])").forEach(function(s){var n=document.createElement("script");n.textContent=s.textContent;s.replaceWith(n);});}function go(u,push){fetch(u,{headers:{"x-volt-spa":"1"}}).then(function(r){return r.text();}).then(function(h){var d=new DOMParser().parseFromString(h,"text/html");if(!d.body)throw 0;document.title=d.title;document.body.replaceWith(d.body);run(document.body);if(push)history.pushState({},"",u);window.scrollTo(0,0);}).catch(function(){location.href=u;});}document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a");if(!a)return;var h=a.getAttribute("href");if(!h||a.target||a.hasAttribute("download")||a.host!==location.host||h.charAt(0)==="#"||/^(mailto|tel):/i.test(h))return;e.preventDefault();go(a.href,true);});window.addEventListener("popstate",function(){go(location.href,false);});})();</script>`;
  return html.replace("</body>", s + "</body>");
}

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

// Configured header menu: pages/_nav.md is a markdown list of links; each
// [Label](href) becomes a nav item, in file order. Absent → no menu (the theme
// shows just the brand). Read fresh each request so edits show live.
export function loadNav(dir, activePath = "/") {
  const f = path.join(dir, "_nav.md");
  if (!fs.existsSync(f)) return [];
  const md = fs.readFileSync(f, "utf8");
  const isActive = (href) => href !== "#" && (href === activePath || (href.length > 1 && activePath.startsWith(href)));
  // A nav item is a markdown link on its own line (optionally list-marked). 2-space
  // indentation nests it under the previous shallower item → a dropdown submenu.
  const re = /^(\s*)(?:[-*+]\s+)?\[([^\]]+)\]\(\s*([^)\s]+)[^)]*\)/;
  const roots = [];
  const stack = []; // { indent, item }
  for (const line of md.split(/\r?\n/)) {
    const m = re.exec(line);
    if (!m) continue;
    const indent = m[1].replace(/\t/g, "  ").length;
    const href = m[3].trim();
    const item = { label: m[2].trim(), href, active: isActive(href), children: [] };
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length ? stack[stack.length - 1].item.children : roots).push(item);
    stack.push({ indent, item });
  }
  return roots;
}
// Render nav items to a theme's header: a flat item is an <a>; an item with children becomes
// a hover/tap dropdown (.nav-dd → .nav-sub). Active bubbles up so a parent highlights when a
// child is current. One level of dropdown (deeper nesting flattens into it).
const navItem = (it) => {
  const link = (x) => `<a href="${esc(x.href)}"${x.active ? ' class="active" aria-current="page"' : ""}>${esc(x.label)}</a>`;
  if (!it.children.length) return link(it);
  const on = it.active || it.children.some((c) => c.active);
  const toggle = it.href && it.href !== "#" ? `<a href="${esc(it.href)}"${on ? ' class="active"' : ""}>${esc(it.label)}</a>` : `<span class="nav-parent${on ? " active" : ""}" tabindex="0">${esc(it.label)}</span>`;
  return `<div class="nav-dd">${toggle}<div class="nav-sub">${it.children.map(link).join("")}</div></div>`;
};
export const navLinks = (nav = []) => nav.map(navItem).join("");
// Absolute URL for a path, for auto-canonical + og:url. Needs SITE_URL; else undefined.
export const absUrl = (p) => (process.env.SITE_URL ? process.env.SITE_URL.replace(/\/+$/, "") + p : undefined);
// media role: logo. The brand mark — a logo image when SITE_LOGO is set, else the name.
export const brandMark = (name) => (process.env.SITE_LOGO ? `<img class="brand-logo" src="${esc(process.env.SITE_LOGO)}" alt="${esc(name)}" />` : esc(name));

// Themed 404 — register LAST (after every add-on) so a genuinely unknown path renders
// in the active theme instead of Express's bare "Cannot GET". A pages/404.md overrides
// the copy; otherwise a sensible default. Same theme, nav, scheme, and meta as any page.
export function notFound(dir) {
  const getTheme = themeResolver(dir);
  return async (req, res) => {
    try {
      let content = `<h1>Page not found</h1><p>Sorry, we couldn't find <code>${esc(req.path)}</code>.</p><p><a href="/">← Back home</a></p>`;
      const custom = path.join(dir, "404.md");
      if (fs.existsSync(custom)) {
        const { marked } = await import("marked");
        const { meta, body } = parseFrontMatter(fs.readFileSync(custom, "utf8"));
        content = meta.format === "html" ? body : marked.parse(body);
      }
      const { layout } = await getTheme();
      const html = layout({ title: "Page not found", head: metaHead({ title: "Page not found" }), content, meta: {}, nav: loadNav(dir, req.path) });
      res.status(404).type("html").send(injectHot(injectScheme(html, process.env)));
    } catch {
      res.status(404).type("html").send("<h1>Page not found</h1><p><a href=\"/\">Home</a></p>");
    }
  };
}

// Normalize a URL path for matching: strip query/hash, ensure a leading slash, drop the
// trailing slash (so "/x" and "/x/" match — WordPress permalinks end in "/").
export function normPath(p) {
  p = String(p || "").split("?")[0].split("#")[0];
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

// Map of exact `permalink:` → source .md for pages carrying that front-matter field (e.g.
// from a WordPress migration) — so a migrated page keeps its ORIGINAL WP URL, SEO intact.
function pagePermalinks(dir) {
  const map = new Map();
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".md") || f.startsWith("_") || f === "404.md") continue;
      const { meta } = parseFrontMatter(fs.readFileSync(path.join(dir, f), "utf8"));
      if (meta.permalink) map.set(normPath(meta.permalink), path.join(dir, f));
    }
  } catch {
    /* no pages dir yet */
  }
  return map;
}

// Parse a root _redirects file (Netlify-style: `<from> <to> [status]`, one per line) →
// Map<fromPath, { dest, status }>. For legacy WP URLs with no page/post (feeds, archives).
export function loadRedirects(root) {
  const map = new Map();
  try {
    const file = path.join(root, "_redirects");
    if (!fs.existsSync(file)) return map;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const [from, dest, status] = t.split(/\s+/);
      if (from && dest) map.set(normPath(from), { dest, status: Number(status) || 301 });
    }
  } catch {
    /* none */
  }
  return map;
}

export async function pagesRouter({ dir }) {
  const express = (await import("express")).default;
  const { marked } = await import("marked");
  ensure(dir);
  const getTheme = themeResolver(dir);
  // render one markdown file into the theme. `format: html` pages (e.g. from the
  // WYSIWYG editor) are served verbatim; everything else is rendered with marked.
  const renderFile = async (file, fallbackTitle, res, activePath = "/") => {
    const { meta, body } = parseFrontMatter(fs.readFileSync(file, "utf8"));
    const content = meta.format === "html" ? body : marked.parse(body);
    // a page's own permalink is its canonical URL unless one is set explicitly
    const canonical = meta.canonical || (meta.permalink ? absUrl(normPath(meta.permalink)) : absUrl(activePath));
    const m = { ...meta, title: meta.title || fallbackTitle, canonical };
    const { layout } = await getTheme();
    const nav = loadNav(dir, activePath);
    res.type("html").send(injectHot(injectSpa(injectHero(injectScheme(layout({ title: m.title, head: metaHead(m), content, meta: m, nav }), process.env), process.env), process.env)));
  };
  const permalinks = pagePermalinks(dir);
  const redirects = loadRedirects(path.join(dir, "..")); // _redirects sits at the app root
  const r = express.Router();
  r.get("/_theme.css", async (_req, res) => res.type("css").send((await getTheme()).css + "\n" + schemesCss() + "\n" + UTIL_CSS + "\n" + fontsCss(process.env)));
  // 301 legacy WordPress URLs (feeds, archives, ?p= links) from the root _redirects file
  if (redirects.size) {
    r.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      const hit = redirects.get(normPath(req.path));
      return hit ? res.redirect(hit.status, hit.dest) : next();
    });
  }
  // serve pages at their exact `permalink:` path (migrated WP URLs survive, incl. nesting)
  if (permalinks.size) {
    r.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      const file = permalinks.get(normPath(req.path));
      if (!file) return next();
      renderFile(file, path.basename(file, ".md"), res, req.path).catch(next);
    });
  }
  // themed home: `/` is `pages/index.md` by default, but HOMEPAGE=<page-slug> promotes any
  // page to the front page (WordPress "static front page"); HOMEPAGE=posts is served by the
  // posts add-on. Admin-settable — see the web admin's "Home page" card.
  r.get("/", async (_req, res, next) => {
    const home = String(process.env.HOMEPAGE || "").trim();
    const slug = home && home.toLowerCase() !== "posts" && isSafeSlug(home) ? home : "index";
    const file = path.join(dir, slug + ".md");
    if (!fs.existsSync(file)) return next();
    await renderFile(file, slug === "index" ? "Home" : slug, res, "/");
  });
  r.get("/:slug", async (req, res, next) => {
    const slug = req.params.slug;
    if (!isSafeSlug(slug)) return next(); // safe slug only — no traversal
    const file = path.join(dir, slug + ".md");
    if (!fs.existsSync(file)) return next();
    await renderFile(file, slug, res, "/" + slug);
  });
  return r;
}
