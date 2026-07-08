// serve.js — the pure, testable core of the static host: hostname → siteId,
// safe path confinement, and content types. No I/O here, so it's unit-testable
// without a running server (and these are the security-critical bits).

import path from "node:path";

export const safeSite = (s) => /^[a-z0-9][a-z0-9-]{0,62}$/i.test(s || "");

// Map an incoming Host header to a siteId.
//   <tenant>.<base>      → tenant           (single label only)
//   <base> (apex)        → null             (the marketing/landing site, handled elsewhere)
//   a custom domain      → domains[host]    (from the DOMAINS_MAP file)
export function resolveSite(host, { base = "", domains = {} } = {}) {
  if (!host) return null;
  host = String(host).toLowerCase().split(":")[0].replace(/\.$/, ""); // strip port + trailing dot
  const b = String(base || "").toLowerCase().replace(/^\./, "");
  if (b && host.endsWith("." + b)) {
    const sub = host.slice(0, host.length - b.length - 1); // strip ".<base>"
    return safeSite(sub) ? sub : null; // safeSite rejects dots → multi-label subdomains don't resolve
  }
  if (b && host === b) return null; // apex → no tenant
  const mapped = domains[host];
  return safeSite(mapped) ? mapped : null;
}

// Confine a request path to a site root. Returns an absolute path inside `root`,
// or null on traversal / NUL / dotfile (except .well-known) / bad input.
export function safeJoin(root, urlPath) {
  let p;
  try {
    p = decodeURIComponent(String(urlPath).split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  if (p.includes("\0")) return null;
  p = path.posix.normalize(p.replace(/\\/g, "/"));
  const rel = p.replace(/^\/+/, "");
  if (rel === ".." || rel.startsWith("../") || rel.includes("/../")) return null;
  // block dotfiles (.env, .git, …) but allow .well-known
  if (rel.split("/").some((seg) => seg.startsWith(".") && seg !== ".well-known")) return null;
  const rootAbs = path.resolve(root);
  const full = path.resolve(rootAbs, rel);
  if (full !== rootAbs && !full.startsWith(rootAbs + path.sep)) return null; // escaped the root
  return full;
}

const TYPES = {
  html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8", map: "application/json; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  avif: "image/avif", gif: "image/gif", ico: "image/x-icon", txt: "text/plain; charset=utf-8",
  xml: "application/xml", webmanifest: "application/manifest+json", pdf: "application/pdf",
  woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf",
  mp4: "video/mp4", webm: "video/webm", atom: "application/atom+xml", rss: "application/rss+xml",
};
export function contentType(fileOrExt) {
  const ext = String(fileOrExt).split(".").pop().toLowerCase();
  return TYPES[ext] || "application/octet-stream";
}

// A content-hashed asset name (app.9f8a1c2b.js) → safe to cache immutably.
export const isHashed = (f) => /\.[0-9a-f]{8,}\.[a-z0-9]+$/i.test(f);
