# volt-static-host

The **shared multi-tenant static origin** for hosted Volt sites. One process
routes every request by **Host header** to `SITES_ROOT/<siteId>/` and serves that
site's compiled static content, with hard tenant isolation. **Zero runtime
dependencies** — `node:` builtins only.

This is the "one server, 300+ sites" half of the hosting architecture. It sits
**behind a CDN** (it emits cache headers and answers conditional GETs), and it
**does not serve media** — the compiled HTML references Spaces CDN URLs (from
`volt-image-host`), so this box stays light enough to pack hundreds of sites onto
a single droplet. Core Volt is untouched.

## Routing

| Host | Resolves to |
|---|---|
| `acme-blog.volthost.com` (`<tenant>.<BASE_DOMAIN>`) | site `acme-blog` |
| `volthost.com` (apex) | nothing (`404` — the marketing site lives elsewhere) |
| `www.acme.com` (custom domain) | `DOMAINS_MAP["www.acme.com"]` |

Custom domains come from a JSON map (`DOMAINS_MAP`), hot-reloadable with
`kill -HUP <pid>` — add a domain without dropping a connection.

## Serving

- Clean URLs: `/` → `index.html`; `/about` → `/about/index.html` or `/about.html`.
- Per-site `404.html` when present, else a plain 404.
- `Cache-Control` per type: HTML short + revalidate, content-hashed assets
  `immutable`, everything else an hour. `ETag`/`Last-Modified` + `304`.
- `GET`/`HEAD` only.

## Isolation & safety (the part that matters for multi-tenant)

- **siteId** must match `^[a-z0-9][a-z0-9-]{0,62}$` — a request can only ever
  address `SITES_ROOT/<that-site>/`.
- **Path confinement**: decode → normalize → reject `..`, NUL bytes, and dotfiles
  (except `.well-known`), then assert the resolved path is still inside the site
  root. Site A can never read site B's files (or the host's).
- No directory listings; unknown paths 404, they don't leak.

## Run

```bash
cp .env.example .env    # set SITES_ROOT + BASE_DOMAIN
npm start               # node 18+, no install needed
```

This process speaks plain HTTP on purpose — it's an origin behind a reverse proxy
(or CDN) that terminates TLS.

## Reverse proxy + TLS (`Caddyfile.example`)

`Caddyfile.example` fronts this service (and the control plane) and does all the
TLS in one binary — the wildcard cert for tenant subdomains *and* on-demand certs
for arbitrary custom domains (what nginx makes painful). Two DNS records feed it:
`*.voltsites.app A → box` (all tenants) and each customer's `CNAME → cname.voltsites.app`.

The clean part: **this service is also the on-demand-TLS gate.** Caddy asks
`GET /_tls-allow?domain=<host>` before issuing a cert, and we answer `200` only
for a host we actually serve — a known tenant subdomain, or a verified custom
domain in `DOMAINS_MAP` whose site directory exists. So a random domain pointed
at the box can't trigger cert issuance (which would burn Let's Encrypt rate
limits). Add a verified domain to `DOMAINS_MAP`, `kill -HUP` the process, and the
next request mints its cert automatically — no proxy restart.

```
GET /_tls-allow?domain=acme.voltsites.app   → 200   (known tenant, site exists)
GET /_tls-allow?domain=www.acme.com         → 200   (verified custom domain)
GET /_tls-allow?domain=random.evil.com      → 404   (Caddy refuses the cert)
```

## How content gets here

`SITES_ROOT/<siteId>/` is a site's **compiled static output** (HTML + CSS + JS +
local assets). Producing that from a Volt project (`pages/*.md` + `posts/*.md` +
theme → static HTML, images pushed to Spaces via `volt-image-host`) is the
**build/publish** step — a separate worker that runs on content change, not per
request. This server only serves what that step wrote.

## Why it unlocks density

A "site" here is a directory of static files — a few MB (media is in Spaces). One
process serves all of them, so RAM per site is ~0 and the ceiling is I/O, not a
process-per-site RAM wall. That's what makes 300+ sites on an 8 GB droplet real
(vs ~100 if each site ran its own Node process). See
`HOSTING-ARCHITECTURE.md` and `volt-image-host`'s README for the full table.
