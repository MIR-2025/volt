// volt-addon-editor — a standing, role-gated WYSIWYG editor for Volt, powered by
// RTEPro. It writes markdown to pages/ (served by the pages add-on), so editors
// get a WordPress-like authoring experience while content stays markdown-on-disk.
//
// Security: mounts ONLY if ADMIN_PATH is set (fail-closed). The path is obscurity
// layered on top of magic-link auth + an ADMIN_EMAILS allowlist — never instead.
// Config (.env): ADMIN_PATH=/your-secret  ADMIN_EMAILS=you@x.com  AI_PROVIDER=anthropic
//   + the provider key: ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { aiProxyHandler } from "./lib/ai.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isSafeSlug = (s) => /^[a-z0-9][a-z0-9-]*$/i.test(s);

const EDITOR_HTML = (base, provider) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Editor — Volt</title><meta name="robots" content="noindex" />
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
<style>body{background:#0f1115;color:#e7e9ee}.side a{cursor:pointer}</style>
<script>window.__VOLT_AI_PROVIDER=${JSON.stringify(provider)};window.__VOLT_BASE=${JSON.stringify(base)};</script>
</head><body>
<div class="container-fluid py-3"><div class="row g-3">
  <div class="col-md-3 side">
    <div class="d-flex justify-content-between align-items-center mb-2"><strong>Pages</strong><button id="new" class="btn btn-sm btn-outline-secondary">+ New</button></div>
    <div id="pages" class="list-group"></div>
  </div>
  <div class="col-md-9">
    <div class="d-flex gap-2 mb-2">
      <input id="title" class="form-control" placeholder="Title" />
      <input id="slug" class="form-control" style="max-width:200px" placeholder="slug" />
      <select id="fmt" class="form-select" style="max-width:170px" title="Save format">
        <option value="html">HTML (keeps layout)</option>
        <option value="markdown">Markdown</option>
      </select>
      <button id="save" class="btn btn-primary">Save</button>
    </div>
    <details class="mb-2"><summary class="text-muted small" style="cursor:pointer">SEO &amp; social — Open Graph + JSON-LD</summary>
      <input id="desc" class="form-control my-1" placeholder="Meta description (og:description)" />
      <input id="img" class="form-control my-1" placeholder="og:image URL — e.g. /media/og.webp" />
      <textarea id="jsonld" class="form-control my-1" rows="4" placeholder='JSON-LD, e.g. {"@context":"https://schema.org","@type":"Article","headline":"…"}'></textarea>
    </details>
    <div id="editor"></div>
    <p id="msg" class="small text-muted mt-2"></p>
  </div>
</div></div>
<script src="${base}/rte-pro.js"></script>
<script type="module" src="${base}/editor.js"></script>
</body></html>`;

export function register({ app, express, env, requireAuth, log }) {
  const raw = (env.ADMIN_PATH || "").trim();
  if (!raw) return log("ADMIN_PATH not set — editor disabled (fail-closed).");
  if (!requireAuth) return log("auth add-on is required for the editor — disabled.");
  const base = "/" + raw.replace(/^\/+|\/+$/g, "");
  const allow = new Set(String(env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const provider = env.AI_PROVIDER || "anthropic";
  const pagesDir = path.join(process.cwd(), "pages");

  // gate: signed in AND (if an allowlist is set) on it
  const gate = [
    requireAuth,
    (req, res, next) => {
      if (allow.size && !allow.has(String(req.user?.email || "").toLowerCase())) return res.status(403).type("html").send("Not authorized.");
      next();
    },
  ];
  const json = express.json({ limit: "4mb" });
  const rtePath = require.resolve("rte-rich-text-editor-pro");

  app.get(base, gate, (_req, res) => res.type("html").send(EDITOR_HTML(base, provider)));
  app.get(base + "/rte-pro.js", gate, (_req, res) => res.type("js").sendFile(rtePath));
  app.get(base + "/editor.js", gate, (_req, res) => res.type("js").sendFile(path.join(__dirname, "public", "editor.js")));

  app.get(base + "/api/pages", gate, (_req, res) => {
    fs.mkdirSync(pagesDir, { recursive: true });
    const pages = fs.readdirSync(pagesDir).filter((f) => f.endsWith(".md")).map((f) => ({ slug: f.replace(/\.md$/, "") }));
    res.json({ pages });
  });

  app.get(base + "/api/page", gate, (req, res) => {
    const slug = String(req.query.slug || "");
    if (!isSafeSlug(slug)) return res.status(400).json({ ok: false });
    const file = path.join(pagesDir, slug + ".md");
    if (!fs.existsSync(file)) return res.json({ ok: true, slug, title: "", html: "" });
    const src = fs.readFileSync(file, "utf8");
    const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    const body = m ? src.slice(m[0].length) : src;
    const fmText = m ? m[1] : "";
    const field = (k) => {
      const mm = fmText.match(new RegExp("^" + k + ":\\s*(.+)$", "m"));
      return mm ? mm[1].trim() : "";
    };
    const format = field("format") === "html" ? "html" : "markdown";
    // editor loads HTML into RTEPro.setHTML(); html pages pass through verbatim,
    // markdown pages are rendered so they show formatted in the editor.
    res.json({ ok: true, slug, title: field("title"), format, description: field("description"), image: field("image"), jsonld: field("jsonld"), html: format === "html" ? body : marked.parse(body) });
  });

  app.post(base + "/api/page", gate, json, (req, res) => {
    const slug = String(req.body?.slug || "").toLowerCase();
    if (!isSafeSlug(slug)) return res.status(400).json({ ok: false, error: "invalid slug" });
    const title = String(req.body?.title || slug).replace(/[\r\n]+/g, " ").slice(0, 200);
    // The editor chooses: HTML (format: html, served verbatim) preserves complex
    // layouts losslessly; markdown is clean + hand-editable but can't represent
    // multi-column/styled layouts.
    const isHtml = typeof req.body?.html === "string";
    const body = String(isHtml ? req.body.html : (req.body?.markdown ?? ""));
    const oneLine = (v, n) => String(v).replace(/[\r\n]+/g, " ").trim().slice(0, n);
    const fmLines = [`title: ${title}`];
    if (req.body?.description) fmLines.push(`description: ${oneLine(req.body.description, 300)}`);
    if (req.body?.image) fmLines.push(`image: ${oneLine(req.body.image, 500)}`);
    if (req.body?.jsonld) {
      try {
        fmLines.push(`jsonld: ${JSON.stringify(JSON.parse(req.body.jsonld))}`); // validated + collapsed to one line
      } catch {
        return res.status(400).json({ ok: false, error: "JSON-LD is not valid JSON" });
      }
    }
    if (isHtml) fmLines.push("format: html");
    fs.mkdirSync(pagesDir, { recursive: true });
    fs.writeFileSync(path.join(pagesDir, slug + ".md"), `---\n${fmLines.join("\n")}\n---\n\n${body}\n`);
    res.json({ ok: true, url: "/" + slug, format: isHtml ? "html" : "markdown" });
  });

  app.post(base + "/api/ai", gate, json, aiProxyHandler(env));

  log(`editor ready at ${base} — allowlist: ${allow.size ? [...allow].join(", ") : "(any signed-in user — set ADMIN_EMAILS!)"}`);
}
