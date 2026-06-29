// media.js — media uploads with a swappable storage driver: `local` (disk,
// served at /media) or `s3` (any S3-compatible store: AWS S3, DigitalOcean
// Spaces, etc.). POST /api/media is auth-gated; objects are stored under a
// random key and a public URL is returned. express/busboy/aws-sdk are imported
// lazily so the pure helpers below load without those deps installed.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// allowlist — raster images + PDF (no SVG: it can carry script). Extend via code.
const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "application/pdf": "pdf" };
export const extFor = (mime) => ALLOWED[mime] || null;
export const isAllowed = (mime) => !!ALLOWED[mime];
export const genKey = (mime) => `${crypto.randomBytes(10).toString("hex")}.${extFor(mime)}`;

function localDriver({ dir }) {
  fs.mkdirSync(dir, { recursive: true });
  return {
    name: "local",
    async put(key, buf) {
      fs.writeFileSync(path.join(dir, key), buf);
      return `/media/${key}`;
    },
  };
}

async function s3Driver(env) {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const endpoint = (env.S3_ENDPOINT || "").replace(/\/$/, "");
  const bucket = env.S3_BUCKET;
  const client = new S3Client({
    endpoint: endpoint || undefined,
    region: env.S3_REGION || "us-east-1",
    credentials: { accessKeyId: env.S3_KEY, secretAccessKey: env.S3_SECRET },
    forcePathStyle: true, // safest across S3-compatible endpoints (e.g. Spaces)
  });
  const base = (env.S3_PUBLIC_BASE || (endpoint ? `${endpoint}/${bucket}` : "")).replace(/\/$/, "");
  return {
    name: "s3",
    async put(key, buf, mime) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buf, ContentType: mime, ACL: "public-read" }));
      return `${base}/${key}`;
    },
  };
}

export async function mediaRouter({ requireAuth, dir, env = process.env }) {
  const express = (await import("express")).default;
  const busboy = (await import("busboy")).default;
  const driver = env.MEDIA_DRIVER === "s3" ? await s3Driver(env) : localDriver({ dir });
  const maxMb = Number(env.MEDIA_MAX_MB) || 10;
  const r = express.Router();

  if (driver.name === "local") r.use("/media", express.static(dir)); // public reads

  r.post("/api/media", requireAuth, (req, res) => {
    let bb;
    try {
      bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: maxMb * 1024 * 1024 } });
    } catch {
      return res.status(400).json({ ok: false, error: "bad upload" });
    }
    let done = false;
    const finish = (code, body) => {
      if (!done) {
        done = true;
        res.status(code).json(body);
      }
    };
    bb.on("file", (_name, stream, info) => {
      if (!isAllowed(info.mimeType)) {
        stream.resume();
        return finish(415, { ok: false, error: "unsupported file type" });
      }
      const chunks = [];
      let tooBig = false;
      stream.on("data", (c) => chunks.push(c));
      stream.on("limit", () => {
        tooBig = true;
        finish(413, { ok: false, error: `file exceeds ${maxMb}MB` });
      });
      stream.on("end", async () => {
        if (tooBig || done) return;
        try {
          const key = genKey(info.mimeType);
          const url = await driver.put(key, Buffer.concat(chunks), info.mimeType);
          finish(200, { ok: true, url, key, driver: driver.name });
        } catch (e) {
          finish(500, { ok: false, error: e.message });
        }
      });
    });
    bb.on("error", () => finish(500, { ok: false, error: "upload failed" }));
    bb.on("close", () => finish(400, { ok: false, error: "no file uploaded" }));
    req.pipe(bb);
  });

  return r;
}
