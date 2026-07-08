// server.js — volt-image-host. A standalone HTTP service that Volt sites call to
// store/serve images from a shared DO Spaces bucket. Core Volt is untouched: a
// site's editor POSTs an image here and gets back a CDN URL to drop into content.
//
//   POST   /sites/:siteId/images          raw image body → optimize → Spaces → { url }
//   DELETE /sites/:siteId/images/:key     remove one object
//   GET    /usage/:siteId                 bytes used vs quota (metering)
//   GET    /health
//
// Image GETs never touch this service — they're served by the Spaces CDN.

import express from "express";
import crypto from "node:crypto";
import { makeSpaces } from "./lib/spaces.js";
import { optimize, isImage } from "./lib/optimize.js";

const env = process.env;
const PORT = Number(env.PORT || 26707);
const spaces = makeSpaces(env);

// Allocated quota per site. Real usage on a 1 GB tier runs ~200 MB, so the
// allocation is a safe overcommit — you size storage to *actual* use, not the cap.
const QUOTA_BYTES = Number(env.SITE_QUOTA_BYTES || 1024 * 1024 * 1024); // 1 GB
const MAX_UPLOAD = Number(env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024); // 25 MB/file — no video dumps
const FORMAT = env.IMAGE_FORMAT === "avif" ? "avif" : "webp";
const QUALITY = Number(env.IMAGE_QUALITY || 80);

// Auth: a shared ADMIN_TOKEN, and/or per-site bearer keys from SITE_KEYS="siteA:keyA,siteB:keyB".
const ADMIN_TOKEN = String(env.ADMIN_TOKEN || "").trim();
const SITE_KEYS = new Map(
  String(env.SITE_KEYS || "").split(",").map((s) => s.trim()).filter(Boolean).map((p) => {
    const i = p.indexOf(":");
    return [p.slice(0, i), p.slice(i + 1)];
  }),
);

const app = express();
app.disable("x-powered-by");

const bearer = (req) => String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
const safeSite = (s) => /^[a-z0-9][a-z0-9-]{0,62}$/i.test(s || "");
function authed(req, siteId) {
  const tok = bearer(req);
  if (!tok) return false;
  if (ADMIN_TOKEN && tok === ADMIN_TOKEN) return true;
  const k = SITE_KEYS.get(siteId);
  return !!k && tok === k;
}

app.get("/health", (_req, res) => res.json({ ok: true, bucket: spaces.bucket }));

app.get("/usage/:siteId", async (req, res) => {
  const { siteId } = req.params;
  if (!safeSite(siteId)) return res.status(400).json({ ok: false, error: "bad siteId" });
  if (!authed(req, siteId)) return res.status(401).json({ ok: false, error: "unauthorized" });
  try {
    const u = await spaces.usage(`sites/${siteId}/`);
    res.json({ ok: true, siteId, bytes: u.bytes, count: u.count, quota: QUOTA_BYTES, pct: Math.round((u.bytes / QUOTA_BYTES) * 100) });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.post("/sites/:siteId/images", express.raw({ type: () => true, limit: MAX_UPLOAD }), async (req, res) => {
  const { siteId } = req.params;
  if (!safeSite(siteId)) return res.status(400).json({ ok: false, error: "bad siteId" });
  if (!authed(req, siteId)) return res.status(401).json({ ok: false, error: "unauthorized" });
  if (!isImage(req.headers["content-type"])) return res.status(415).json({ ok: false, error: "not an image (jpeg/png/webp/avif/gif/tiff/bmp)" });
  if (!req.body || !req.body.length) return res.status(400).json({ ok: false, error: "empty body" });

  try {
    // quota check before doing work
    const used = (await spaces.usage(`sites/${siteId}/`)).bytes;
    if (used >= QUOTA_BYTES) return res.status(507).json({ ok: false, error: "quota exceeded", used, quota: QUOTA_BYTES });

    let opt;
    try {
      opt = await optimize(req.body, { format: FORMAT, quality: QUALITY });
    } catch (e) {
      return res.status(422).json({ ok: false, error: "could not process image: " + e.message });
    }
    if (used + opt.bytes > QUOTA_BYTES) return res.status(507).json({ ok: false, error: "would exceed quota", used, adding: opt.bytes, quota: QUOTA_BYTES });

    const hash = crypto.createHash("sha256").update(opt.data).digest("hex").slice(0, 16);
    const key = `sites/${siteId}/${hash}.${opt.format}`;
    await spaces.put(key, opt.data, opt.contentType);
    res.json({ ok: true, url: spaces.urlFor(key), key: `${hash}.${opt.format}`, width: opt.width, height: opt.height, bytes: opt.bytes, format: opt.format });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.delete("/sites/:siteId/images/:key", async (req, res) => {
  const { siteId, key } = req.params;
  if (!safeSite(siteId)) return res.status(400).json({ ok: false, error: "bad siteId" });
  if (!authed(req, siteId)) return res.status(401).json({ ok: false, error: "unauthorized" });
  if (!/^[a-f0-9]{16}\.(webp|avif)$/i.test(key)) return res.status(400).json({ ok: false, error: "bad key" });
  try {
    await spaces.del(`sites/${siteId}/${key}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Payloads over the per-file cap arrive here as a 413 from express.raw.
app.use((err, _req, res, _next) => {
  if (err && err.type === "entity.too.large") return res.status(413).json({ ok: false, error: `file too large (max ${Math.round(MAX_UPLOAD / 1048576)} MB)` });
  res.status(500).json({ ok: false, error: err?.message || "error" });
});

app.listen(PORT, () => console.log(`volt-image-host on :${PORT} → Spaces bucket "${spaces.bucket}" (quota ${Math.round(QUOTA_BYTES / 1048576)} MB/site, ${FORMAT} @ q${QUALITY})`));
