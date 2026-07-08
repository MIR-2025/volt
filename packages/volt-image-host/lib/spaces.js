// spaces.js — a thin S3 client for DigitalOcean Spaces (S3-compatible object
// storage). One shared bucket holds every site's media, namespaced by a
// `sites/<siteId>/` key prefix. Public objects are served straight from the
// Spaces CDN, so the droplet never proxies image GETs — it only handles the
// (rare) upload/delete. That's what keeps a dense multi-tenant droplet cheap.

import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

export function makeSpaces(env = process.env) {
  const endpoint = String(env.SPACES_ENDPOINT || "").replace(/\/+$/, ""); // https://nyc3.digitaloceanspaces.com
  const bucket = String(env.SPACES_BUCKET || "");
  const cdn = String(env.SPACES_CDN || "").replace(/\/+$/, ""); // https://<bucket>.nyc3.cdn.digitaloceanspaces.com
  const region = String(env.SPACES_REGION || "us-east-1"); // Spaces ignores it but the SDK requires one
  if (!endpoint || !bucket || !env.SPACES_KEY || !env.SPACES_SECRET) {
    throw new Error("Spaces not configured — set SPACES_ENDPOINT, SPACES_BUCKET, SPACES_KEY, SPACES_SECRET (and ideally SPACES_CDN)");
  }
  const s3 = new S3Client({
    endpoint,
    region,
    forcePathStyle: false, // Spaces uses virtual-hosted-style
    credentials: { accessKeyId: env.SPACES_KEY, secretAccessKey: env.SPACES_SECRET },
  });

  // Public URL for a stored key — prefer the CDN, else virtual-hosted origin.
  const urlFor = (key) => (cdn ? `${cdn}/${key}` : `${endpoint.replace("https://", `https://${bucket}.`)}/${key}`);

  return {
    bucket,
    cdn,
    urlFor,

    async put(key, body, contentType) {
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: "public-read",
        // keys are content-hashed → the bytes at a key never change → cache forever
        CacheControl: "public, max-age=31536000, immutable",
      }));
      return key;
    },

    async del(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async list(prefix) {
      const out = [];
      let token;
      do {
        const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of r.Contents || []) out.push({ key: o.Key, size: o.Size || 0 });
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return out;
    },

    // Bytes + object count under a site's prefix — the basis for quota + metering.
    async usage(prefix) {
      const items = await this.list(prefix);
      return { bytes: items.reduce((n, i) => n + i.size, 0), count: items.length };
    },
  };
}
