# volt-image-host

A standalone host-side image service for hosted Volt sites. It **optimizes**
(webp/AVIF via sharp), **stores**, and **serves** images from **one shared
DigitalOcean Spaces bucket**, namespaced per site, with per-site quotas.

**It does not touch core Volt.** A site's editor `POST`s an image here and gets
back a CDN URL to drop into content — that's the whole integration. Volt already
references image URLs in markdown; hosted, those URLs just point at Spaces
instead of `public/media/`.

Why it exists: it moves media **off the droplet**. Image bytes live in Spaces and
are served by the Spaces CDN, so the droplet only handles the (rare) upload — the
single most important move for packing many sites onto one small box (see
[Density](#why-this-changes-the-density-math) below).

## Setup

1. In the DO console: create a **Space** (bucket), enable its **CDN**, and make a
   pair of **Spaces access keys**.
2. `cp .env.example .env` and fill in `SPACES_*`, `ADMIN_TOKEN`, and quotas.
3. `npm install && npm start` (needs Node 18+; `sharp` pulls a prebuilt binary).

## API

All write/read-usage routes require `Authorization: Bearer <token>` — either the
shared `ADMIN_TOKEN` or the site's key from `SITE_KEYS`.

| Method | Route | Body | Returns |
|---|---|---|---|
| `POST` | `/sites/:siteId/images` | raw image bytes (`Content-Type: image/*`) | `{ ok, url, key, width, height, bytes, format }` |
| `DELETE` | `/sites/:siteId/images/:key` | — | `{ ok }` |
| `GET` | `/usage/:siteId` | — | `{ ok, bytes, count, quota, pct }` |
| `GET` | `/health` | — | `{ ok, bucket }` |

Image **GETs are not served here** — the returned `url` is a Spaces CDN URL, so
delivery costs you CDN bandwidth, not droplet CPU.

```bash
# upload (optimizes → webp, stores in the shared bucket under sites/acme-blog/)
curl -X POST http://localhost:26707/sites/acme-blog/images \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: image/jpeg" --data-binary @photo.jpg
# → { "ok": true, "url": "https://volt-media.nyc3.cdn.digitaloceanspaces.com/sites/acme-blog/1a2b….webp", ... }
```

### Guardrails (from the hosting economics)

- **Quota** — allocated per site (`SITE_QUOTA_BYTES`, default 1 GB). Checked
  before every write; over-quota returns `507`. Allocated ≫ real use (~200 MB),
  which is a deliberate, safe overcommit.
- **Per-file cap** — `MAX_UPLOAD_BYTES` (default 25 MB) rejects video dumps at
  the HTTP layer (`413`).
- **Optimize-on-upload** — one webp/AVIF output, EXIF stripped, longest edge
  capped (`IMAGE_MAX_DIM`). Stretches the quota 3–5× and speeds every site.
- **Content-hashed keys** — deduped, cached `immutable` forever on the CDN.

## How a Volt site uses it (no core change)

The site's admin/editor sends the uploaded file here and writes the returned
`url` into content. That's it — Volt renders the URL like any other image. An
optional thin Volt add-on could point the web-admin's media upload at this
service, but the service itself is fully decoupled and framework-agnostic.

## Why this changes the density math

With media in Spaces, a "site" on the droplet is just its content (markdown) +
a small DB — a few MB. The droplet's disk stops being the constraint:

| Resource | Per site | 300 sites | 8 GB / 160 GB droplet | |
|---|---|---|---|---|
| Droplet disk (content + DB; **images in Spaces**) | ~10–20 MB | ~6 GB | ~145 GB usable | ✅ trivial |
| Spaces (images) | ~200 MB actual | ~60 GB | 250 GB on the $5 base | ✅ fine |
| RAM — **one Node process per site** | ~60 MB | ~18 GB | 8 GB | ❌ OOM (~100 max) |
| RAM — **static serve + shared runtime** | ~0 | ~0 | 8 GB | ✅ 300+ easy |

So 2–300 sites per droplet is safe **as long as you don't pin a Node process per
site** — serve each site's compiled static content from one shared server (or a
small pool) and let Spaces hold the media. Storage was never the wall; a process
per site is. Pair this service with static serving and the wall is gone.

> Caveats for dense packing: one droplet is a single point of failure (back up +
> be able to rebuild from Spaces + git), watch noisy-neighbor traffic, and keep
> the quota/file-type caps on to bound abuse.

## Future extensions

- **Responsive variants** — emit a few widths on upload for `srcset`.
- **On-the-fly transforms** — front with `imgproxy` if you want arbitrary
  resize-on-request instead of fixed variants.
- **Metering hooks** — `/usage` already returns bytes; wire it to billing.
