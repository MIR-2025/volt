# Media uploads

The `media` add-on handles uploads to local disk or any S3-compatible store (AWS S3, DigitalOcean Spaces). Uploads are signed-in only.

```
npm run dev -- --edit   # enable "media", choose local or s3
```

Upload from the browser to `POST /api/media` (multipart) and get back a public URL:

```
const fd = new FormData();
fd.append("file", input.files[0]);
const { url } = await (await fetch("/api/media", { method: "POST", body: fd })).json();
```

## Storage drivers

- **local** — written to `media/`, served by the app at `/media/<key>`. Good for dev and small sites. (For big files behind nginx, raise `client_max_body_size`.)
- **s3** — any S3-compatible endpoint: set `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_KEY`, `S3_SECRET` (and optional `S3_PUBLIC_BASE` for a CDN). Objects are stored public-read and served from your bucket/CDN — your server isn't in the serving path.

Uploads require a signed-in user (the add-on depends on auth), are capped by `MEDIA_MAX_MB` (default 10), and are limited to raster images and PDFs. SVG is rejected (it can carry script).
