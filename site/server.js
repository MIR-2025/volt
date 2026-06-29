// server.js — the Volt site, server-rendered for real, crawlable URLs (no #/).
// Each route returns full HTML with its own <title>/meta/canonical/OG, plus a
// sitemap + robots. No build step; the page is composed from content.js strings.
// A tiny enhance.js progressively adds copy buttons and a live Volt widget.
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { home, build, DOCS, docsPage, GH, NPM } from "./content.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 26628;
const HOST = process.env.HOST || "127.0.0.1";
const SITE_URL = process.env.SITE_URL || "https://volt.whitneys.co";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const nav = (active) => {
  const link = (href, label) => `<a class="${active === href || (href !== "/" && active.startsWith(href)) ? "active" : ""}" href="${href}">${label}</a>`;
  return `<nav class="navx py-2"><div class="container d-flex align-items-center gap-3" style="max-width:1000px">
    <a class="brand h5 mb-0 accent" href="/">⚡ Volt</a>
    ${link("/build", "10-min demo")}
    ${link("/docs", "Docs")}
    <a class="ms-auto" href="${GH}" rel="noopener">GitHub</a>
    <a href="${NPM}" rel="noopener">npm</a>
  </div></nav>`;
};

const footer = () => `<footer class="py-4 mt-5"><div class="container d-flex flex-wrap gap-3 small" style="max-width:1000px">
  <span>⚡ Volt — MIT licensed.</span>
  <a class="ms-auto" href="${GH}" rel="noopener">GitHub</a>
  <a href="${NPM}" rel="noopener">npm</a>
  <a href="/docs">Docs</a>
  <a href="/build">10-min demo</a>
</div></footer>`;

const shell = (page) => {
  const url = SITE_URL + page.path;
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.desc)}" />
<link rel="canonical" href="${esc(url)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Volt" />
<meta property="og:title" content="${esc(page.title)}" />
<meta property="og:description" content="${esc(page.desc)}" />
<meta property="og:url" content="${esc(url)}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${esc(page.title)}" />
<meta name="twitter:description" content="${esc(page.desc)}" />
<link rel="icon" href="/favicon.svg" />
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
<link href="/style.css" rel="stylesheet" />
</head><body>
${nav(page.path)}
<main class="container py-4" style="max-width:1000px">${page.body}</main>
${footer()}
<script type="module" src="/enhance.js"></script>
</body></html>`;
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

const sendPage = (res, page) => res.type("html").send(shell(page));
app.get("/", (_req, res) => sendPage(res, home));
app.get("/build", (_req, res) => sendPage(res, build));
app.get("/docs", (_req, res) => res.redirect(301, "/docs/" + DOCS[0].id));
app.get("/docs/:id", (req, res) => {
  if (!DOCS.some((d) => d.id === req.params.id)) return res.status(404).type("html").send(shell({ path: "/404", title: "Not found — Volt", desc: "Page not found.", body: '<h1 class="h3">Not found</h1><p><a href="/">← Home</a></p>' }));
  sendPage(res, docsPage(req.params.id));
});

app.get("/robots.txt", (_req, res) =>
  res.type("text/plain").send(`User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`));
app.get("/sitemap.xml", (_req, res) => {
  const urls = ["/", "/build", ...DOCS.map((d) => "/docs/" + d.id)];
  const body = urls.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join("\n");
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
});

app.use((_req, res) => res.status(404).type("html").send(shell({ path: "/404", title: "Not found — Volt", desc: "Page not found.", body: '<h1 class="h3">Not found</h1><p><a href="/">← Home</a></p>' })));

http.createServer(app).listen(PORT, HOST, () => console.log(`⚡ Volt site (SSR) → http://${HOST}:${PORT}`));
