// crawl.js — fetch a running site and capture every same-origin HTML page plus
// each referenced asset. Source-agnostic: it crawls whatever HTTP server you
// point it at, so a booted Volt site is just one such server and core Volt stays
// a black box. Seeds from /sitemap.xml when present so orphan (unlinked) pages
// are still captured.

const REF_RE = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
const SRCSET_RE = /srcset\s*=\s*["']([^"']+)["']/gi;
const LOC_RE = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

const SKIP = /^(#|mailto:|tel:|javascript:|data:|blob:)/i;
const ASSET_EXT = /\.(css|js|mjs|map|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|json|webmanifest|txt|xml|pdf|mp4|webm|rss|atom)$/i;

function extractRefs(html) {
  const refs = new Set();
  let m;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(html))) refs.add(m[1]);
  SRCSET_RE.lastIndex = 0;
  while ((m = SRCSET_RE.exec(html))) {
    for (const part of m[1].split(",")) {
      const u = part.trim().split(/\s+/)[0];
      if (u) refs.add(u);
    }
  }
  return refs;
}

export async function crawl(baseUrl, { maxPages = 5000, log = () => {} } = {}) {
  const base = new URL(baseUrl);
  const norm = (p) => (p === "" ? "/" : p);
  const toPath = (ref, fromPath) => {
    if (SKIP.test(ref)) return null;
    let u;
    try { u = new URL(ref, new URL(fromPath, base)); } catch { return null; }
    if (u.origin !== base.origin) return null; // same-origin only
    return norm(u.pathname);
  };

  const seen = new Set();
  const queue = ["/"];
  const pages = new Map();
  const assetPaths = new Set();

  // seed unlinked pages from a sitemap, if the site publishes one
  try {
    const sm = await fetch(new URL("/sitemap.xml", base));
    if (sm.ok) {
      const xml = await sm.text();
      let m;
      LOC_RE.lastIndex = 0;
      while ((m = LOC_RE.exec(xml))) {
        const p = toPath(m[1], "/");
        if (p && !ASSET_EXT.test(p)) queue.push(p);
      }
      log(`seeded from sitemap.xml`);
    }
  } catch { /* no sitemap — crawl from / only */ }

  while (queue.length && pages.size < maxPages) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    seen.add(p);
    let res;
    try { res = await fetch(new URL(p, base)); } catch (e) { log(`skip ${p}: ${e.message}`); continue; }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html")) {
      pages.set(p, { status: res.status, html: await res.text() });
      for (const ref of extractRefs(pages.get(p).html)) {
        const rp = toPath(ref, p);
        if (!rp) continue;
        if (ASSET_EXT.test(rp)) assetPaths.add(rp);
        else if (!seen.has(rp)) queue.push(rp);
      }
    } else if (res.ok) {
      assetPaths.add(p); // a non-HTML route reached directly → capture as bytes
    }
  }

  const assets = new Map();
  for (const p of assetPaths) {
    try {
      const res = await fetch(new URL(p, base));
      if (!res.ok) continue;
      assets.set(p, { buf: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") || "" });
    } catch (e) { log(`asset skip ${p}: ${e.message}`); }
  }

  log(`crawled ${pages.size} page(s), ${assets.size} asset(s)`);
  return { pages, assets };
}
