# VoltJS — the real adoption flow

> The honest end-to-end: what someone *actually* does to get a live,
> owner-managed Volt site — written straight, not from the pitch. As of
> **2026-07-10** there are **two on-ramps**: a hosted front door (new) and the
> self-hosted, developer-first path.

## TL;DR

- **Two ways in now.** **Hosted** (`host.voltjs.com`) — self-service signup, a
  site on `*.vsites.app` in minutes, edited in the browser, from **$0**; no
  terminal, no host of your own. **Self-hosted** (`create-volt`) — developer-first:
  scaffold, configure, deploy to your own host, own the whole stack.
- The old adoption wall — *"there's no hosted signup, you must bring your own
  host"* — is **closed.** The hosted front door exists. The self-hosted path is
  unchanged and still the choice for full control.
- Either way the content is the same portable Markdown, so you can **start hosted
  and self-host later** (or the reverse) with no lock-in. Hosted is a convenience,
  not a trap.

---

## Path A — Hosted (`host.voltjs.com`) — non-technical friendly

The front door for people who just want a site. No terminal, no server.

1. **Sign up** at `host.voltjs.com` — passwordless magic link, bot-protected with
   invisible proof-of-work (no captcha, no third party).
2. **Create a site** — start blank, or **migrate an existing WordPress site**
   (point it at a WXR export or URL; pages, posts, media, and menus come across,
   original URLs kept).
3. **Edit in the web admin** — a visual editor for pages, posts, media, and
   navigation; set your home page. Save publishes to fast static pages with a
   sitemap + clean URLs + free HTTPS.
4. **Your address** — `yourname.vsites.app` on Free; a **custom domain** on Pro.
5. **Batteries** — automatic sitemaps, image optimization, and a media CDN come
   standard; **contact forms with invisible spam protection** on Pro.

**Tiers:** Free — $0, 3 sites, 1 GB, `*.vsites.app`. Pro — $12/mo, 10 sites,
10 GB, custom domains, video, contact forms. Self-host — free forever (Path B).

**No lock-in even here:** it's still your Markdown, so you can export and
self-host anytime.

---

## Path B — Self-hosted (`create-volt`) — developer-first

Full control on your own host. This is the flow the doc always described.

### 1. Start — ~2 minutes

```bash
npx create-volt@latest my-app     # pick a template: default / blog / docs / business / starter / guestbook
cd my-app
npm run dev
```

- **No build step.** `npm run dev` is just `node server.js`, on a date-derived port.
- **First run has no `.env`, so it opens the config wizard** (a disposable local UI
  on port 5050) instead of the app. That's the intended on-ramp.

### 2. Configure — the 5050 wizard

`node server.js --edit` (or the automatic first run) opens the local config UI. Set:

- **Identity** — `SITE_NAME`, `SITE_URL`, theme, color scheme, light/dark.
- **Typography** — a font per role (headings / subsections / body / code),
  downloaded and self-hosted, previewed in its own type right in the picker.
- **Database** — SQLite (default, a file at `.volt/data.db`), in-memory, or a real
  server: MongoDB / MySQL / MariaDB / Postgres.
- **Admin** — `ADMIN_EMAIL` + `ADMIN_PATH` (who can sign in, and at what URL).
- **Mailer**, and — only if `SITE_URL` is a public domain — **MIR** participation.

It writes `.env`; restart to apply.

### 3. Content — plain markdown

- Pages and posts are files: `pages/*.md`, `posts/*.md`, with YAML front-matter
  (title, date, category, tags, image). Git-friendly, portable, no database required.
- Navigation is `pages/_nav.md` — a markdown link list (nesting supported).

### 4. (Optional) Migrate from WordPress — one command

```bash
npx create-volt import-wxr export.xml           # an offline WXR export file
npx create-volt import-wp https://oldsite.com   # a live site, over the REST API
npx create-volt import-wp-db mysql://…          # straight from the WP database
```

- Delegates to `@voltjscom/wp-volt`, which writes a **full Volt tree**: `pages/` +
  `posts/` + `public/media/` + `pages/_nav.md`.
- Your existing `.env` is preserved; the migrated site config lands in
  `.env.migrated` for you to merge.

### 5. Deploy — the real step

Every scaffold ships **`Dockerfile`, `render.yaml`, `fly.toml`, `Procfile`, and a
`README`**. Pick a lane:

- **PaaS** (Render / Fly / Railway / DO App Platform) — push the repo; the config
  file is already in the box.
- **VPS** — `npm run pm2` (PM2 + the bundled `ecosystem.config.cjs`), nginx in front.

Then set the `.env` on the host, point your domain, done.

> This is where self-hosting stops being one-click. You need a host, a domain, and
> to set env vars. It's documented — not a "publish" button. (If you don't want
> this, that's exactly what Path A is for.)

### 6. Hand off to the owner — the web admin

Once deployed, the site owner manages everything at `ADMIN_PATH`:

- **Magic-link login** (passwordless, to `ADMIN_EMAIL`).
- Edit content, upload media, pick self-hosted fonts, run whitelisted actions
  (update / pull / restart).
- Changes go live instantly; no terminal needed.

### 7. (Optional) MIR participation

If the site runs on a public domain, the config offers MIR: **register → auto
domain-verify → promote → emit** participation events. Idempotent per app (keyed on
the domain), and it **never emits on localhost**.

---

## The honest friction — what's still real

1. **Hosted is young.** The front door exists and works end-to-end (signup → site →
   edit → publish, plus in-browser WordPress migration), but it's a new platform
   still filling in depth — themes, comments, richer media — against WordPress's
   20-year plugin ecosystem.
2. **Self-hosting is still developer turf.** Path B needs Node and a command line;
   a non-technical owner can't self-host alone — but they no longer have to, since
   Path A is theirs.
3. **On self-hosted, infra config is local + manual.** The 5050 wizard is
   localhost-only; after deploy, changing DB / admin-URL / secrets means editing
   `.env` on the host and restarting. The web admin covers content/media/fonts, not
   infra.
4. **Depth vs breadth.** Volt nails the common case — a fast content site, blog, or
   business site — but doesn't (yet) match WordPress's plugin breadth for complex
   apps (memberships, heavy e-commerce).

## What's genuinely smooth

- **Hosted signup → live site in minutes, no terminal** — the wall that used to
  block non-technical owners is gone.
- Instant, no-build scaffold on the self-hosted path; running in seconds.
- Content is portable Markdown — no lock-in on **either** path; trivial backups,
  reviewable in PRs, export + self-host anytime.
- A real passwordless web admin for owners after setup (both paths).
- Leaving WordPress is one command (CLI) or an in-browser migration (hosted),
  full-fidelity output.
- Self-hosted ships every deploy target in the box (Docker + three PaaS configs +
  PM2) and runs on any OS / five databases.

## Who actually adopts today

| Persona | Can they start alone? | Where they live |
|---|---|---|
| Non-technical owner | **Yes, now** | Hosted (`host.voltjs.com`) — signup → web admin |
| Technical owner | Yes | Either path — hosted for speed, self-host for control |
| Developer | Yes | The full self-hosted flow, in a terminal |

## The one thing that would move adoption most

The hosted front door — the old #1 gap — now exists, so the lever moves upstream to
**awareness and the migration wedge.** "Leave WordPress in a few clicks" is the
story that pulls people in, so the highest-leverage work is making the **in-browser
WordPress migration** flawless and front-and-center on `host.voltjs.com`, then
telling the audience that already feels WordPress pain that a real alternative
exists. After that, **feature depth** (themes, comments-on-demand) to retain the
people the migration brings in.
