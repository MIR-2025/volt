// publish.js — write a crawled site to a static tree (clean-URL layout) under
// outDir. If an image client is supplied, images are pushed to Spaces
// (volt-image-host) and their references rewritten to the returned CDN URLs —
// so media never lands on the static-host droplet.

import fs from "node:fs";
import path from "node:path";

const IMG_EXT = /\.(png|jpe?g|webp|avif|gif)$/i; // svg/ico stay local (small UI chrome)

function safeRel(p) {
  const clean = path.posix.normalize("/" + String(p)).replace(/^\/+/, "");
  if (!clean || clean === ".." || clean.startsWith("../") || clean.includes("/../") || clean.includes("\0")) return null;
  return clean;
}

function writeAt(outDir, relPath, buf) {
  const rel = safeRel(relPath);
  if (!rel) return false;
  const full = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buf);
  return true;
}

// "/" → index.html ; "/about" or "/about/" → about/index.html ; "/x.html" kept
function pageDest(p) {
  if (p === "/" || p === "") return "index.html";
  const clean = p.replace(/^\/+/, "").replace(/\/+$/, "");
  return /\.html?$/i.test(clean) ? clean : clean + "/index.html";
}

export async function publishStatic({ pages, assets }, outDir, { images = null, log = () => {} } = {}) {
  fs.rmSync(outDir, { recursive: true, force: true }); // clean rebuild — no stale files
  fs.mkdirSync(outDir, { recursive: true });

  // assets first, so image pushes are known before pages are rewritten
  const rewrites = new Map(); // local path → CDN url
  let wroteAssets = 0, pushed = 0;
  for (const [p, a] of assets) {
    if (images && IMG_EXT.test(p)) {
      try {
        const url = await images.push(p, a.buf, a.contentType);
        if (url) { rewrites.set(p, url); pushed++; continue; } // don't write locally
      } catch (e) { log(`image push ${p} failed: ${e.message} — keeping local`); }
    }
    if (writeAt(outDir, p, a.buf)) wroteAssets++;
  }

  let wrotePages = 0;
  for (const [p, page] of pages) {
    let html = page.html;
    for (const [from, to] of rewrites) if (html.includes(from)) html = html.split(from).join(to);
    if (writeAt(outDir, pageDest(p), Buffer.from(html))) wrotePages++;
  }

  return { pages: wrotePages, assets: wroteAssets, imagesPushed: pushed };
}
