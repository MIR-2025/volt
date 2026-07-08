// ids.js — random tokens + siteId slugs.

import crypto from "node:crypto";

export const token = (n = 24) => crypto.randomBytes(n).toString("base64url");

export function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "site";
}

// stable, unique siteId: slug, then slug-2, slug-3, … then a random suffix.
export function uniqueSiteId(base, taken) {
  if (!taken(base)) return base;
  for (let i = 2; i < 1000; i++) { const c = `${base}-${i}`; if (!taken(c)) return c; }
  return `${base}-${token(4).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}
