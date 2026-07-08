# volt-control

The **control plane** — the fourth hosting service, and the one that turns the
other three into a product. Accounts, site provisioning, plans/quotas,
custom-domain verification, and the publish trigger. **Zero runtime deps.**

It's the coordinator: it **writes** the `DOMAINS_MAP` that `volt-static-host`
reads, **reads** storage usage from `volt-image-host`, and **spawns**
`volt-publish` to build a site. The other three stay dumb and stateless; the state
and policy live here.

## API

```
POST /auth/request {email}                → magic link (logged; real: emailed)
GET  /auth/verify?token=…                  → sets a session cookie
POST /auth/logout
GET  /me                                   → account + plan + site count
POST /sites {name}                         → provision a site (dir + record)  [quota: plan.sites]
GET  /sites                                → your sites
GET  /sites/:id                            → site + domains + storage usage
POST /sites/:id/publish                    → run volt-publish for the site
POST /sites/:id/domains {domain}           → add a custom domain  [paid; quota: plan.customDomains]
POST /sites/:id/domains/:domain/verify     → confirm TXT → write DOMAINS_MAP
POST /billing/upgrade {plan}               → Stripe checkout (stub) / dev upgrade
```

## Flows

- **Provision** — `POST /sites` slugifies the name to a unique `siteId`, creates
  `SITES_ROOT/<siteId>/` with a placeholder `index.html`, and returns
  `https://<siteId>.vsites.app`. Enforces `plan.sites`.
- **Custom domain** — `POST /sites/:id/domains` returns a **TXT record** to add
  (`_volt-verify.<domain>`). `…/verify` confirms it over DNS (same
  evidence-before-trust pattern as MIR), flips the domain to `verified`, and
  rewrites `DOMAINS_MAP` — after which `volt-static-host` serves it (and its
  `/_tls-allow` gate approves the cert). Custom domains are a paid feature
  (`free.customDomains = 0`).
- **Publish** — `POST /sites/:id/publish` spawns `volt-publish <PROJECTS_ROOT/id>
  --site <id> --out <SITES_ROOT>`, which crawls the project and writes the static
  tree the static host serves.

## Plans

| | Free | Pro ($12) |
|---|---|---|
| sites | 3 | 25 |
| storage | 1 GB | 10 GB |
| bandwidth | 20 GB | 500 GB |
| custom domains | 0 | 10 |
| video | ✗ | ✓ |

## MVP honesty (what's stubbed)

- **Store** is a JSON file (atomic writes). Fine at low volume; the `get/all/find/
  put/del` interface is the seam to swap for **Postgres** at scale.
- **Email** isn't sent — the magic link is logged (and returned as `devLink`
  outside production). Wire SMTP for real.
- **Stripe** — with no `STRIPE_SECRET_KEY`, `/billing/upgrade` flips the plan
  directly (dev/self-host). Real billing needs a Checkout session + webhook.
- **Not yet**: bandwidth metering (needs CDN logs), abuse/suspension automation,
  session hardening (CSRF, `Secure` cookies behind TLS), and `SIGHUP`-ing the
  static host after a `DOMAINS_MAP` write (currently the static host reloads on
  its own `HUP`).

## Run

```bash
cp .env.example .env    # set the *_ROOT paths + TENANT_DOMAIN
npm start               # node 18+, no install
```
