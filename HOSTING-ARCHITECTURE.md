# VoltJS hosted platform — architecture + unit economics (sketch)

> **Status:** back-of-envelope, 2026-07-07. Numbers are order-of-magnitude with
> stated assumptions — *the assumptions drive everything*, so flex them, don't
> trust the totals to two digits. All provider rates are approximate; verify
> before committing. Companion to `memory/hosted-voltjs-opportunity.md` and
> `ADOPTION.md`.

---

## 0. The one-sentence thesis

A hosted Volt front door is viable **only if an idle free site costs fractions
of a cent per month** — which means never running a per-site Node process, and
instead compiling each site to **static content on a zero-egress CDN** with a
**shared, scale-to-zero dynamic layer** behind it. Volt's markdown-and-files
content model makes that compile natural; that's the unlock.

And the original worry — *"would this overwhelm DigitalOcean?"* — answers itself
once you see the architecture: **the millions of free sites live on the edge
(no per-site process), and DO only carries the paid-dedicated tier plus the
control plane — thousands of revenue-positive droplets, never millions of idle
ones.** DO scales with *revenue*, not with free-site count.

---

## 1. The core problem

Today a Volt site is a **persistent Node process** (express + socket.io, ~60 MB
idle). Perfect for self-hosting; fatal for a free multi-tenant fleet — one
process per site means ~200 sites per 16 GB box, so 1 M sites ≈ 5,000 always-on
boxes ≈ **$0.30–0.50/site/mo** for sites that are idle 99.9 % of the time. That
doesn't overwhelm DO's capacity; it overwhelms *your bank account*.

The fix is the same two moves every host that reached millions made
(WordPress.com, Vercel, Netlify, Cloudflare Pages):

1. **Serve content as static** — a GET for a blog post shouldn't wake a process.
2. **Scale the dynamic bits to zero** — admin, forms, DB writes run only when hit.

---

## 2. Architecture — mostly-static + scale-to-zero

```
                   ┌─────────── visitor GET (95%+ of all traffic) ──────────┐
                   ▼                                                         │
  ┌─────────┐   ┌────────────┐   ┌────────────────────┐                     │
  │ visitor │──▶│ CDN (edge) │──▶│ object storage      │  static HTML/CSS/  │
  └────┬────┘   │ cache      │   │ (R2 / Spaces)       │  JS / img / fonts   │
       │        └────────────┘   └────────────────────┘  ~$0 compute        │
       │ login / form POST / dynamic API  (rare)                            │
       ▼                                                                    │
  ┌──────────────────────┐   ┌──────────────┐                              │
  │ dynamic layer         │──▶│ data          │  SQLite/D1/Turso (free)     │
  │ scale-to-zero fn /     │   │               │  managed Postgres (paid)   │
  │ container: admin,       │   └──────────────┘                            │
  │ forms, dynamic routes   │                                               │
  └──────────┬────────────┘                                                 │
             │ on content change → trigger rebuild                          │
             ▼                                                              │
  ┌──────────────────────┐                                                 │
  │ build / publish worker│──────────── writes a new static bundle ────────┘
  │ md→HTML, image optim   │              (then purge CDN)
  └──────────────────────┘

  control plane (always-on, shared): signup · billing (Stripe) · provisioning ·
  quotas & metering · abuse · custom-domain TLS (Cloudflare for SaaS)
```

**Six layers:**

| Layer | Does | Scales to zero? |
|---|---|---|
| **Publish/build** | md → HTML, optimize images (sharp/webp/AVIF), emit a static bundle → object storage. Runs *per edit*, not per request. | Yes (burst on edits) |
| **Static serving (edge)** | CDN in front of object storage. 95 %+ of traffic. No compute. | N/A (edge) |
| **Dynamic (scale-to-zero)** | Web admin, forms, comments, dynamic API, DB writes. Idle almost always. | Yes |
| **Data** | Free/small: SQLite-as-a-service (D1/Turso — built for one-DB-per-tenant at scale). Paid/big: managed Postgres. | Mostly |
| **Domains + TLS** | Subdomains (wildcard cert, trivial). Custom domains via on-demand TLS (Caddy) or Cloudflare-for-SaaS. | N/A |
| **Control plane** | Signup, billing, provisioning, quota metering, abuse. The one always-on fleet. | No (amortized) |

**Two request paths, and only one of them costs money:** a content GET is a
static edge hit (~free); everything else (login, form, edit) is a rare
scale-to-zero invocation. That asymmetry is the whole business model.

---

## 3. Where each layer runs — the DO vs Cloudflare vs Fly call

| Layer | Best fit | Why |
|---|---|---|
| Static serving + storage | **Cloudflare R2 + CDN** | **$0 egress** — the single biggest cost lever for a free tier |
| Free-tier data | **Cloudflare D1 / Turso** | designed for millions of tiny per-tenant DBs |
| Dynamic scale-to-zero | **Fly Machines** or Cloudflare Workers/Containers | true wake-on-request, sub-second, bill per use |
| Custom-domain TLS | **Cloudflare for SaaS** | automated cert issuance for many custom hostnames |
| **Paid-dedicated sites** | **DigitalOcean** droplet + Managed Postgres + Spaces | a real site wanting real resources — consumption DO loves |
| Control plane + build fleet | **DO droplets** | cheap, predictable compute for always-on services |

**It's a hybrid, not "all DO."** Cloudflare carries the free/edge tier (near-zero
marginal); DO carries the paid-dedicated tier and the control-plane/build
compute. That's exactly how DO benefits without being asked to hold millions of
idle processes.

---

## 4. Unit economics

### 4a. Assumptions (a typical free site)

| Input | Value | Note |
|---|---|---|
| Storage | ~100 MB | content is a few MB; rest is *optimized* images (webp/AVIF). Cap 1 GB. |
| Egress | ~5 GB/mo | a few thousand pageviews × ~1–2 MB/page. Many sites far less. |
| Dynamic invocations | ~10 K/mo | occasional admin edits + a few form posts; sub-second each |
| DB | tiny | a few MB, few queries |
| Rebuilds | a few/mo | on content edits |

### 4b. Marginal cost of one free site — the near-zero result

| Line | Cloudflare stack | DO Spaces stack |
|---|---|---|
| Storage (0.1 GB) | 0.1 × $0.015 = **$0.0015** | 0.1 × $0.02 = **$0.002** |
| Egress (5 GB) | **$0** (R2 free egress) | 5 × $0.01 = **$0.05** |
| Requests/compute | ~**$0.004** | ~**$0.004** |
| DB (D1/Turso free tier) | ~**$0** | ~**$0** |
| **Marginal / free site** | **≈ $0.005–0.01/mo** | **≈ $0.05/mo** |

**The CDN choice is a 5–10× swing on the free tier**, entirely because of
egress. This is *the* architectural decision: free-tier static on Cloudflare/R2,
not on DO. (DO's value is the paid tier, where the customer pays for the pipe.)

### 4c. Fixed platform cost (the part that never scales to zero)

Control-plane API (HA), admin backend, build-worker pool, control-plane
Postgres, monitoring, Cloudflare plan(s). Grows *sub-linearly* with sites:

| Sites | Fixed platform / mo (est.) |
|---|---|
| 10 K | ~$1,500 |
| 100 K | ~$9,000 |
| 1 M | ~$45,000 |

### 4d. Blended cost & a P&L sketch

Assume **3 % free→paid conversion @ $12/mo** ARPU, paid-site marginal ~$2/mo
(more generous shared resources + metered video pass-through):

| | 10 K sites | 100 K sites | 1 M sites |
|---|---|---|---|
| Free-site cost | 9.7 K × $0.01 = **$97** | 97 K × $0.01 = **$970** | 970 K × $0.01 = **$9,700** |
| Paid-site cost | 300 × $2 = **$600** | 3 K × $2 = **$6,000** | 30 K × $2 = **$60,000** |
| Fixed platform | **$1,500** | **$9,000** | **$45,000** |
| **Total infra cost** | **~$2,200/mo** | **~$16,000/mo** | **~$115,000/mo** |
| Revenue (paid × $12) | **$3,600/mo** | **$36,000/mo** | **$360,000/mo** |
| **Infra gross margin** | ~$1,400 (**39 %**) | ~$20,000 (**56 %**) | ~$245,000 (**68 %**) |

*Infra margin is positive even at 10 K — but the absolute dollars are trivial
until scale, and this is **before any human cost**.*

### 4e. The threshold that actually matters

A small team (2–3 people, ~$30–50 K/mo fully loaded) needs the paid base to
cover it. At 3 % conversion × $12, that's roughly **~150–200 K total sites before
the platform supports a team** on its own. Below that it's an investment / side
project, not a business. Margin compounds above it as fixed cost amortizes and
the paid base grows.

---

## 5. Sensitivities — what really decides viability

1. **Free-site marginal cost** — must stay under ~$0.05/mo. Zero-egress CDN
   (Cloudflare/R2) + image optimization + no free video. Get this wrong and the
   free tier alone sinks you. *Highest leverage.*
2. **Conversion × ARPU** — 1 % vs 5 %, $8 vs $20, is the difference between
   bleeding and thriving. The **WordPress-migration wedge** matters here: a user
   who just moved their whole site over is *high-intent* and converts far better
   than a tire-kicker.
3. **Fixed platform cost** — dominates below ~100 K sites; keep it lean and
   boring.
4. **Abuse** — a handful of bad actors serving warez/video can blow up egress
   overnight. Hard storage + bandwidth caps, file-type blocks, and monitoring are
   not optional; they're load-bearing.

---

## 6. Honest risks / unknowns

- **Cold starts** — scale-to-zero wake is ~sub-second on Fly, but the *admin* UX
  has to feel instant; may need a small warm pool for active editors.
- **SQLite-at-scale** — one-DB-per-tenant across millions leans on D1/Turso
  maturity; test their real limits and per-DB cost early.
- **Custom-domain TLS ops** — issuance/renewal/storage for many hostnames is a
  real subsystem (and Cloudflare-for-SaaS charges ~$0.10/custom hostname/mo — a
  paid-tier cost, so charge for it).
- **Support cost — the quiet killer.** A $12/mo customer can absorb almost no
  human support. Docs, self-serve, and the web admin have to carry it; every
  support ticket is a margin event.
- **Moat** — "why not WordPress.com or Vercel?" The answer has to stay sharp:
  *leave WordPress in one command, own your content as portable files, cheap.*
  Portability *is* the differentiator; don't dilute it.

---

## 7. Phased path (crawl / walk / run)

- **Phase 0 — done.** The self-hostable framework + web admin + one-command WP
  migration (`@voltjscom/wp-volt`). Already shipped. This is the seed and the
  acquisition wedge.
- **Phase 1 — hosted MVP.** Subdomains only (`site.volthost.com`), static compile
  → Cloudflare Pages/R2, shared admin service, D1/Turso, Stripe billing. No
  custom domains, no video. Proves the compile-and-serve loop + the unit cost.
- **Phase 2 — real sites.** Custom domains (Cloudflare-for-SaaS), the paid tier
  (with a DO-dedicated option), forms + DB, image optimization in the pipeline.
- **Phase 3 — scale.** Outsourced video (Cloudflare Stream / Bunny), teams,
  marketplace, template ecosystem.

---

## 8. Bottom line — does the math close?

**Yes, conditionally.** The unit economics work *if and only if* the free tier is
near-zero-marginal (static + zero-egress CDN + scale-to-zero + image
optimization), and the paid conversion clears ~3 % at a ~$12 ARPU. Under those
conditions infra margin is 55–70 % at scale, and DO is never stressed — it
carries the *paid* fleet and the control plane, both revenue-positive.

The binding constraints, in order, are **(1) free-site cost-at-rest, (2)
conversion rate, (3) fixed cost until ~100 K sites, (4) abuse and support.** DO's
capacity is nowhere on that list. It's a real business, gated on execution and a
~150–200 K-site threshold to self-fund a team — a company, built on a seed that
already exists.
