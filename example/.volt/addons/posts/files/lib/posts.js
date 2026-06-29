// posts.js — a blog content type. Markdown files in posts/ become a paginated
// index at /blog, single posts at /blog/<slug>, plus /category/<name>,
// /tag/<name>, and an RSS feed at /feed.xml. Renders in the site theme and
// reuses pages' front-matter + SEO helpers (OG, Twitter, JSON-LD).
import fs from "node:fs";
import path from "node:path";
// express + marked are imported lazily in postsRouter() so the pure helpers load
// without those deps. Theme + SEO come from the pages add-on (a dependency).
import { parseFrontMatter, isSafeSlug, metaHead, themeResolver } from "../../../pages/files/lib/pages.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const postLink = (slug) => "/blog/" + slug;
const catLink = (c) => `<a href="/category/${slugify(c)}">${esc(c)}</a>`;
const tagLink = (t) => `<a class="post-tag" href="/tag/${slugify(t)}">${esc(t)}</a>`;
const tagsOf = (meta) => String(meta.tags || "").split(",").map((s) => s.trim()).filter(Boolean);

function fmtDate(d) {
  if (!d) return "";
  const opts = { year: "numeric", month: "long", day: "numeric" };
  // A date-only value (YYYY-MM-DD) is a calendar day with no timezone — parse it
  // as local midnight and render that day (new Date("2026-06-28") would be UTC →
  // off by a day in negative-offset zones). A full timestamp is rendered in the
  // admin's timezone (SITE_TZ, detected by the setup wizard), not the server's.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d).trim());
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("en-US", opts);
  const t = new Date(d);
  return isNaN(t.getTime()) ? esc(d) : t.toLocaleDateString("en-US", process.env.SITE_TZ ? { ...opts, timeZone: process.env.SITE_TZ } : opts);
}

function excerpt(p) {
  if (p.meta.description) return p.meta.description;
  const text = String(p.body).replace(/<[^>]+>/g, " ").replace(/[#>*_`[\]()!]+/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 160) + (text.length > 160 ? "…" : "");
}

// Read + parse every post, newest first. Date comes from front-matter `date:` or
// a YYYY-MM-DD- filename prefix; slug from front-matter `slug:` or the filename
// (prefix stripped). Drafts (draft: true) are skipped.
export function readPosts(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const { meta, body } = parseFrontMatter(fs.readFileSync(path.join(dir, f), "utf8"));
    if (String(meta.draft).toLowerCase() === "true") continue;
    let name = f.replace(/\.md$/, "");
    let date = meta.date || "";
    const m = name.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
    if (m) {
      if (!date) date = m[1];
      name = m[2];
    }
    const slug = slugify(meta.slug || name);
    if (!isSafeSlug(slug)) continue;
    out.push({ slug, date, meta, body });
  }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function renderList(posts, { heading, page = 1, totalPages = 1, baseUrl }) {
  const items = posts.length
    ? posts
        .map(
          (p) => `<li class="post-item" style="margin:0 0 1.5rem">
    <a href="${postLink(p.slug)}" style="font-size:1.2rem;font-weight:600">${esc(p.meta.title || p.slug)}</a>
    <div class="post-meta" style="opacity:.7;font-size:.9rem">${fmtDate(p.date)}${p.meta.category ? " &middot; " + catLink(p.meta.category) : ""}</div>
    <p style="margin:.3rem 0 0">${esc(excerpt(p))}</p>
  </li>`,
        )
        .join("\n")
    : "<li>No posts yet.</li>";
  let nav = "";
  if (totalPages > 1) {
    const prev = page > 1 ? `<a href="${baseUrl}?page=${page - 1}">&larr; Newer</a>` : "<span></span>";
    const next = page < totalPages ? `<a href="${baseUrl}?page=${page + 1}" style="margin-left:auto">Older &rarr;</a>` : "";
    nav = `<nav class="post-pager" style="display:flex;margin-top:1.5rem">${prev}${next}</nav>`;
  }
  return `<h1>${esc(heading)}</h1><ul class="post-list" style="list-style:none;padding:0">${items}</ul>${nav}`;
}

function renderPost(p, marked) {
  const title = p.meta.title || p.slug;
  const body = p.meta.format === "html" ? p.body : marked.parse(p.body);
  const tags = tagsOf(p.meta);
  const meta = `<div class="post-meta" style="opacity:.7;font-size:.9rem;margin-bottom:1rem">${fmtDate(p.date)}${p.meta.author ? " &middot; " + esc(p.meta.author) : ""}${p.meta.category ? " &middot; " + catLink(p.meta.category) : ""}</div>`;
  const tagHtml = tags.length ? `<div class="post-tags" style="margin-top:1.5rem">Tags: ${tags.map(tagLink).join(" ")}</div>` : "";
  return `<article><h1>${esc(title)}</h1>${meta}${body}${tagHtml}</article>`;
}

function feedXml(posts) {
  const base = (process.env.SITE_URL || "").replace(/\/+$/, "");
  const name = process.env.SITE_NAME || "Blog";
  const items = posts
    .slice(0, 20)
    .map(
      (p) => `  <item>
    <title>${esc(p.meta.title || p.slug)}</title>
    <link>${esc(base + postLink(p.slug))}</link>
    <guid isPermaLink="${base ? "true" : "false"}">${esc(base + postLink(p.slug))}</guid>${p.date && !isNaN(new Date(p.date).getTime()) ? `\n    <pubDate>${new Date(p.date).toUTCString()}</pubDate>` : ""}
    <description>${esc(excerpt(p))}</description>
  </item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${esc(name)}</title>
  <link>${esc(base + "/blog")}</link>
  <description>${esc(name)} — posts</description>
${items}
</channel></rss>`;
}

export async function postsRouter({ dir, themeDir }) {
  const express = (await import("express")).default;
  const { marked } = await import("marked");
  fs.mkdirSync(dir, { recursive: true });
  const getTheme = themeResolver(themeDir || dir); // same theme as pages (live in dev)
  const PER = Math.max(1, Number(process.env.POSTS_PER_PAGE) || 10);
  const render = async ({ title, content, meta = {} }) => {
    const m = { ...meta, title };
    const { layout } = await getTheme();
    return layout({ title, head: metaHead(m), content, meta: m });
  };
  const r = express.Router();

  r.get("/blog", async (req, res) => {
    const all = readPosts(dir);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const totalPages = Math.max(1, Math.ceil(all.length / PER));
    const slice = all.slice((page - 1) * PER, page * PER);
    const heading = process.env.SITE_NAME || "Blog";
    res.type("html").send(await render({ title: heading, meta: { description: heading + " — latest posts" }, content: renderList(slice, { heading, page, totalPages, baseUrl: "/blog" }) }));
  });

  r.get("/blog/:slug", async (req, res, next) => {
    if (!isSafeSlug(req.params.slug)) return next();
    const post = readPosts(dir).find((p) => p.slug === req.params.slug);
    if (!post) return next();
    const title = post.meta.title || post.slug;
    const autoLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      ...(post.date ? { datePublished: post.date } : {}),
      ...(post.meta.author ? { author: { "@type": "Person", name: post.meta.author } } : {}),
    });
    res.type("html").send(
      await render({
        title,
        meta: { ...post.meta, title, type: "article", jsonld: post.meta.jsonld || autoLd },
        content: renderPost(post, marked),
      }),
    );
  });

  r.get("/category/:name", async (req, res, next) => {
    if (!isSafeSlug(req.params.name)) return next();
    const list = readPosts(dir).filter((p) => slugify(p.meta.category) === req.params.name);
    if (!list.length) return next();
    res.type("html").send(await render({ title: "Category: " + req.params.name, content: renderList(list, { heading: "Category: " + req.params.name, baseUrl: "/category/" + req.params.name }) }));
  });

  r.get("/tag/:name", async (req, res, next) => {
    if (!isSafeSlug(req.params.name)) return next();
    const list = readPosts(dir).filter((p) => tagsOf(p.meta).some((t) => slugify(t) === req.params.name));
    if (!list.length) return next();
    res.type("html").send(await render({ title: "Tag: " + req.params.name, content: renderList(list, { heading: "Tag: " + req.params.name, baseUrl: "/tag/" + req.params.name }) }));
  });

  r.get("/feed.xml", (_req, res) => {
    res.type("application/rss+xml").send(feedXml(readPosts(dir)));
  });

  return r;
}
