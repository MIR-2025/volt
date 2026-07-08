# VoltJS — the real adoption flow

> The honest end-to-end: what someone *actually* does to go from "I want to try
> Volt" to a live, owner-managed site — including where it's smooth and where it
> isn't WordPress-easy yet. Written straight, not from the pitch.

## TL;DR

- Adoption today is **developer-first**. A dev (or a technical owner) scaffolds,
  configures, optionally migrates from WordPress, and deploys. A **non-technical
  owner** then takes over day-to-day through the web admin.
- There is **no hosted one-click signup** — no "create my site at voltjs.com."
  You bring your own host. That's the single biggest gap vs WordPress.com / Wix /
  Squarespace, and the main thing standing between Volt and mass adoption.

---

## 1. Start — developer, ~2 minutes

```bash
npx create-volt@latest my-app     # pick a template: default / blog / docs / business / starter / guestbook
cd my-app
npm run dev
```

- **No build step.** `npm run dev` is just `node server.js`, on a date-derived
  port.
- **First run has no `.env`, so it opens the config wizard** (a disposable local
  UI on port 5050) instead of the app. That's the intended on-ramp.

## 2. Configure — the 5050 wizard

`node server.js --edit` (or the automatic first run) opens the local config UI.
Set:

- **Identity** — `SITE_NAME`, `SITE_URL`, theme, color scheme, light/dark.
- **Typography** — a font per role (headings / subsections / body / code),
  downloaded and self-hosted, previewed in its own type right in the picker.
- **Database** — SQLite (default, a file at `.volt/data.db`), in-memory, or a
  real server: MongoDB / MySQL / MariaDB / Postgres.
- **Admin** — `ADMIN_EMAIL` + `ADMIN_PATH` (who can sign in, and at what URL).
- **Mailer**, and — only if `SITE_URL` is a public domain — **MIR** participation.

It writes `.env`; restart to apply.

## 3. Content — plain markdown

- Pages and posts are files: `pages/*.md`, `posts/*.md`, with YAML front-matter
  (title, date, category, tags, image). Git-friendly, portable, no database
  required.
- Navigation is `pages/_nav.md` — a markdown link list (nesting supported).

## 4. (Optional) Migrate from WordPress — one command

```bash
npx create-volt import-wxr export.xml           # an offline WXR export file
npx create-volt import-wp https://oldsite.com   # a live site, over the REST API
npx create-volt import-wp-db mysql://…          # straight from the WP database
```

- Delegates to `@voltjscom/wp-volt`, which writes a **full Volt tree**: `pages/`
  + `posts/` + `public/media/` + `pages/_nav.md`.
- Your existing `.env` is preserved; the migrated site config lands in
  `.env.migrated` for you to merge.

## 5. Deploy — the real step

Every scaffold ships **`Dockerfile`, `render.yaml`, `fly.toml`, `Procfile`, and a
`README`**. Pick a lane:

- **PaaS** (Render / Fly / Railway / DO App Platform) — push the repo; the config
  file is already in the box.
- **VPS** — `npm run pm2` (PM2 + the bundled `ecosystem.config.cjs`), nginx in
  front.

Then set the `.env` on the host, point your domain, done.

> This is where it stops being one-click. You need a host, a domain, and to set
> env vars. It's documented — not a "publish" button.

## 6. Hand off to the owner — the web admin

Once deployed, the site owner manages everything at `ADMIN_PATH`:

- **Magic-link login** (passwordless, to `ADMIN_EMAIL`).
- Edit content, upload media, pick self-hosted fonts, run whitelisted actions
  (update / pull / restart).
- Changes go live instantly; no terminal needed.

## 7. (Optional) MIR participation

If the site runs on a public domain, the config offers MIR: **register → auto
domain-verify → promote → emit** participation events. Idempotent per app (keyed
on the domain), and it **never emits on localhost**.

---

## The honest friction — what "real" means

1. **No hosted onboarding.** There's no "sign up and get a site." Someone with a
   terminal has to scaffold and deploy. This is *the* adoption wall vs the hosted
   incumbents.
2. **Getting started is developer turf.** Steps 1–5 need Node (18+, and 22.5+ for
   the SQLite default) and a command line. A non-technical owner can't start
   alone — they join at step 6.
3. **The config wizard is localhost-only.** After deploy, changing *infrastructure*
   (DB, admin URL, secrets) means editing `.env` on the server and restarting —
   the web admin covers content/media/fonts, not infra. There's no remote "site
   settings" for the load-bearing config.
4. **First deploy = manual host + domain + DNS.** The shipped configs make it
   *documented*, not *automatic*.

## What's genuinely smooth

- Instant, no-build scaffold; running in seconds.
- Content is portable markdown in git — no lock-in, trivial backups, reviewable
  in PRs.
- The web admin gives owners a real, passwordless UI after setup.
- Deploy targets ship in the box (Docker + three PaaS configs + PM2).
- Leaving WordPress is a single command with full-fidelity output.
- Platform-independent: any OS, any container host, any of five databases.

## Who actually adopts today

| Persona | Can they start alone? | Where they live |
|---|---|---|
| Developer | Yes | The whole flow, in a terminal |
| Technical owner | Yes, with effort | Scaffold + deploy, then the web admin |
| Non-technical owner | **No** | The web admin only — *after* a dev sets it up |

## The one thing that would move adoption most

A **hosted front door** — `voltjs.com` scaffolds and deploys a starter site for
you (pick a template, get a subdomain, edit in the web admin), with "bring your
own domain / host" as the graduation. That collapses steps 1–5 into a signup and
lets non-technical owners adopt without a developer. Everything underneath — the
scaffold, the admin, the deploy configs, the WordPress migration — already
exists; what's missing is the hosted entry point.
