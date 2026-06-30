# Changelog

All notable changes to `create-volt` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.49.0] - 2026-06-29

### Added
- **AI in the config editor.** The embedded RTEPro editor's AI button now works:
  a new `/setup/ai` proxy injects the `.env` provider key server-side
  (Anthropic / OpenAI / Gemini, BYO) and RTEPro is wired to it via aiProxy. The
  key never reaches the browser. (Set ANTHROPIC_API_KEY etc. in the app's .env.)

## [0.48.3] - 2026-06-29

### Fixed
- **Unreadable text in the dark config.** The wizard never set Bootstrap's
  `data-bs-theme`, so muted/secondary text (feature descriptions, hints) was
  colored for a light background and vanished on the dark cards. It now tracks the
  light/dark toggle, so all Bootstrap text is readable in both modes.

## [0.48.2] - 2026-06-29

### Changed
- Config is desktop-only, so the **editor view is now much wider** (up to
  `min(1200px, 95vw)`) while settings stay a readable 720px — view-responsive.

## [0.48.1] - 2026-06-29

### Changed
- Config WYSIWYG loads RTEPro at a **major-version float** (`@1`) instead of a
  pinned patch, so RTEPro 1.x updates flow without a create-volt release. Dropped
  the marked dependency entirely — RTEPro takes markdown directly via setMarkdown().

## [0.48.0] - 2026-06-29

### Added
- **WYSIWYG editor in the config.** Manage content embeds the RTEPro rich editor
  (loaded from CDN) instead of a raw textarea — visual editing, shell-gated, no
  public route or auth. Opens markdown rendered to HTML, saves markdown (or HTML
  for complex layouts), with a title field beside the slug.

## [0.47.0] - 2026-06-29

### Added
- **Config shows the create-volt version** at the top, always; with `(X available)`
  + an Upgrade button when behind, `(up to date)` otherwise.
- **Light-mode switcher** in the config wizard (top-right; persists; defaults to dark).

### Fixed
- **Content-editor textarea** showed a template placeholder instead of the page
  body — now binds the body via the value property.

## [0.46.0] - 2026-06-29

### Added
- **`update` self-heals `server.js` startup-log encoding.** Older scaffolds had
  byte-corrupted bolt/arrow/ellipsis/dash characters in their console logs;
  `create-volt update` (and the config wizard Upgrade button, which runs it) now
  surgically repairs them — rewriting the brand log lines to plain ASCII and
  swapping the corrupted byte-runs — with no change to your logic.

## [0.45.1] - 2026-06-29

### Fixed
- **.env inline comments.** `KEY=value # note` now parses to `value` (trailing
  comment stripped); quoted values stay literal. Previously the comment became
  part of the value.

## [0.45.0] - 2026-06-29

### Added
- **Buy AI credits from the config wizard.** When an app uses the hosted gateway
  (`VOLT_AI_TOKEN` set), the `--edit` wizard shows an **AI credits** card — live
  balance + tier, and top-up buttons that open Stripe Checkout. The purchase flow
  lives in the (shell-gated) config only; the running app never exposes it.
  Proxied via `/setup/ai-credits` + `/setup/ai-credits/checkout` to the gateway.

## [0.44.0] - 2026-06-29

### Added
- **`--logs` — a built-in log viewer** on its own localhost port (like `--studio`):
  `npm run logs`. Tails pm2 stdout/stderr **out of the box**; an Analytics tab
  parses Apache/nginx access logs via `mir-sentinel` (optional dep) → top
  paths/status/IPs + bot/attack counts. **Add more sources** (other apps, servers,
  mounted/tunneled paths) right in the viewer — saved to `.volt/logs.json`.
  Localhost-only; SSH-tunnel the port for a remote box.

## [0.43.0] - 2026-06-30

### Added
- **Upgrade from the wizard.** Scaffolds record their version in `.volt/version`;
  the `--edit` wizard checks npm and shows an "create-volt X available" notice with
  a one-click **Upgrade** button (runs `npx create-volt@latest update`).
- **`update` refreshes everything framework-owned** — vendored runtime
  (`volt.js`, `volt-ssr.js`), the setup wizard, and bundled add-ons + themes (was
  just `volt.js`). Your `server.js` + content are left untouched.
- **Simpler AI setup.** The wizard AI section is clearly optional with a
  per-provider **Get a key →** link (Anthropic / OpenAI / Gemini); leave it blank
  and the editor works without AI.

## [0.42.0] - 2026-06-30

### Added
- **Content manager in the config wizard.** `npm run dev -- --edit` has a
  **Manage content →** view: list, create, edit (raw markdown), and delete pages
  + posts, via new slug-validated `/setup/content*` endpoints. The config page is
  a content dashboard now, not just settings.

### Fixed
- **Garbled characters in startup logs.** The `⚡`/`→`/`…`/`—` in server logs and
  source comments had been byte-corrupted (mojibake) by an earlier tooling pass.
  Console output is now clean ASCII ("Volt at http://…", "Volt setup at …").

## [0.41.0] - 2026-06-30

### Added
- **PM2 support.** Scaffolds ship `ecosystem.config.cjs` + scripts: `npm run pm2`
  (start under pm2 — fetched via npx if not installed, or uses your global pm2),
  `pm2:restart` (clean reload, no port clash), `pm2:logs`, `pm2:stop`.
- **`npm run dev` on an already-running app reloads it instead of crashing.** A
  second start detects the in-use port, pings the running instance's new
  `/__volt/reload` route to refresh browsers, prints a note, and exits 0 — no
  more `EADDRINUSE` stack trace.

## [0.40.0] - 2026-06-30

### Added
- **Themed front page.** `pages/index.md` now takes over `/` (rendered in your
  theme), so a content site's home matches the rest of the site instead of
  showing the demo `views/index.html`. With no `pages/index.md`, `/` stays the
  app's index.html. (Answers: "I chose a theme but the home page was unchanged" —
  the theme styles pages/posts; the home needs to *be* a page.)

## [0.39.1] - 2026-06-30

### Fixed
- **Scaffolding was broken in 0.37.0–0.39.0.** The bundled `themes/` dir is
  copied into new apps, but it was never added to the package `files`, so it was
  missing from the npm tarball and `npm create volt` crashed with
  `ENOENT … create-volt/themes`. Added `themes` to `files`, and guarded the
  bundled-dir copy (`addons`/`themes`) so a missing dir is skipped, never fatal.
  Verified by scaffolding from the packed tarball.

## [0.39.0] - 2026-06-29

### Fixed
- **Hot reload now reaches content pages.** Pages/posts are server-rendered HTML
  that dont load `volt.js`, so the 0.38 morph client never ran on them. In dev,
  the `pages`/`posts` add-ons now inject the hot-reload client (socket.io +
  `volt.js`) into every served page. Verified with Chromium: editing a post
  morphs the DOM in place — scroll position and page state preserved, no full
  reload. Nothing is injected in production.

## [0.38.0] - 2026-06-29

### Added
- **Smart hot reload (live DOM morph).** Editing markdown / HTML / templates now
  patches only the changed DOM nodes instead of a full page reload — focus, caret,
  scroll, and untouched subtrees survive. CSS edits swap the stylesheet in place;
  JS edits (and client-rendered `#app` pages) still do a full reload, and any morph
  error falls back to one. The watcher tells the client which file changed.
- **Themes hot-reload in dev.** Editing `_theme.js` / `_theme.css` / a bundled
  theme now reflects immediately — theme imports are mtime cache-busted in dev
  (previously a restart was needed). Pages + posts share the live resolver
  (`themeResolver`).

## [0.37.0] - 2026-06-29

### Added
- **Bundled themes + a wizard theme picker.** create-volt ships paper/midnight/
  classic under `.volt/themes`; the setup wizard has a **Theme** dropdown (no npm
  needed) with a **Customize** button that copies the chosen theme to
  `pages/_theme.js` for editing. `THEME` now also resolves bundled themes.
- **More wizard settings:** `SITE_NAME`, `SITE_URL`, `CONFIG_PORT`, and optional
  **AI keys** (`AI_PROVIDER` + Anthropic/OpenAI/Gemini key — written to `.env`,
  kept server-side).
- **`CONFIG_PORT` defaults to 5050** for the `--edit`/`--studio` config UI, so it
  never collides with a running app.
- **Inject `<script>` tags** for third-party libs: per-page front-matter
  `scripts:` (comma-separated URLs) and/or a site-wide `SITE_SCRIPTS` env, loaded
  deferred (works on pages + posts).

## [0.36.0] - 2026-06-29

### Added
- **`--port <n>` and `CONFIG_PORT`.** `--port` overrides the listen port for any
  run; `CONFIG_PORT` in `.env` gives the `--edit`/`--studio` config UI its own
  port, so it never collides with a running app. An in-use config port now prints
  a clear hint instead of a raw `EADDRINUSE` stack.
- **Hot reload watches `pages/` and `posts/`.** Editing markdown content now
  reloads the browser (content is read per request, so the edit shows). Theme
  files (`_theme.js`) still need a restart — ES modules cache.

### Fixed
- The `blog` + `docs` templates had drifted from `default`s `server.js`/wizard and
  silently missed recent fixes (including the hot-reload watcher). Re-synced, with
  a test that fails if they drift again.

## [0.35.0] - 2026-06-29

### Fixed
- **Setup wizard: dependency add-ons now show as checked.** Enabling `auth` pulls
  in `db` + `mailer` (its dependencies), which were added to `VOLT_ADDONS` but
  whose checkboxes stayed *unchecked* — so the generated `.env` looked like it had
  add-ons you never picked. Pulled-in dependencies now render **checked + disabled**
  with a "required by <add-on>" note, so the checkboxes always match `VOLT_ADDONS`.

## [0.34.0] - 2026-06-29

### Added
- **Timezone detection.** The setup wizard detects the admin's timezone from
  their browser (`Intl`) and writes `SITE_TZ` to `.env`. The `posts` add-on then
  renders full timestamps in `SITE_TZ` rather than the server's zone (usually UTC
  on a host); date-only values render as that calendar day either way.

## [0.33.0] - 2026-06-29

### Added
- **Two content templates** showcasing the pages/posts/theme system:
  `--template blog` (markdown posts → /blog, categories, tags, RSS, an /about
  page, per-post SEO, a serif theme) and `--template docs` (markdown pages in a
  sidebar layout). Both ship a pre-configured `.env` and boot straight into the
  app — no wizard.

### Fixed
- Dark-on-dark text in the default + starter apps: `.text-muted` is overridden to
  a readable color on the dark background (the demo footer caption was dropped).
- `posts`: `YYYY-MM-DD` dates render on the correct day (parsed as local, not UTC).

## [0.32.0] - 2026-06-29

### Changed
- **Brand refresh:** the ⚡ glyph is replaced with the Volt logo across the demo
  app, the setup wizard, and Studio; scaffolded apps now ship `logo.webp` +
  `favicon.webp` and link a favicon (so apps get a real tab icon). README titles
  keep the ⚡.

## [0.31.0] - 2026-06-29

### Added
- **`posts` add-on — a blog (the WordPress content model).** Markdown in `posts/`
  becomes a paginated index at `/blog`, single posts at `/blog/<slug>`, plus
  `/category/<name>`, `/tag/<name>`, and an RSS feed at `/feed.xml`. Posts carry
  date/author/category/tags front-matter (date can also come from a
  `YYYY-MM-DD-` filename prefix); drafts (`draft: true`) are skipped. Renders in
  the site theme and reuses pages' SEO — single posts get an auto Article
  JSON-LD + `og:type=article`. Depends on the `pages` add-on. New `/docs/posts`.

## [0.30.0] - 2026-06-29

### Fixed
- **Setup wizard: typing in a settings field no longer drops focus.** The
  conditional sections (DB-driver fields, S3 fields) read the whole `state()`
  signal, so every keystroke re-rendered the section and recreated the `<input>`,
  losing focus. They now key on memoized primitive derivations (`dbDriver`,
  `mediaDriver`, `hasDb`/`hasMailer`/`hasMedia`) so a section re-renders only when
  its discriminant changes.
- **`volt.js`: reactive `value` bindings skip redundant DOM writes.** `setAttr`
  no longer reassigns `node.value` when it already equals the new value — those
  writes were resetting the caret to the end while typing. Benefits every Volt
  app, not just the wizard.

## [0.29.0] - 2026-06-29

### Fixed
- **Date-derived default port is now valid year-round.** For Oct–Dec the
  readable YY+M+DD form is 6 digits (e.g. `261010`) and exceeds the max TCP port
  65535, so create-volt previously refused to scaffold without `--port`. It now
  falls back to a deterministic in-range port `1024 + (YYYYMMDD % 64512)` when the
  readable form overflows; Jan–Sep keep the readable port unchanged. Extracted to
  `lib/date-port.js` and unit-tested.

## [0.28.0] - 2026-06-29

### Fixed
- Wizard **Test connection** now installs the selected DB driver on demand
  (mongodb / mysql2 / pg, at the pinned version) before testing — it used to fail
  with "<driver> isn't installed" because the package is only added on Apply.
  Also adds the missing `spawnSync` import.

## [0.27.0] - 2026-06-29

### Fixed
- **Reactive crash on conditional re-render** (`volt.js`) — a signal write
  notified a *snapshot* of subscribers, so a parent reactive block that disposed
  a nested one mid-update would still run the stale nested effect on detached DOM
  ("Cannot read properties of null (reading 'insertBefore')"). Disposed effects
  now skip their queued run, and `renderRange` guards against a detached range.
  Fixes the **setup wizard** crashing when toggling add-ons or changing the DB
  driver. Regression-tested in the headless-browser suite.

## [0.26.0] - 2026-06-29

### Added
- **Themes / shared layout for the `pages` add-on** — pages render into a layout:
  (1) `pages/_header.html` + `_footer.html` partials (no code); (2) a local
  `pages/_theme.js` exporting `layout({ title, head, content, meta })` (+ optional
  `css`); (3) a third-party `volt-theme-<name>` package selected with
  `THEME=<name>`. `create-volt create-theme <name>` scaffolds one. Resolution:
  THEME → local `_theme.js` → built-in default.
- **One stylesheet for page + editor** — the active theme's CSS is served at
  `/_theme.css` (a theme's `export const css`, or `pages/_theme.css`, or the
  default). Pages link it, and the WYSIWYG editor loads it into RTEPro's
  `exportCSS`, so the preview matches the published page — CSS authored once.
- **Site-wide OG image default** — `OG_IMAGE` in `.env` is the `og:image` for
  pages without a per-page `image`.

## [0.25.0] - 2026-06-29

### Added
- **Per-page SEO on the `pages` add-on** — front-matter now drives the page head:
  `description` (meta description + og:description), `image` (og:image), `type`
  (og:type), `canonical`, and **`jsonld`** (a one-line JSON string rendered into a
  validated `<script type="application/ld+json">` block, with `<` escaped to
  prevent breakout). Open Graph + Twitter + JSON-LD per page — the Yoast-style SEO
  a migrated WordPress site expects. `volt-addon-editor` 0.4.0 adds a SEO panel to
  set these from the editor.

## [0.24.0] - 2026-06-29

### Added
- The `pages` add-on now supports **`format: html`** in front-matter — those
  pages are served **verbatim** (no markdown processing), so rich/complex layouts
  (e.g. from the WYSIWYG editor) are preserved losslessly. Plain markdown pages
  are unchanged. (`volt-addon-editor` 0.2.0 now stores `getHTML()` with
  `format: html` so editor layouts round-trip exactly.)

## [0.23.0] - 2026-06-29

### Added
- Plugin context now includes **`requireAuth`** and **`sessionFromReq`** (when the
  auth add-on is on) so third-party add-ons can gate routes by login. Purely
  additive — no change to defaults or security posture.

### Note
- New companion package **`volt-addon-editor`** (separate npm package): a
  standing, role-gated RTEPro WYSIWYG editor that writes markdown pages. Mounts
  only if `ADMIN_PATH` is set (**fail-closed**), behind magic-link auth + an
  `ADMIN_EMAILS` allowlist; the secret path is obscurity *on top of* auth, never
  instead. The AI key stays server-side via a key-injecting proxy. The core stays
  no-standing-admin by default — install only where you want it
  (`npx create-volt add editor`). See `/docs/editor`.

## [0.22.0] - 2026-06-29

### Added
- **Third-party add-ons (plugins) — the WordPress-plugin equivalent.** Any
  `VOLT_ADDONS` entry that is not built-in is loaded from a local
  `.volt/addons/<name>/index.js` or an installed npm package
  `volt-addon-<name>`, and wired via a single `register(ctx)` export
  (ctx = app, express, io, store, mailer, env, log). Install functionality as
  small, owned packages instead of dashboard plugins.
  - `create-volt add <name>` — install `volt-addon-<name>` and enable it.
  - `create-volt create-addon <name>` — scaffold a publishable add-on package.
  - New `/docs/plugins`.

### Fixed
- `availableAddons()` tolerates add-on directories without `meta.json` (so
  local third-party add-ons do not break the wizard).

## [0.21.0] - 2026-06-29

### Added
- **`import-wp-db`** — import WordPress content by reading its MySQL/MariaDB
  database directly, for when the REST API is disabled but you have DB access
  (on the server or via an SSH tunnel). `--prefix` for non-default table
  prefixes (validated against SQL injection); creds via `WP_DB_URL` to keep them
  out of shell history; `mysql2` loaded lazily. Reuses the WXR converter; unit
  tested with an injected connection. Third migration path alongside
  `import-wp` (REST) and `import-wxr` (file).

## [0.20.0] - 2026-06-29

### Added
- **`import-wp` — fully-automated WordPress import over the REST API.**
  `npx create-volt import-wp <https://site>` pulls published posts + pages
  directly (paginated) into markdown `pages/` — no export file, and **no
  credentials for public content**. Drafts/private need an Application Password
  via `WP_USER` + `WP_APP_PASSWORD` (Basic auth, **sent only over HTTPS, never
  logged**). Falls back to `import-wxr` if the REST API is disabled. Reuses the
  WXR→markdown converter; unit-tested with a mocked fetch. `/docs/migrate`
  updated to lead with the automated path.

## [0.19.0] - 2026-06-29

### Added
- **`import-wxr` — WordPress importer.** `npx create-volt import-wxr <export.xml>`
  converts a WordPress WXR export into markdown pages: published pages + posts →
  `pages/<slug>.md` with front-matter (title, date, tags), Gutenberg block
  comments stripped, body kept as HTML/markdown; drafts + attachments skipped;
  slugs sanitized + de-duplicated. Flags: `--out <dir>`, `--drafts`, `--force`.
  Zero-dep parser (WXR is a consistent format); unit-tested. Lowers the cost of
  moving off WordPress. New `/docs/migrate`.

## [0.18.0] - 2026-06-29

### Added
- **Volt SSR** — `volt-ssr.js`, a tiny server-side renderer: render the same
  `html` / `h()` markup and signal values to an HTML string in Node (`${values}`
  escaped by default, `raw()` for trusted HTML) via `renderToString`. Ships in
  every template, so a scaffolded app can be server-rendered for SEO + fast first
  paint and hydrate with `volt.js` on the client. The Volt site itself is now
  built with it — marketing pages as Volt components, docs as markdown rendered
  with `raw()`, the whole page composed by `renderToString`.

## [0.17.0] - 2026-06-29

### Added
- **PaaS deploy targets** — every scaffold now ships a `Dockerfile`,
  `.dockerignore`, `render.yaml`, `fly.toml`, and `Procfile`, so a Volt app
  deploys to Render / Fly.io / Railway / DO App Platform (which handle the
  server, DNS, and TLS) with config supplied as platform env vars. New
  `/docs/deploy` guide covering the PaaS and PM2+nginx paths.

### Changed
- The server boots straight into app mode (no setup wizard) when
  `NODE_ENV=production` or `VOLT_ADDONS` is set via env — so a container/PaaS
  runs the app from platform env vars without a committed `.env`.

## [0.16.0] - 2026-06-29

### Added
- **`media` add-on** — file uploads with a swappable storage driver: `local`
  (disk, served at `/media`) or `s3` (any S3-compatible store: AWS S3,
  DigitalOcean Spaces, …). `POST /api/media` is auth-gated (depends on the auth
  add-on); uploads are size-capped (`MEDIA_MAX_MB`, default 10), restricted to
  raster images + PDF (SVG rejected), stored under a random key, and returned as
  a public URL. Driver + S3 settings are configured in the setup wizard. Pulls in
  `busboy` (and `@aws-sdk/client-s3` when `MEDIA_DRIVER=s3`), both tracked by the
  dependency auto-updater and exercised by the smoke gate.

## [0.15.1] - 2026-06-29

### Fixed
- `volt.js` no longer touches `window` at import time — the hot-reload client is
  guarded with `typeof window`, so the library is safe to import in Node (SSR,
  tests), not just the browser.

### Changed
- The `pages` add-on imports `express`/`marked` lazily (only when mounted), so
  its pure helpers load without those packages present.

### Added (repo tooling — not shipped in scaffolded apps)
- A `node --test` unit suite (reactive core, memory store, pages helpers), a
  `smoke` script (scaffold → install → boot → hit endpoints), a CI workflow, and
  a smoke-test **gate** on the dependency auto-updater: a version bump is
  committed only if unit tests + smoke pass on the bumped versions.

## [0.15.0] - 2026-06-28

### Added
- **`pages` add-on** — markdown pages, no database and no admin. Drop `.md`
  files in `pages/` and each is served as HTML at `/<slug>`; front-matter
  `title:` sets the page title. Author them in your editor or with AI. Pulls in
  `marked` (added on enable, tracked by the dependency auto-updater); the
  `pages/` directory is auto-created with a sample on first run. Mounted last,
  so your own app routes always win.

## [0.14.0] - 2026-06-28

### Changed
- **Adopted the most-secure admin model: ephemeral, shell-only.** Removed the
  persistent role-gated `admin` add-on (from 0.13.0). There is now **no web
  admin** anywhere — the data browser is the ephemeral, localhost-only
  `--studio`, and config is `--edit`; both are shell/SSH-gated. SECURITY.md
  updated to state this as a core property.

### Added
- Dependency auto-update: `scripts/update-deps.mjs` + a weekly GitHub Action
  bump create-volt's pinned dependency floors to the latest **within the current
  major** (never a breaking major). Repo-only — scaffolded apps are untouched.
- Refreshed floors: express ^4.22.2, socket.io ^4.8.3, mongodb ^6.21.0,
  mysql2 ^3.22.5, pg ^8.22.0, nodemailer ^6.10.1.

## [0.13.0] - 2026-06-28

### Added
- Opt-in **`admin`** add-on: a persistent, role-gated web admin (data browser)
  for browser-only admins. Gated by auth **and** an `ADMIN_EMAILS` allowlist;
  the panel is hidden for non-admins and `/admin/api/*` returns 403. Internal
  collections (auth tokens/sessions) hidden. Wired into the default + starter
  templates and the setup wizard (ADMIN_EMAILS field).
- `SECURITY.md` documenting the ephemeral-admin model and secure defaults.

### Note
- Prefer the ephemeral `--studio` (shell-gated) for admins with server access;
  the `admin` add-on is the explicit standing-surface opt-in for non-shell admins.

## [0.12.0] - 2026-06-28

### Added
- **`--template starter`** — a complete, no-build app shell, fully wired and on
  out of the box: top nav over **Home**, magic-link **Account**, per-user
  **Notes** (auth-gated CRUD, db-backed), and **Chat** (realtime rooms + presence
  + typing). Ships a default `.env` enabling db+mailer+auth+realtime; includes
  the setup wizard (`--edit`) and Studio (`--studio`). The SaaS-style starting
  point.
- Templates can now ship a default `.env` (as `env`, renamed on scaffold).

## [0.11.0] - 2026-06-28

### Added
- **`create-volt studio`** (and `npm run dev -- --studio`) — an ephemeral,
  localhost-only **data browser**, à la Prisma Studio. Browse collections and
  documents across any driver (memory / MongoDB / MySQL / Postgres) and delete
  docs. It's **never a route in the running app** — it exists only while you run
  it, binds `127.0.0.1`, and disappears on Ctrl-C (shell/SSH access is the auth).
  Internal collections (auth tokens/sessions) are hidden.
- Stores gained `collections()` (enumerate collection names) on every adapter.

### Security
- Admin/data surfaces are **ephemeral by design** — no standing `/admin` route in
  the running app to attack (verified: the app 404s admin routes). Same model as
  the config editor: on-demand, loopback-only, gone when the app runs.

## [0.10.0] - 2026-06-28

### Added
- Frontend UI for the user-facing add-ons, auto-mounted when enabled:
  - **auth** → a magic-link sign-in panel (email → link → signed-in state)
  - **realtime** → a live chat panel (rooms, presence, typing, messages)
  Each add-on serves its own `/<name>-ui.js` (only when enabled); `public/app.js`
  mounts them alongside the demo. The server exposes `GET /__volt/addons`.

### Security
- Security headers on every response: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: same-origin`, `X-Powered-By` off.
- Hardened forms: typed / length-capped / autocompleted inputs; all user content
  renders through Volt holes (text nodes — HTML-escaped, no innerHTML); server
  validation + caps (email ≤ 320, chat ≤ 500); `.env` values stripped of newlines;
  session cookies `HttpOnly` + `SameSite=Lax`.

## [0.9.0] - 2026-06-28

### Changed
- The setup wizard is now the single place to configure an app, and it shows
  **all** add-ons: tick db/auth/realtime/mailer + fill their settings. Enabling
  is pure config — **Apply writes `.env`** (a `VOLT_ADDONS` list + settings) and
  **adds any needed packages to `package.json` + runs `npm install`**, then
  starts the app, which **auto-wires** whatever `.env` enables (auth routes,
  realtime sockets, db). Add-on code ships bundled under `.volt/addons`; nothing
  is copied into your `lib/`.
- `create-volt config` now just opens that in-app wizard (`server.js --edit`) —
  one implementation, localhost-only (shell/SSH access is the auth).

### Removed
- The standalone create-volt config page and its `--host`/key flags (superseded
  by the in-app wizard, which is localhost-only + SSH-tunnel for remote).

### Note
- Backend of an enabled add-on is wired automatically; the frontend UI (login
  form, chat) is yours to build — or start from `--template guestbook`.

## [0.8.0] - 2026-06-28

### Added
- **First-run setup wizard** baked into the app: on first run (no `.env`) or with
  `npm run dev -- --edit` (`-e`), `server.js` serves a disposable local config
  page; click **Apply** and it writes `.env`, loads it, and starts the app
  in-process — the setup page then disappears. It self-detects which add-ons are
  present and only asks for their settings.
- **Auto-open browser** on first run (and prints the link); skips opening on
  headless/remote boxes (no `DISPLAY`). Opt out with `--no-open` / `VOLT_NO_OPEN`.
- **`--start`** flag for `create-volt`: scaffold, then launch the dev server
  (which opens the setup page) in one go.
- **`.env` auto-loader** in templates — no `node --env-file` needed; reads the
  file directly, so it behaves identically on Windows/PowerShell.
- **Test connection** button in the wizard: actually connects with the entered
  DB credentials before you save.

### Changed
- `create-volt config` is **localhost-only by default** (shell/SSH access is the
  auth — no key). Expose on a LAN with `--host 0.0.0.0`, which then mints a key.

## [0.7.0] - 2026-06-28

### Added
- `create-volt config` — a disposable, key-gated local page (built with Volt) for
  add-ons. Tick the add-ons (or **All**), fill settings (DB driver/URL, SMTP,
  port), then **Apply**: it copies the add-on files into the app *and* writes
  `.env`, and shows copy-able install + wiring. Prints localhost **and** LAN
  links plus an SSH-tunnel hint for remote/headless boxes; a random key gates the
  page and the apply endpoint. Dependency-free (node:http). Run apps with
  `node --env-file=.env`.

### Removed
- The `create-volt add` command (from 0.6.0) — applying add-ons now happens
  through `create-volt config`, which both copies files and writes `.env`.

## [0.6.0] - 2026-06-28

### Added
- `create-volt add <integration>` — layer composable add-ons into an existing
  app instead of cloning whole templates. Copies self-contained files and prints
  the wiring (never edits your code); supports `--dry-run` and `--force`, and
  `create-volt add` with no name lists what's available. Integrations:
  - `db` — document store over memory / MongoDB / MySQL / Postgres
  - `mailer` — console (dev) / SMTP (prod) email
  - `auth` — magic-link login + sessions (builds on db + mailer)
  - `realtime` — Socket.io chat with rooms, presence, and typing

## [0.5.0] - 2026-06-28

### Added
- Multiple starter templates via `--template <name>`. The default stays the
  Counter + Todos demo; `--template guestbook` scaffolds a full real-world app:
  magic-link auth, Socket.io real-time, and pluggable **MongoDB / MySQL /
  Postgres** storage (with an in-memory dev fallback so it runs with no setup).

### Changed
- Templates now live under `templates/<name>/` (was a single `template/`).
- The "files created" summary is derived from the chosen template.

## [0.4.0] - 2026-06-28

### Added
- `create-volt update` command: refresh `public/volt.js` in an existing app to
  the library version bundled with create-volt. Run `npx create-volt@latest
  update` inside an app. Only touches the library file — never your `app.js`,
  `server.js`, or chosen port. Supports `--dry-run` to check without writing.

## [0.3.2] - 2026-06-28

### Changed
- Scaffolded apps' `README.md` now has a **Dev port** section explaining the
  date-derived port and how to override it (`PORT` env / `--port`).
- Package README shows `--port` directly in the Usage block.

## [0.3.1] - 2026-06-28

### Changed
- Internal: releases now publish from GitHub Actions via npm **Trusted
  Publishing** (OIDC, with provenance) — no functional changes to scaffolded apps.

## [0.3.0] - 2026-06-28

### Added
- `--port <number>` flag to set the new app's dev port.
- The dev port now **defaults to the creation date** (two-digit year + month +
  two-digit day, e.g. `2026-06-28` → `26628`), so apps scaffolded on different
  days don't collide. The chosen port is stamped into the generated `server.js`.

## [0.2.0] - 2026-06-28

### Added
- Git auto-init: scaffolded apps start as a git repository with an initial
  commit (`--no-git` to skip).
- `--dry-run` flag: preview the files and actions without writing anything.

## [0.1.0] - 2026-06-28

### Added
- Initial release. Scaffolds a no-build, signals-based Volt app: the `volt.js`
  library, a Counter + Todos demo, an Express + Socket.io dev server with file
  watching and full-page hot reload. Supports `--skip-install` and `--force`,
  and auto-detects npm / pnpm / yarn / bun for the install step.

[0.49.0]: https://github.com/MIR-2025/volt/releases/tag/v0.49.0
[0.48.3]: https://github.com/MIR-2025/volt/releases/tag/v0.48.3
[0.48.2]: https://github.com/MIR-2025/volt/releases/tag/v0.48.2
[0.48.1]: https://github.com/MIR-2025/volt/releases/tag/v0.48.1
[0.48.0]: https://github.com/MIR-2025/volt/releases/tag/v0.48.0
[0.47.0]: https://github.com/MIR-2025/volt/releases/tag/v0.47.0
[0.46.0]: https://github.com/MIR-2025/volt/releases/tag/v0.46.0
[0.45.1]: https://github.com/MIR-2025/volt/releases/tag/v0.45.1
[0.45.0]: https://github.com/MIR-2025/volt/releases/tag/v0.45.0
[0.44.0]: https://github.com/MIR-2025/volt/releases/tag/v0.44.0
[0.43.0]: https://github.com/MIR-2025/volt/releases/tag/v0.43.0
[0.42.0]: https://github.com/MIR-2025/volt/releases/tag/v0.42.0
[0.41.0]: https://github.com/MIR-2025/volt/releases/tag/v0.41.0
[0.40.0]: https://github.com/MIR-2025/volt/releases/tag/v0.40.0
[0.39.1]: https://github.com/MIR-2025/volt/releases/tag/v0.39.1
[0.39.0]: https://github.com/MIR-2025/volt/releases/tag/v0.39.0
[0.38.0]: https://github.com/MIR-2025/volt/releases/tag/v0.38.0
[0.37.0]: https://github.com/MIR-2025/volt/releases/tag/v0.37.0
[0.36.0]: https://github.com/MIR-2025/volt/releases/tag/v0.36.0
[0.35.0]: https://github.com/MIR-2025/volt/releases/tag/v0.35.0
[0.34.0]: https://github.com/MIR-2025/volt/releases/tag/v0.34.0
[0.33.0]: https://github.com/MIR-2025/volt/releases/tag/v0.33.0
[0.32.0]: https://github.com/MIR-2025/volt/releases/tag/v0.32.0
[0.31.0]: https://github.com/MIR-2025/volt/releases/tag/v0.31.0
[0.30.0]: https://github.com/MIR-2025/volt/releases/tag/v0.30.0
[0.29.0]: https://github.com/MIR-2025/volt/releases/tag/v0.29.0
[0.28.0]: https://github.com/MIR-2025/volt/releases/tag/v0.28.0
[0.27.0]: https://github.com/MIR-2025/volt/releases/tag/v0.27.0
[0.26.0]: https://github.com/MIR-2025/volt/releases/tag/v0.26.0
[0.25.0]: https://github.com/MIR-2025/volt/releases/tag/v0.25.0
[0.24.0]: https://github.com/MIR-2025/volt/releases/tag/v0.24.0
[0.23.0]: https://github.com/MIR-2025/volt/releases/tag/v0.23.0
[0.22.0]: https://github.com/MIR-2025/volt/releases/tag/v0.22.0
[0.21.0]: https://github.com/MIR-2025/volt/releases/tag/v0.21.0
[0.20.0]: https://github.com/MIR-2025/volt/releases/tag/v0.20.0
[0.19.0]: https://github.com/MIR-2025/volt/releases/tag/v0.19.0
[0.18.0]: https://github.com/MIR-2025/volt/releases/tag/v0.18.0
[0.17.0]: https://github.com/MIR-2025/volt/releases/tag/v0.17.0
[0.16.0]: https://github.com/MIR-2025/volt/releases/tag/v0.16.0
[0.15.1]: https://github.com/MIR-2025/volt/releases/tag/v0.15.1
[0.15.0]: https://github.com/MIR-2025/volt/releases/tag/v0.15.0
[0.14.0]: https://github.com/MIR-2025/volt/releases/tag/v0.14.0
[0.13.0]: https://github.com/MIR-2025/volt/releases/tag/v0.13.0
[0.12.0]: https://github.com/MIR-2025/volt/releases/tag/v0.12.0
[0.11.0]: https://github.com/MIR-2025/volt/releases/tag/v0.11.0
[0.10.0]: https://github.com/MIR-2025/volt/releases/tag/v0.10.0
[0.9.0]: https://github.com/MIR-2025/volt/releases/tag/v0.9.0
[0.8.0]: https://github.com/MIR-2025/volt/releases/tag/v0.8.0
[0.7.0]: https://github.com/MIR-2025/volt/releases/tag/v0.7.0
[0.6.0]: https://github.com/MIR-2025/volt/releases/tag/v0.6.0
[0.5.0]: https://github.com/MIR-2025/volt/releases/tag/v0.5.0
[0.4.0]: https://github.com/MIR-2025/volt/releases/tag/v0.4.0
[0.3.2]: https://github.com/MIR-2025/volt/releases/tag/v0.3.2
[0.3.1]: https://github.com/MIR-2025/volt/releases/tag/v0.3.1
[0.3.0]: https://github.com/MIR-2025/volt/releases/tag/v0.3.0
[0.2.0]: https://github.com/MIR-2025/volt/releases/tag/v0.2.0
[0.1.0]: https://github.com/MIR-2025/volt/releases/tag/v0.1.0
