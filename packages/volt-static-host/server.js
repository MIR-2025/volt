// server.js — volt-static-host. One process serves every hosted Volt site's
// compiled static content, routed by Host header, from SITES_ROOT/<siteId>/.
// Zero deps. Designed to sit behind a CDN (it sets cache headers and answers
// conditional GETs). Media is NOT served here — the compiled HTML references
// Spaces CDN URLs (see volt-image-host), so this box stays light enough to pack
// hundreds of sites onto one droplet.

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { resolveSite, safeJoin, contentType, isHashed } from "./lib/serve.js";

const env = process.env;
const PORT = Number(env.PORT || 26708);
const SITES_ROOT = path.resolve(env.SITES_ROOT || "./sites");
const BASE_DOMAIN = String(env.BASE_DOMAIN || "").toLowerCase(); // e.g. vsites.app

// custom-domain → siteId map, hot-reloadable on SIGHUP (add a domain, no restart)
let DOMAINS = {};
function loadDomains() {
  if (!env.DOMAINS_MAP) return;
  try {
    DOMAINS = JSON.parse(fs.readFileSync(env.DOMAINS_MAP, "utf8"));
  } catch (e) {
    console.warn("domains map:", e.message);
  }
}
loadDomains();
process.on("SIGHUP", () => { loadDomains(); console.log(`reloaded domains map (${Object.keys(DOMAINS).length})`); });

const HTML_CACHE = env.HTML_CACHE || "public, max-age=60, must-revalidate";
const ASSET_CACHE = env.ASSET_CACHE || "public, max-age=31536000, immutable";
const OTHER_CACHE = env.OTHER_CACHE || "public, max-age=3600";

const statOrNull = async (p) => { try { return await fsp.stat(p); } catch { return null; } };

// resolve a URL path to a real file within the site root, with clean-URL fallbacks
async function pickFile(root, urlPath) {
  const base = safeJoin(root, urlPath);
  if (!base) return null;
  const st = await statOrNull(base);
  if (st?.isFile()) return base;
  if (st?.isDirectory()) {
    const idx = path.join(base, "index.html");
    return (await statOrNull(idx))?.isFile() ? idx : null;
  }
  const asHtml = base + ".html"; // /about → /about.html
  if ((await statOrNull(asHtml))?.isFile()) return asHtml;
  const asIdx = path.join(base, "index.html"); // /about → /about/index.html
  if ((await statOrNull(asIdx))?.isFile()) return asIdx;
  return null;
}

const server = http.createServer(async (req, res) => {
  const head = req.method === "HEAD";
  const plain = (code, text, extra = {}) => {
    res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", ...extra });
    res.end(head ? undefined : text);
  };

  try {
    if (req.url === "/_health") return plain(200, "ok");
    // Caddy on-demand-TLS gate: Caddy asks "?domain=<host>" before issuing a cert.
    // Answer 200 only for a host we actually serve, so a random domain pointed at us
    // can't trigger cert issuance (and exhaust Let's Encrypt rate limits).
    if (req.url.startsWith("/_tls-allow")) {
      const domain = (new URL(req.url, "http://x").searchParams.get("domain") || "").toLowerCase();
      const sid = resolveSite(domain, { base: BASE_DOMAIN, domains: DOMAINS });
      const okHost = sid && (await statOrNull(path.join(SITES_ROOT, sid)))?.isDirectory();
      return plain(okHost ? 200 : 404, okHost ? "ok" : "unknown host");
    }
    if (req.method !== "GET" && !head) return plain(405, "method not allowed", { Allow: "GET, HEAD" });

    const siteId = resolveSite(req.headers.host, { base: BASE_DOMAIN, domains: DOMAINS });
    if (!siteId) return plain(404, "no site for this host");

    const root = path.join(SITES_ROOT, siteId);
    if (!(await statOrNull(root))?.isDirectory()) return plain(404, "site not found");

    const file = await pickFile(root, req.url || "/");
    if (!file) {
      const custom = path.join(root, "404.html");
      if ((await statOrNull(custom))?.isFile()) {
        const body = await fsp.readFile(custom);
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": HTML_CACHE });
        return res.end(head ? undefined : body);
      }
      return plain(404, "not found");
    }

    const st = await statOrNull(file);
    const etag = `W/"${st.size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"`;
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ETag: etag, "Cache-Control": /\.html$/i.test(file) ? HTML_CACHE : ASSET_CACHE });
      return res.end();
    }

    const ext = path.extname(file).slice(1).toLowerCase();
    const cache = ext === "html" ? HTML_CACHE : isHashed(path.basename(file)) ? ASSET_CACHE : OTHER_CACHE;
    res.writeHead(200, {
      "Content-Type": contentType(file),
      "Content-Length": st.size,
      "Cache-Control": cache,
      "Last-Modified": st.mtime.toUTCString(),
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    });
    if (head) return res.end();
    fs.createReadStream(file)
      .on("error", () => { if (!res.headersSent) res.writeHead(500); res.end(); })
      .pipe(res);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(head ? undefined : "server error");
    console.warn("serve error:", e.message);
  }
});

server.listen(PORT, () => console.log(`volt-static-host on :${PORT} — root ${SITES_ROOT}, base *.${BASE_DOMAIN || "(none)"}, ${Object.keys(DOMAINS).length} custom domain(s)`));
