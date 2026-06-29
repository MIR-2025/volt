// import-wxr.js — import a WordPress export (WXR XML) into Volt markdown pages.
// Zero-dep: WXR is a consistent, machine-generated format, so a focused parser
// is more honest than pulling a general XML library. Pure functions (parseWXR,
// toMarkdown, runImport) so they're unit-testable; file I/O lives in the CLI.

const unCdata = (s) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");

const decode = (s) =>
  String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

const tagOf = (block, name) => {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? unCdata(m[1]).trim() : "";
};

const catsOf = (block, domain) =>
  [...block.matchAll(new RegExp(`<category domain="${domain}"[^>]*>([\\s\\S]*?)</category>`, "g"))].map((m) => decode(unCdata(m[1]).trim())).filter(Boolean);

// Parse a WXR document into raw items.
export function parseWXR(xml) {
  const items = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    items.push({
      type: tagOf(b, "wp:post_type") || "post",
      title: decode(tagOf(b, "title")),
      slug: tagOf(b, "wp:post_name"),
      status: tagOf(b, "wp:status") || "publish",
      date: tagOf(b, "wp:post_date") || tagOf(b, "pubDate"),
      content: unCdata((b.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/) || [, ""])[1]).trim(),
      categories: catsOf(b, "category"),
      tags: catsOf(b, "post_tag"),
    });
  }
  return items;
}

export const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "page";

// WP content is HTML (often with Gutenberg block comments). Strip the block
// comments; the rest is valid HTML that the pages add-on's `marked` passes
// through. Pages are author-trusted files.
const cleanBody = (html) =>
  String(html)
    .replace(/<!--\s*\/?wp:[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// Render one item to a markdown file body (front-matter + content).
export function toMarkdown(item) {
  const fm = ["---", `title: ${String(item.title || "Untitled").replace(/[\r\n]+/g, " ").trim()}`];
  if (item.date) fm.push(`date: ${item.date}`);
  if (item.tags && item.tags.length) fm.push(`tags: ${item.tags.join(", ")}`);
  fm.push("---", "");
  return fm.join("\n") + cleanBody(item.content) + "\n";
}

// Map a WP REST API object (?_embed=1) into the same item shape as parseWXR.
function mapREST(p, type) {
  const flat = ((p._embedded && p._embedded["wp:term"]) || []).flat();
  const byTax = (tax) => flat.filter((t) => t && t.taxonomy === tax).map((t) => decode(t.name)).filter(Boolean);
  return {
    type,
    title: decode((p.title && p.title.rendered) || p.slug || "Untitled"),
    slug: p.slug || "",
    status: p.status || "publish",
    date: String(p.date || "").replace("T", " ").replace(/\.\d+$/, ""),
    content: (p.content && p.content.rendered) || "",
    categories: byTax("category"),
    tags: byTax("post_tag"),
  };
}

// Fetch posts + pages from a live WordPress site over the REST API. Credentials
// (Application Password) are only needed for non-published content. fetchImpl is
// injectable for testing.
export async function fetchWP(baseUrl, { user, appPassword, drafts = false, fetchImpl = fetch } = {}) {
  const base = String(baseUrl).replace(/\/+$/, "");
  const headers = { Accept: "application/json" };
  if (user && appPassword) headers.Authorization = "Basic " + Buffer.from(`${user}:${appPassword}`).toString("base64");
  const statuses = drafts ? "publish,draft,pending,private,future" : "publish";
  const items = [];
  for (const [kind, type] of [["posts", "post"], ["pages", "page"]]) {
    let page = 1;
    let totalPages = 1;
    do {
      const url = `${base}/wp-json/wp/v2/${kind}?per_page=100&page=${page}&status=${statuses}&_embed=1`;
      const res = await fetchImpl(url, { headers });
      if (res.status === 400 && page > 1) break; // WP 400s past the last page
      if (res.status === 401 || res.status === 403) throw new Error(`WP REST ${kind}: ${res.status} — credentials needed/insufficient for status=${statuses}`);
      if (!res.ok) throw new Error(`WP REST ${kind} page ${page}: ${res.status} ${res.statusText || ""}`.trim());
      totalPages = Number(res.headers && res.headers.get && res.headers.get("X-WP-TotalPages")) || 1;
      const arr = await res.json();
      if (!Array.isArray(arr) || arr.length === 0) break;
      for (const p of arr) items.push(mapREST(p, type));
      page++;
    } while (page <= totalPages);
  }
  return items;
}

// Select + transform raw items into importable markdown pages. Returns { imported, stats }.
export function transform(all, { types = ["page", "post"], drafts = false } = {}) {
  const stats = { total: all.length, byType: {}, draftsSkipped: 0, otherTypeSkipped: 0 };
  for (const i of all) stats.byType[i.type] = (stats.byType[i.type] || 0) + 1;

  const used = new Set();
  const imported = [];
  for (const i of all) {
    if (!types.includes(i.type)) {
      stats.otherTypeSkipped++;
      continue;
    }
    if (i.status !== "publish" && !drafts) {
      stats.draftsSkipped++;
      continue;
    }
    let slug = i.slug && /^[a-z0-9][a-z0-9-]*$/i.test(i.slug) ? i.slug.toLowerCase() : slugify(i.title || i.slug);
    let s = slug;
    for (let n = 2; used.has(s); n++) s = `${slug}-${n}`;
    used.add(s);
    imported.push({ slug: s, type: i.type, title: i.title, filename: `${s}.md`, markdown: toMarkdown(i) });
  }
  return { imported, stats };
}

// Import from a WXR export string (offline file path).
export function runImport(xml, opts = {}) {
  return transform(parseWXR(xml), opts);
}

// Import from a live WordPress site over the REST API.
export async function runImportFromWP(baseUrl, opts = {}) {
  return transform(await fetchWP(baseUrl, opts), opts);
}
