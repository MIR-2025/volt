// server.js — the Volt site, server-rendered *with Volt*. Pages are authored as
// Volt html`` markup (content.js) and rendered to HTML strings by Volt's own SSR
// renderer (volt-ssr.js) — real, crawlable URLs with per-page <title>/meta/
// canonical/OG, plus sitemap + robots. enhance.js hydrates the live widget with
// volt.js on the client. No build step.
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { html, renderToString } from "./public/volt-ssr.js";
import { home, build, compare, DOCS, docsPage, GH, NPM } from "./content.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 26628;
const HOST = process.env.HOST || "127.0.0.1";
const SITE_URL = process.env.SITE_URL || "https://voltjs.com";

const nav = (active) => {
  const link = (href, label) => html`<a class="${active === href || (href !== "/" && active.startsWith(href)) ? "active" : ""}" href="${href}">${label}</a>`;
  return html`<nav class="navx py-2"><div class="container navbar-row" style="max-width:1000px">
      <a class="brand h5 mb-0 accent d-inline-flex align-items-center" href="/"><img src="/logo.webp" alt="" class="brand-logo" />Volt</a>
      <input type="checkbox" id="nav-toggle" class="nav-toggle" aria-hidden="true" />
      <label for="nav-toggle" class="nav-burger" aria-label="Toggle menu">☰</label>
      <div class="nav-links">
        ${link("/build", "10-min demo")}${link("/compare", "Compare")}${link("/docs", "Docs")}
        <a href="${GH}" rel="noopener">GitHub</a>
        <a href="${NPM}" rel="noopener">npm</a>
      </div>
    </div></nav>`;
};

const footer = () => html`<footer class="py-4 mt-5"><div class="container d-flex flex-wrap gap-3 small" style="max-width:1000px">
    <span><img src="/logo.webp" alt="" style="height:1em;vertical-align:-.15em;margin-right:.2em" />Volt — MIT licensed. This site is built with Volt (server-rendered via volt-ssr.js).</span>
    <a class="ms-auto" href="${GH}" rel="noopener">GitHub</a>
    <a href="${NPM}" rel="noopener">npm</a>
    <a href="/docs">Docs</a>
    <a href="/build">10-min demo</a>
  </div></footer>`;

const doc = (page) => {
  const url = SITE_URL + page.path;
  return html`<!doctype html><html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${page.title}</title>
<meta name="description" content="${page.desc}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Volt" />
<meta property="og:title" content="${page.title}" />
<meta property="og:description" content="${page.desc}" />
<meta property="og:url" content="${url}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${page.title}" />
<meta name="twitter:description" content="${page.desc}" />
<link rel="icon" type="image/webp" href="/favicon.webp" />
<link rel="apple-touch-icon" href="/favicon.webp" />
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
<link href="/style.css" rel="stylesheet" />
</head><body>${nav(page.path)}<main class="container py-4" style="max-width:1000px">${page.body}</main>${footer()}<script type="module" src="/enhance.js"></script></body></html>`;
};

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

const send = (res, page) => res.type("html").send(renderToString(doc(page)));
const notFound = { path: "/404", title: "Not found — Volt", desc: "Page not found.", body: html`<h1 class="h3">Not found</h1><p><a href="/">← Home</a></p>` };

app.get("/", (_req, res) => send(res, home));
app.get("/build", (_req, res) => send(res, build));
app.get("/compare", (_req, res) => send(res, compare));
app.get("/docs", (_req, res) => res.redirect(301, "/docs/" + DOCS[0].id));
app.get("/docs/:id", (req, res) => {
  if (!DOCS.some((d) => d.id === req.params.id)) return res.status(404).type("html").send(renderToString(doc(notFound)));
  send(res, docsPage(req.params.id));
});

app.get("/robots.txt", (_req, res) => res.type("text/plain").send(`User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`));
app.get("/sitemap.xml", (_req, res) => {
  const urls = ["/", "/build", "/compare", ...DOCS.map((d) => "/docs/" + d.id)];
  const body = urls.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join("\n");
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
});

app.use((_req, res) => res.status(404).type("html").send(renderToString(doc(notFound))));

http.createServer(app).listen(PORT, HOST, () => console.log(`⚡ Volt site (Volt SSR) → http://${HOST}:${PORT}`));
