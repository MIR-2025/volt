# volt-publish

The **build/publish worker** — the third core hosting service. It turns a Volt
project into the static tree that `volt-static-host` serves, pushing images to
Spaces (`volt-image-host`) along the way. **Zero runtime deps.**

**It treats core Volt as a black box.** Rather than re-implement Volt's rendering
(and drift from it), it boots the site and **crawls it** — capturing the exact
HTML a visitor gets, plus every referenced asset — then writes that as static
files. So it always matches the live output, and core Volt is never touched.

```
   Volt project (pages/*.md, posts/*.md, theme, .env)
                     │
        ┌────────────▼────────────┐
        │  volt-publish            │  boot → crawl → capture HTML + assets
        │                          │  images → volt-image-host → Spaces (rewrite)
        └────────────┬────────────┘
                     ▼
        SITES_ROOT/<siteId>/        ← static tree, served by volt-static-host
        ├─ index.html               (behind a CDN)
        ├─ about/index.html
        ├─ _theme.css, style.css, fonts/…
        └─ (images live in Spaces, referenced by CDN URL)
```

## Use

```bash
# boot a project, crawl it, write the static tree
volt-publish ./my-site --site acme-blog --out /srv/volt-sites

# or crawl an already-running instance (CI / when it's already up)
volt-publish --url http://127.0.0.1:8080 --site acme-blog --out /srv/volt-sites
```

Push images to Spaces (else they're bundled locally):

```bash
IMAGE_HOST_URL=http://127.0.0.1:26707 IMAGE_HOST_TOKEN=… \
  volt-publish ./my-site --site acme-blog --out /srv/volt-sites
```

## What it does

1. **Boot** (project mode) — `node server.js` on an ephemeral port, waits until it
   answers. (The project needs its `.env` so Volt runs the app, not the config
   wizard.)
2. **Crawl** — BFS from `/`, following same-origin links; seeds from
   `/sitemap.xml` too so unlinked pages aren't missed. Captures each HTML page and
   every referenced asset (CSS, JS, `/_theme.css`, fonts, images).
3. **Publish** — writes a clean-URL tree (`/about` → `about/index.html`) into
   `SITES_ROOT/<siteId>/` (a clean rebuild — no stale files). Path-confined; can't
   escape the output dir.
4. **Images → Spaces** — when `IMAGE_HOST_URL`/`_TOKEN` are set, each raster image
   is pushed to `volt-image-host` (which optimizes → webp and returns a CDN URL),
   and every reference in the HTML is rewritten to that URL. Images then never
   touch the static-host droplet. Without those vars, images are bundled locally.

## The full hosting loop

| Service | Role |
|---|---|
| **volt-publish** (this) | Volt project → static tree + images to Spaces |
| **volt-static-host** | serves `SITES_ROOT/<siteId>/` by hostname, behind a CDN |
| **volt-image-host** | stores/optimizes/serves images from a shared Spaces bucket |

Publish runs **on content change** (an edit in the web admin, a git push, a
migration) — not per request. That's what keeps the serving path static and
cheap.

## Notes / limits

- Captures **static-renderable** routes (content pages/posts). Genuinely dynamic
  routes (admin, form handlers, DB-backed views) belong on the separate
  scale-to-zero dynamic layer, not in the static tree.
- A page only gets captured if it's reachable from `/`, the nav, or `/sitemap.xml`.
