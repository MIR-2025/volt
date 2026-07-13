# Changelog

All notable changes to `create-volt` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.83.0] - 2026-07-13

### Added
- **Custom color palette from one picked color.** Set `SITE_BG` (and optionally `SITE_ACCENT`) and the pages
  add-on derives a full palette -- surface, text, muted, borders, a complementary accent, and text-on-accent --
  for both light and dark, with contrast checked so text stays readable. Emitted as a `data-scheme="custom"`.
  Adds named content tokens `--accent`, `--ok`, `--warn`, `--danger` for use in content.
- **A default site footer.** Every page gets a `(c) <year> <site name>` footer. Set `SITE_FOOTER=off` to hide it,
  or drop a `pages/_footer.html` to replace it.
- **`[pay]` / `[donate]` payment shortcode.** Renders a button that opens a payment link you configure
  (`PAY_LINK`, with `PAY_LABEL` for the text); `[pay label="..." link="..."]` overrides per button. The link
  points at your own processor's hosted checkout -- no keys or customer data pass through Volt.

## [0.82.0] - 2026-07-10

### Added
- **Invisible proof-of-work spam protection in the `antispam` add-on** (via the new zero-dep
  [`pow-captcha-js`](https://www.npmjs.com/package/pow-captcha-js)). A stateless HMAC challenge the
  visitor's browser solves in ~1s -- no puzzle, no third party, no visitor tracking -- so spam pays CPU
  per submission while a human pays nothing they'll notice. It layers into the existing verdict
  alongside the honeypot, time-trap, rate-limit, and content heuristics: a missing, tampered, or
  replayed proof is treated as spam outright. The `/pow` and `/pow.js` routes mount automatically.
  Enable per-form with `app.locals.spam.fields({ pow: true })`, or on every form with `ANTISPAM_POW=1`.
  Tune difficulty with `POW_BITS` (default 18; +1 bit doubles an attacker's cost) and the endpoint with
  `ANTISPAM_POW_PATH`. The instance is exposed as `app.locals.spam.pow` for direct use.

## [0.81.0] - 2026-07-10

### Added
- **Every site gets a `/sitemap.xml` + `/robots.txt`.** The pages add-on now generates a sitemap listing every
  page (and post, when the posts add-on is on) at its **real route** -- honoring `permalink:`, so a migrated
  WordPress site’s original URLs land in the sitemap. `robots.txt` points crawlers at it. URLs are absolute when
  `SITE_URL` is set, relative otherwise. Regenerated on every publish; the publish crawler also uses it to find unlinked pages.

## [0.80.0] - 2026-07-09

### Added
- **The web-admin content editor is now WYSIWYG.** The `admin` add-on’s Content panel edits pages + posts
  in a rich editor (RTEPro’s no-AI, no-key base, `rte-rich-text-editor`) instead of a raw textarea: format with a
  toolbar, paste images (extracted to `public/media/`), save. Content stays **markdown on disk** -- the editor loads
  it via `marked`→setHTML and saves via `getMarkdown()`. Front matter (title, date, tags, permalink…) is preserved
  in a collapsible field, so WordPress-migrated metadata round-trips untouched. Ships automatically in new sites;
  degrades gracefully to a markdown textarea if the editor package isn’t installed.
- **`create-volt update` now installs new add-on dependencies.** When a refreshed add-on declares a new npm dep
  in its `meta.json` (like this release’s editor), `update` merges it into `package.json` and installs it -- so the
  web-admin “Update” button fully upgrades add-ons, not just their code.

## [0.79.1] - 2026-07-09

### Fixed
- **Web admin threw `Uncaught SyntaxError` and the panel did nothing (0.79.0 regression).** The new-content
  helper built its front-matter with `\n`, which the admin page’s own template literal collapsed into real
  newlines *inside* a single-quoted JS string -- an unterminated string that killed the entire inline script.
  Now built with `String.fromCharCode(10)`. Verification now parses the actual rendered inline script.

## [0.79.0] - 2026-07-10

### Added
- **Create / edit / delete pages + posts from the web admin.** The `admin` add-on gains a **Content** panel:
  list your pages + posts, open one in a markdown editor, save (live on the next page load), delete, or create a
  new page/post -- the WordPress "edit my site from the browser" core, no `:5050` wizard needed. Pasted/inline
  base64 media is extracted to `public/media/`. Safe-slug validation; session-gated.
- **`ADMIN_EMAIL` accepts a comma-separated allowlist.** Multiple admins can each sign in with a magic link (it
  goes to whichever listed address requested it); unlisted addresses get nothing.

## [0.78.0] - 2026-07-10

### Fixed
- **Web admin Typography panel now reflects the site's actual fonts.** `/api/fonts` read the current
  selection only from `.volt/fonts.json` (the live override), so on an app whose fonts are set via `.env`
  (`FONT_HEADING`/`FONT_SUBHEAD`/`FONT_BODY`/`FONT_MONO` -- e.g. a WordPress migration) the four role selects
  fell back to "System default" and previewed nothing. It now computes the effective fonts the same way the
  theme does (`.env` base, overridden by `.volt/fonts.json`), so the panel shows + previews the fonts in use.

## [0.77.0] - 2026-07-09

### Added
- **Featured images render natively.** A page/post's `image:` front-matter now renders as a leading
  hero `<figure class="post-hero">` on the single post AND as a `<img class="post-thumb">` on the blog
  index -- not just `og:image`, so a migrated post's featured image shows on the page.

### Fixed
- **`npm run dev` no longer lies about "already running -- reloaded it".** On `EADDRINUSE`, the server now
  confirms the process on the port is genuinely a Volt instance (a marker in the `/__volt/reload` response)
  before it reloads + exits. If a foreign/stale process holds the port, it **fails loudly** -- "port N is in
  use by another process -- free it, or start on a different port" (exit 1) -- instead of pretending success
  while the new app silently never starts.

## [0.76.0] - 2026-07-09

### Added
- **`npm run dev` opens the browser to the running app.** The scaffolded server now opens
  `http://localhost:<port>` on a normal dev listen (the setup wizard already opened its own port on
  first run). Guarded: skips in CI, with no TTY, on headless Linux (no `DISPLAY`), and honors
  `--no-open` / `NO_OPEN` / `VOLT_NO_OPEN`. Closes the "nothing happened" gap after a migration.
  (The 5 setup-wizard templates; the standalone `guestbook` demo is unchanged.)

## [0.75.0] - 2026-07-09

### Changed
- **Add-on npm deps now carry pinned versions in each add-on's `meta.json` `install`** -- a
  `{ "<pkg>": "<semver>" }` object (was a bare name array). This is the **single source of truth**
  for an add-on's deps: create-volt reads it when merging deps into a scaffold's `package.json`, and
  `@voltjscom/wp-volt` reads the same file instead of mirroring a copy -- no more version drift across
  repos. A legacy `["<pkg>"]` array still works (pinned to `latest`). Removed the internal
  `ADDON_DEP_VERSIONS` map, and corrected `marked` to `^18.0.5` to match the templates.

## [0.74.0] - 2026-07-09

### Changed
- **A fresh site's home is now a clean themed welcome, not the Volt framework demo.** With no
  `pages/index.md` and no `HOMEPAGE` set, the pages add-on renders a minimal "Welcome to <site> --
  your site is ready" page in the site's OWN theme (with its nav), instead of falling through to the
  `views/index.html` framework showcase. No boilerplate `index.md` is written, so it never shadows
  `HOMEPAGE=posts` (blog-home migrations stay intact). Add `pages/index.md`, or set the home in the
  web admin, to replace it.

## [0.73.0] - 2026-07-08

### Added
- **Set the home page from the web admin** -- the WordPress "Settings → Reading" equivalent. The admin
  add-on gains a **Home page** card: choose what `/` shows -- **Default landing**, **Your latest posts**
  (blog index), or **a static page** -- which writes `HOMEPAGE` to `.env` (takes effect on restart).
  Especially for WordPress migrators: change post-migration what wp-volt inferred from `show_on_front`.
- **`HOMEPAGE=<page-slug>`** promotes any page to the front page (a "static front page"), complementing
  `HOMEPAGE=posts` (blog index, 0.70.0). The chosen page keeps its own URL too. Wired into every
  template's `/` handler + the pages add-on.

## [0.72.0] - 2026-07-08

### Added
- **`import-wp` accepts the domain-control challenge (`--verify <token>`)** as an alternative to
  `--user` + `WP_APP_PASSWORD`, in lockstep with `@voltjscom/wp-volt@0.1.4`. A live-URL migration
  now proves authorization by EITHER (A) a WordPress Application Password OR (B) `--verify <token>` --
  run `npx @voltjscom/wp-volt verify <url>`, drop the token at `/.well-known/wp-volt-challenge`, then
  re-run with it (domain control = authorization, no wp-admin needed). `--verify` is forwarded to wp-volt.

## [0.71.0] - 2026-07-08

### Changed
- **`import-wp <url>` now requires WordPress auth** -- matches `@voltjscom/wp-volt@0.1.3`'s
  ownership gate: a live-URL migration must prove authorization (it's not an open site-cloner).
  Pass `--user <wp-user>` and set `WP_APP_PASSWORD` (a WordPress Application Password, read from
  the env -- never argv). `--drafts` and `--prefix` are forwarded to wp-volt too. `import-wxr` /
  `import-wp-db` are unaffected (possessing the file/DB proves access).

## [0.70.0] - 2026-07-08

### Added
- **Posts-home + permalink-aware internal links -- completes WordPress URL preservation.**
  - **`HOMEPAGE=posts`** mounts the blog index at `/` (true preservation, not a `/`→`/blog`
    redirect), so a WordPress site whose front page IS the blog keeps `/` as its home URL. An
    explicit `pages/index.md` still wins. `@voltjscom/wp-volt` sets this for posts-home migrations.
  - The **blog index and RSS feed now link each post at its `permalink:`** when present, so a
    migrated site links internally to the original WordPress URLs, not the `/blog/<slug>` alias.

## [0.69.0] - 2026-07-08

### Added
- **URL preservation for migrations -- `permalink:` routing + `_redirects`.** A page or post
  carrying a `permalink:` front-matter field is served at that EXACT path (multi-segment,
  trailing-slash tolerant), overriding the default `/<slug>` / `/blog/<slug>`, and emits it as
  `<link rel="canonical">`. A root `_redirects` file (Netlify-style `<from> <to> [status]`,
  default 301) redirects legacy URLs that have no page/post (feeds, archives). So a site migrated with `@voltjscom/wp-volt` keeps its original URLs and canonical tags.

## [0.68.2] - 2026-07-08

### Changed
- **Removed the lightning-bolt glyph from create-volt's branding** -- the CLI banners, the
  scaffold READMEs, and the package README -- per a brand decision to drop lightning
  imagery. No functional change.

## [0.68.1] - 2026-07-08

### Fixed
- **Scaffolds now declare their enabled add-ons' npm deps.** A generated app's
  `package.json` was missing deps its enabled add-ons import (e.g. `pages`/`posts` need
  `marked`, `media` needs `busboy`) -- previously they only got installed if you opened the
  5050 setup wizard. So an app scaffolded with `--skip-install`, or configured via `.env`
  (`VOLT_ADDONS=…`) and deployed straight to a server, crashed with `Cannot find package
  'marked'`. The scaffolder now merges each enabled add-on's `install` deps into
  `package.json`, making it the complete source of truth regardless of the wizard.

## [0.68.0] - 2026-07-07

### Changed
- **WordPress import now delegates to `@voltjscom/wp-volt`** -- the full WordPress→Volt migrator.
  `import-wxr` / `import-wp` / `import-wp-db` are thin front-ends for `wp-volt migrate <source>
  --out <dir>`, which writes a **complete** Volt tree (`pages/` + `posts/` + `public/media/` +
  `pages/_nav.md`) instead of the old flat `pages/` dump. Your app's existing `.env` is preserved
  (the migrated site config is stashed as `.env.migrated` for reference).

### Removed
- The in-tree readers `lib/import-wxr.js` + `lib/import-wp-db.js` and their tests -- superseded by
  `@voltjscom/wp-volt`. Deltas in v1: no `--drafts`/auth and no `--prefix` (published content only,
  default `wp_` prefix); passing them prints a note.

## [0.67.0] - 2026-07-07

### Changed
- **MIR never emits for localhost / private-network apps.** `volt-addon-mir`'s `submitEvent`
  now hard-skips when `SITE_URL` is localhost, a private IP, `.local`, or unset -- **regardless of
  `MIR_EMIT`** -- so dev and test events can never pollute a partner's production reputation data.
  `resolveUser` (a read) is unaffected. (The voltjs.com gateway applies the same guard on the
  request host.)

## [0.66.0] - 2026-07-07

### Changed
- **MIR registration is idempotent per app.** `volt-addon-mir`'s register now sends the app's
  domain (from `SITE_URL`) as a stable `slug`, so a redeploy or a re-run of the config resolves to
  the **same** MIR partner instead of fragmenting the app's customers across new partner rows -- *an
  app is a partner; a deployment is not.* A taken slug returns `409` and is treated as
  already-registered (the key is already in `.env`).

## [0.65.0] - 2026-07-07

### Added
- **Typography -- self-hosted fonts, chosen per role, with live previews.** Pick a font for
  **Headings / Subsections / Body / Code** from a curated 14-font catalog (Inter, Roboto, Poppins,
  Merriweather, Lora, JetBrains Mono, …). Chosen fonts are **downloaded and self-hosted** into
  `public/fonts/` -- nothing loads from Google on the live site (no visitor-IP leak; the WordPress
  self-hosting-plugin problem, solved natively). The theme exposes `--font-heading` /
  `--font-subhead` / `--font-body` / `--font-mono` variables (an unset role cascades body → system).
  - Set them in the **5050 config** (writes `FONT_*` to `.env`) **or the web admin** (writes
    `.volt/fonts.json`, a live override applied on the next page load -- no restart, no `.env` edit).
  - Both pickers **render each font in its own typeface** and show a **live specimen panel**; the
    preview fonts load from a CDN in the admin page only, so the public site stays fully self-hosted.

## [0.64.0] - 2026-07-06

### Added
- **SQLite is the default database.** New `sqlite` driver on Node's **built-in `node:sqlite`**
  (zero dependency) -- persistent to `.volt/data.db` with no server to run, WAL mode, JSON
  filter pushdown + expression indexes. `DB_DRIVER` now defaults to `sqlite` (was `memory`); on
  Node < 22.5 it falls back to in-memory with a warning. Fills the gap between ephemeral
  (memory) and needs-a-server (mongo/mysql/postgres) -- a new site persists with zero infra.
- **Query pushdown + pagination on every driver.** `find(query, { limit, offset, sort, dir })`
  and `all(opts)` now filter **in the database** (JSON extraction) instead of reading a whole
  collection into Node, and paginate. Field names are validated (injection-safe). Mongo uses
  native cursors; SQL/SQLite use `json_extract` / `->>`.
- **`store.index(coll, field)`** -- index a JSON field so `find()`/sort stops scanning: a
  generated-column index (MySQL/MariaDB), a composite functional index (Postgres), an
  expression index (SQLite), a native btree index (Mongo), a no-op (memory).
- **Seed data (`data/*.json`).** Each `data/<name>.json` (an array of docs) seeds the `<name>`
  collection on first boot **only if it's empty** -- fixtures, demo content, or migration output.
  `_`-prefixed files are reserved (manifests). A doc's `id` is its key, else generated.
- **`volt-addon-antispam` -- built-in spam protection, no API key, no third party.** Layers a
  honeypot, a signed time-trap token, and content heuristics; a hard **429 at 20 known probes
  per IP**. `app.locals.spam.fields()` (embed) + `.check()` (verify). Nothing about a
  submission ever leaves the app.
- **Custom timezone + date format.** The config exposes an editable `SITE_TZ` and a new
  `SITE_DATE_FORMAT` (long / medium / dmy / dmy-short / iso) with a live preview; posts/pages
  render dates accordingly (display only -- stored dates stay ISO).
- **Nested navigation.** `pages/_nav.md` now supports 2-space-indented children → hover/focus
  **dropdowns** (expanded inline under the mobile hamburger). Active state bubbles to the parent.
- **YAML-array front-matter + multiple categories.** `parseFrontMatter` parses inline arrays
  (`tags: [a, b, c]`) and strips quotes; `category` accepts an array, so a post can be in
  multiple categories (renders + routes on all). Comma-strings and single values still work.
- **`SITE_URL` DNS affirmation** in the config -- checks the domain resolves on blur (existence,
  not ownership), catching typos before canonical/OG/RSS rely on it.

### Changed
- The DB picker labels **MongoDB "recommended at scale"** (native indexable queries) and SQLite
  the default for a single box; `memory` is marked dev-only.

## [0.63.1] - 2026-07-06

### Added
- **MIR emission is opt-in.** Being a registered MIR partner no longer means events flow:
  `submitEvent` is a **no-op until the owner opts in** -- a new *Emit participation events*
  checkbox in the config (`MIR_EMIT=on`). Sending data about your users to the registry is
  now a deliberate, separate consent step; `resolveUser` (a read) is unaffected. The startup
  log states whether events are emitting.

## [0.63.0] - 2026-07-06

### Added
- **`volt-addon-mir` -- Memory Infrastructure Registry participation.** Make an app a MIR
  *partner*; its users become *participants* who build portable, cross-partner reputation.
  The add-on serves the domain-verification challenge at `/.well-known/mir-challenge` and
  exposes `app.locals.mir { submitEvent, resolveUser }` to your routes (200 found / 202
  provisional / 404 unknown, surfaced distinctly). Onboarding is driven from the config:
  register a sandbox partner (email-gated), deploy, then **promote** to a production key
  once MIR verifies your domain. Only offered when `SITE_URL` is a public, DNS-resolving
  domain -- a localhost site can't be domain-verified. New `/docs/mir`.
- **`SITE_URL` DNS affirmation.** The config now checks that the domain actually resolves
  (on blur), catching typos before canonical / OG / RSS -- and MIR -- rely on it. Existence,
  not ownership: `✓ resolves` / `✗ doesn't` / a local-private note. Server-side lookup via
  a new `/setup/dns-check`.

## [0.62.0] - 2026-07-05

### Added
- **SPA / Normal navigation** (`SITE_SPA`). Off = normal full-reload navigation. On =
  a tiny turbo script intercepts internal link clicks and fetch-swaps the body (no
  reload) -- while **every URL stays fully server-rendered** (content, title, meta,
  canonical, OG), so **SEO is unaffected**. It's the Turbolinks/htmx model, not a
  client-rendered SPA: crawlers get complete HTML and ignore the script. Delegated on
  `document` (survives swaps), re-runs inline scripts (hero re-inits), falls back to a
  real navigation on any error.
- **Admin IP allowlist** (`ADMIN_ALLOW_IPS`). A comma-separated list gates the whole
  admin path before any route -- a non-listed IP gets a plain **404** (can't even reach
  the login form or `/request`). Prefers `X-Real-IP` for reverse-proxy setups; config
  field in the Web-admin section; blank = any IP (the magic link is still required).
- **Themed 404 page.** An unknown path now renders a real 404 **in the active theme**
  (with nav) instead of Express's bare "Cannot GET". Override the copy with
  `pages/404.md`.

## [0.61.0] - 2026-07-05

### Added
- **Media roles.** In the config's **Media library**, assign a file as **Logo /
  Favicon / OG image / Hero**. Logo (`SITE_LOGO`) swaps the brand text for the image
  across every theme; Favicon (`SITE_FAVICON`) sets the `<head>` icon + apple-touch
  on every page; **Hero (`SITE_HERO`) fills any `.volt-hero` slot -- one image, or
  several → a fading vanilla-JS carousel** (the business template's hero is
  pre-marked). OG image (`OG_IMAGE`) was already wired.

### Fixed
- **Auto-canonical + og:url.** Every page **and** post now emits
  `<link rel="canonical">` and `og:url` from `SITE_URL` + the request path, unless the
  front-matter overrides -- closing an SEO gap where they only appeared if added by hand.

## [0.60.0] - 2026-07-05

### Added
- **Configured header menus + responsive nav.** `pages/_nav.md` -- a Markdown link
  list -- defines the header menu (reorder, rename, external links). Every theme
  (default, paper, midnight, classic, business) renders it with **active-link
  marking** and a **CSS-only hamburger** under 640px. `loadNav` + shared nav
  classes/CSS live in the pages add-on; templates ship a starter `_nav.md`.

### Fixed
- **Blog/post pages now get the color scheme + mode + nav.** `posts.js` rendered
  through the theme but skipped `injectScheme` and passed no nav -- so blog pages
  ignored `SITE_SCHEME`/`SITE_MODE` and had no menu. Now consistent with pages.
- **Config buttons invisible in light mode.** The `.env` card's "Manage content →"
  and "Media →" were `btn-outline-light` (white-on-white in light mode) → now
  `btn-outline-secondary`, readable in both.

## [0.59.0] - 2026-07-05

### Added
- **Guided first-run wizard.** First run (no `.env`) now walks through setup **one
  step at a time** -- Name → Features → Appearance → Database → Email → Web admin →
  AI → Review & launch -- with a progress bar, per-step validation (e.g. the web-admin
  email is required before you can continue), a live `.env` preview, and steps that
  appear only for the features you turned on. `--edit` keeps the dense all-at-once form.
- **Light / Dark / Auto mode.** A `SITE_MODE` toggle beside the color scheme: **Auto**
  follows the visitor's device, **Light/Dark** force it (`data-theme` stamped
  server-side, no flash). Works with any scheme; the default theme honors forced dark.
- **Full-bleed content.** A theme-side `.full-bleed` utility (appended to every
  theme's `/_theme.css`) breaks a flagged block out of the readable column to full
  viewport width -- a hero image or video -- with **no editor change**.

## [0.58.1] - 2026-07-05

### Added
- **Web admin: "View site →" and "Restart" in the header.** After an edit, one click
  opens the live site to check it (content + media changes are live instantly -- no
  restart needed); Restart is there only for theme/settings changes.
- **Config: a "Copy" button on the admin URL** (just before Regenerate) that copies
  the full admin URL (`SITE_URL` + path) to the clipboard.

## [0.58.0] - 2026-07-05

### Added
- **Scoped server actions in the web admin.** The admin gains **Update / Pull /
  Restart** buttons -- a *fixed whitelist* of commands (`npx create-volt@latest
  update`, `git pull --ff-only`, and a process restart), with output streamed live
  to the page. It is explicitly **not** a shell: the button name is a key lookup, no
  user string ever reaches a command. Lets an owner who can't SSH run the common
  server operations (update, pull content, restart under pm2/docker/systemd) without
  exposing arbitrary command execution.

## [0.57.0] - 2026-07-05

### Added
- **Color schemes.** Eight curated palettes (Slate, Ocean, Indigo, Rose, Forest,
  Amber, Mono, High-contrast), each with a light + dark set, chosen from a swatch
  picker in the config (`SITE_SCHEME`) and stamped on `<html>` server-side (no
  flash). A scheme swaps only the *palette*: every bundled theme (default, paper,
  midnight, classic) and the `business` template now share one token contract
  (`--bg`/`--surface`/`--ink`/`--muted`/`--line`/`--brand`/`--brand-ink`), so one
  theme × eight schemes = eight looks. The bare default keeps its automatic OS
  light/dark.
- **`volt-addon-admin` -- secure web admin.** Manage content + media on the *live*
  site without shell access, at a secret `ADMIN_PATH` behind a hardened magic link:
  a one-time **nonce**, a **same-browser challenge cookie** (a secret planted in the
  browser that requested the link, which the click must present), and a **device
  fingerprint** -- a link opened in a different browser/device is rejected. Signed
  stateless sessions, gated to `ADMIN_EMAIL`, rate-limited, no account enumeration.
  Enable it in the config and it generates an unguessable `ADMIN_PATH` + a 256-bit
  `ADMIN_SECRET` automatically.

## [0.56.1] - 2026-07-05

### Fixed
- **Media library thumbnails / editor image previews showed as broken inside the
  config.** The config server served a fixed asset allowlist and had no `/media/`
  route, so uploaded files 404'd in the config UI -- even though they uploaded fine
  and render on the live site (the running app serves them via `express.static`).
  The config now serves `public/media/<name>` with a path-traversal guard.

## [0.56.0] - 2026-07-05

### Added
- **Full site templates.** `--template business` scaffolds a complete multi-page
  site (Home, About, Products, Contact) with a sticky-nav theme, hero, product grid,
  CTA, and swap-your-own media slots -- the "install a theme with demo content, then
  make it yours" experience.
- **Media library in the config.** A new **Media** view uploads / browses / deletes
  images and video (stored in `public/media/`, served at `/media/<name>`) -- a
  Bootstrap card grid with thumbnails, copy-URL, and delete.
- **Editor media, de-base64'd on save.** RTEPro's built-in picker inlines "Choose
  File" uploads as base64; on save they're extracted to `public/media/<hash>.<ext>`
  (content-hash deduped) and the `src` rewritten to a `/media` URL, so pages stay
  lean and editor uploads land in the library.

### Fixed
- **Boolean attributes.** `readonly=${false}` (and `required`/`multiple`/`hidden`/…)
  now correctly turn the attribute OFF -- any value, including the string `"false"`,
  previously left it on. `readonly` also maps to the `readOnly` DOM property.
- **Hosted-token button.** "Generate a free hosted token" shows its result inline
  next to the button, with a clear message when the gateway isn't reachable (was a
  silent failure buried in the status line).
- `default/server.js` now imports `node:crypto` -- it had relied on the global Web
  Crypto, which has no `createHash`.

## [0.55.1] - 2026-07-05

### Security
- **Bump the scaffold's nodemailer pin `^6.10.1` → `^9.0.3`.** nodemailer <= 9.0.0
  carries several high-severity advisories (email to an unintended domain, SMTP/CRLF
  command injection, addressparser DoS, improper TLS validation, file-read/SSRF).
  Apps that enable the mailer add-on now install the fixed 9.x -- same
  createTransport/sendMail/verify API, no code change.

## [0.55.0] - 2026-07-05

### Added
- **Inline "Test" buttons for SMTP + AI in the config wizard** -- the result shows
  right next to each button. `/setup/test-smtp` verifies connection/auth (nodemailer,
  or a TCP reachability fallback); `/setup/test-ai` does a 1-token live call to the
  provider key or the hosted gateway. The DB test result is inline now too.

## [0.54.0] - 2026-07-05

### Added
- **Config editor renders themed.** The in-config WYSIWYG loads the active theme's
  CSS (new `/setup/theme-css` → RTEPro `exportCSS`), so pages look like the published
  site as you edit -- new pages included.

### Fixed
- **Log analytics bot/attack counts were always 0** -- they read `.bot`/`.attack`,
  but mir-sentinel's parseLine returns `.isBot`/`.isAttack`. Fixed in `--logs`.

## [0.53.0] - 2026-07-04

### Added
- **`create-volt env`** -- writes a documented `.env.example` for a deploying admin
  to fill in: every var grouped and commented, structural values (PORT, SITE_NAME,
  VOLT_ADDONS…) seeded from an existing `.env`, secrets left blank. `--print` to
  stdout, `--force` to overwrite.

## [0.52.0] - 2026-07-04

### Added
- **Mailer accepts discrete SMTP vars.** The mailer add-on builds its transport
  from `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS` when
  `SMTP_URL` is not set (secure defaults on for port 465), and resolves the From
  address as `MAIL_FROM` → `SMTP_FROM` → `SMTP_USER`. So a plain host/port/user/pass
  config works without composing a URL.

## [0.51.0] - 2026-06-30

### Added
- **Generate a hosted-AI token from the config.** The wizard's AI section has a
  **Generate a free hosted token** button: it self-registers with the voltjs.com
  gateway (new public, rate-limited `POST /api/register`) and writes
  `VOLT_AI_TOKEN` to `.env` on Apply. One click to the free-capped/pay-as-you-go
  hosted tier when you have no key of your own.

## [0.50.0] - 2026-06-30

### Added
- **Config editor AI falls back to the hosted gateway.** With no local provider
  key, `/setup/ai` routes through the voltjs.com gateway via `VOLT_AI_TOKEN`
  (free-capped, then pay-as-you-go on the host's key); a local key still wins
  (BYO). Clear error when neither is set. The gateway now honors the client's
  stream preference, so the editor gets a normal JSON response.

## [0.49.0] - 2026-06-30

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
  `min(1200px, 95vw)`) while settings stay a readable 720px -- view-responsive.

## [0.48.1] - 2026-06-29

### Changed
- Config WYSIWYG loads RTEPro at a **major-version float** (`@1`) instead of a
  pinned patch, so RTEPro 1.x updates flow without a create-volt release. Dropped
  the marked dependency entirely -- RTEPro takes markdown directly via setMarkdown().

## [0.48.0] - 2026-06-29

### Added
- **WYSIWYG editor in the config.** Manage content embeds the RTEPro rich editor
  (loaded from CDN) instead of a raw textarea -- visual editing, shell-gated, no
  public route or auth. Opens markdown rendered to HTML, saves markdown (or HTML
  for complex layouts), with a title field beside the slug.

## [0.47.0] - 2026-06-29

### Added
- **Config shows the create-volt version** at the top, always; with `(X available)`
  + an Upgrade button when behind, `(up to date)` otherwise.
- **Light-mode switcher** in the config wizard (top-right; persists; defaults to dark).

### Fixed
- **Content-editor textarea** showed a template placeholder instead of the page
  body -- now binds the body via the value property.

## [0.46.0] - 2026-06-29

### Added
- **`update` self-heals `server.js` startup-log encoding.** Older scaffolds had
  byte-corrupted bolt/arrow/ellipsis/dash characters in their console logs;
  `create-volt update` (and the config wizard Upgrade button, which runs it) now
  surgically repairs them -- rewriting the brand log lines to plain ASCII and
  swapping the corrupted byte-runs -- with no change to your logic.

## [0.45.1] - 2026-06-29

### Fixed
- **.env inline comments.** `KEY=value # note` now parses to `value` (trailing
  comment stripped); quoted values stay literal. Previously the comment became
  part of the value.

## [0.45.0] - 2026-06-29

### Added
- **Buy AI credits from the config wizard.** When an app uses the hosted gateway
  (`VOLT_AI_TOKEN` set), the `--edit` wizard shows an **AI credits** card -- live
  balance + tier, and top-up buttons that open Stripe Checkout. The purchase flow
  lives in the (shell-gated) config only; the running app never exposes it.
  Proxied via `/setup/ai-credits` + `/setup/ai-credits/checkout` to the gateway.

## [0.44.0] - 2026-06-29

### Added
- **`--logs` -- a built-in log viewer** on its own localhost port (like `--studio`):
  `npm run logs`. Tails pm2 stdout/stderr **out of the box**; an Analytics tab
  parses Apache/nginx access logs via `mir-sentinel` (optional dep) → top
  paths/status/IPs + bot/attack counts. **Add more sources** (other apps, servers,
  mounted/tunneled paths) right in the viewer -- saved to `.volt/logs.json`.
  Localhost-only; SSH-tunnel the port for a remote box.

## [0.43.0] - 2026-06-29

### Added
- **Upgrade from the wizard.** Scaffolds record their version in `.volt/version`;
  the `--edit` wizard checks npm and shows an "create-volt X available" notice with
  a one-click **Upgrade** button (runs `npx create-volt@latest update`).
- **`update` refreshes everything framework-owned** -- vendored runtime
  (`volt.js`, `volt-ssr.js`), the setup wizard, and bundled add-ons + themes (was
  just `volt.js`). Your `server.js` + content are left untouched.
- **Simpler AI setup.** The wizard AI section is clearly optional with a
  per-provider **Get a key →** link (Anthropic / OpenAI / Gemini); leave it blank
  and the editor works without AI.

## [0.42.0] - 2026-06-29

### Added
- **Content manager in the config wizard.** `npm run dev -- --edit` has a
  **Manage content →** view: list, create, edit (raw markdown), and delete pages
  + posts, via new slug-validated `/setup/content*` endpoints. The config page is
  a content dashboard now, not just settings.

### Fixed
- **Garbled characters in startup logs.** The `→`/`…`/`--` in server logs and
  source comments had been byte-corrupted (mojibake) by an earlier tooling pass.
  Console output is now clean ASCII ("Volt at http://…", "Volt setup at …").

## [0.41.0] - 2026-06-29

### Added
- **PM2 support.** Scaffolds ship `ecosystem.config.cjs` + scripts: `npm run pm2`
  (start under pm2 -- fetched via npx if not installed, or uses your global pm2),
  `pm2:restart` (clean reload, no port clash), `pm2:logs`, `pm2:stop`.
- **`npm run dev` on an already-running app reloads it instead of crashing.** A
  second start detects the in-use port, pings the running instance's new
  `/__volt/reload` route to refresh browsers, prints a note, and exits 0 -- no
  more `EADDRINUSE` stack trace.

## [0.40.0] - 2026-06-29

### Added
- **Themed front page.** `pages/index.md` now takes over `/` (rendered in your
  theme), so a content site's home matches the rest of the site instead of
  showing the demo `views/index.html`. With no `pages/index.md`, `/` stays the
  app's index.html. (Answers: "I chose a theme but the home page was unchanged" --
  the theme styles pages/posts; the home needs to *be* a page.)

## [0.39.1] - 2026-06-29

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
  morphs the DOM in place -- scroll position and page state preserved, no full
  reload. Nothing is injected in production.

## [0.38.0] - 2026-06-29

### Added
- **Smart hot reload (live DOM morph).** Editing markdown / HTML / templates now
  patches only the changed DOM nodes instead of a full page reload -- focus, caret,
  scroll, and untouched subtrees survive. CSS edits swap the stylesheet in place;
  JS edits (and client-rendered `#app` pages) still do a full reload, and any morph
  error falls back to one. The watcher tells the client which file changed.
- **Themes hot-reload in dev.** Editing `_theme.js` / `_theme.css` / a bundled
  theme now reflects immediately -- theme imports are mtime cache-busted in dev
  (previously a restart was needed). Pages + posts share the live resolver
  (`themeResolver`).

## [0.37.0] - 2026-06-29

### Added
- **Bundled themes + a wizard theme picker.** create-volt ships paper/midnight/
  classic under `.volt/themes`; the setup wizard has a **Theme** dropdown (no npm
  needed) with a **Customize** button that copies the chosen theme to
  `pages/_theme.js` for editing. `THEME` now also resolves bundled themes.
- **More wizard settings:** `SITE_NAME`, `SITE_URL`, `CONFIG_PORT`, and optional
  **AI keys** (`AI_PROVIDER` + Anthropic/OpenAI/Gemini key -- written to `.env`,
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
  files (`_theme.js`) still need a restart -- ES modules cache.

### Fixed
- The `blog` + `docs` templates had drifted from `default`s `server.js`/wizard and
  silently missed recent fixes (including the hot-reload watcher). Re-synced, with
  a test that fails if they drift again.

## [0.35.0] - 2026-06-29

### Fixed
- **Setup wizard: dependency add-ons now show as checked.** Enabling `auth` pulls
  in `db` + `mailer` (its dependencies), which were added to `VOLT_ADDONS` but
  whose checkboxes stayed *unchecked* -- so the generated `.env` looked like it had
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
  app -- no wizard.

### Fixed
- Dark-on-dark text in the default + starter apps: `.text-muted` is overridden to
  a readable color on the dark background (the demo footer caption was dropped).
- `posts`: `YYYY-MM-DD` dates render on the correct day (parsed as local, not UTC).

## [0.32.0] - 2026-06-29

### Changed
- **Brand refresh:** the lightning glyph is replaced with the Volt logo across the demo
  app, the setup wizard, and Studio; scaffolded apps now ship `logo.webp` +
  `favicon.webp` and link a favicon (so apps get a real tab icon). README titles
  keep the lightning bolt.

## [0.31.0] - 2026-06-29

### Added
- **`posts` add-on -- a blog (the WordPress content model).** Markdown in `posts/`
  becomes a paginated index at `/blog`, single posts at `/blog/<slug>`, plus
  `/category/<name>`, `/tag/<name>`, and an RSS feed at `/feed.xml`. Posts carry
  date/author/category/tags front-matter (date can also come from a
  `YYYY-MM-DD-` filename prefix); drafts (`draft: true`) are skipped. Renders in
  the site theme and reuses pages' SEO -- single posts get an auto Article
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
  no longer reassigns `node.value` when it already equals the new value -- those
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
  (mongodb / mysql2 / pg, at the pinned version) before testing -- it used to fail
  with "<driver> isn't installed" because the package is only added on Apply.
  Also adds the missing `spawnSync` import.

## [0.27.0] - 2026-06-29

### Fixed
- **Reactive crash on conditional re-render** (`volt.js`) -- a signal write
  notified a *snapshot* of subscribers, so a parent reactive block that disposed
  a nested one mid-update would still run the stale nested effect on detached DOM
  ("Cannot read properties of null (reading 'insertBefore')"). Disposed effects
  now skip their queued run, and `renderRange` guards against a detached range.
  Fixes the **setup wizard** crashing when toggling add-ons or changing the DB
  driver. Regression-tested in the headless-browser suite.

## [0.26.0] - 2026-06-29

### Added
- **Themes / shared layout for the `pages` add-on** -- pages render into a layout:
  (1) `pages/_header.html` + `_footer.html` partials (no code); (2) a local
  `pages/_theme.js` exporting `layout({ title, head, content, meta })` (+ optional
  `css`); (3) a third-party `volt-theme-<name>` package selected with
  `THEME=<name>`. `create-volt create-theme <name>` scaffolds one. Resolution:
  THEME → local `_theme.js` → built-in default.
- **One stylesheet for page + editor** -- the active theme's CSS is served at
  `/_theme.css` (a theme's `export const css`, or `pages/_theme.css`, or the
  default). Pages link it, and the WYSIWYG editor loads it into RTEPro's
  `exportCSS`, so the preview matches the published page -- CSS authored once.
- **Site-wide OG image default** -- `OG_IMAGE` in `.env` is the `og:image` for
  pages without a per-page `image`.

## [0.25.0] - 2026-06-29

### Added
- **Per-page SEO on the `pages` add-on** -- front-matter now drives the page head:
  `description` (meta description + og:description), `image` (og:image), `type`
  (og:type), `canonical`, and **`jsonld`** (a one-line JSON string rendered into a
  validated `<script type="application/ld+json">` block, with `<` escaped to
  prevent breakout). Open Graph + Twitter + JSON-LD per page -- the Yoast-style SEO
  a migrated WordPress site expects. `volt-addon-editor` 0.4.0 adds a SEO panel to
  set these from the editor.

## [0.24.0] - 2026-06-29

### Added
- The `pages` add-on now supports **`format: html`** in front-matter -- those
  pages are served **verbatim** (no markdown processing), so rich/complex layouts
  (e.g. from the WYSIWYG editor) are preserved losslessly. Plain markdown pages
  are unchanged. (`volt-addon-editor` 0.2.0 now stores `getHTML()` with
  `format: html` so editor layouts round-trip exactly.)

## [0.23.0] - 2026-06-29

### Added
- Plugin context now includes **`requireAuth`** and **`sessionFromReq`** (when the
  auth add-on is on) so third-party add-ons can gate routes by login. Purely
  additive -- no change to defaults or security posture.

### Note
- New companion package **`volt-addon-editor`** (separate npm package): a
  standing, role-gated RTEPro WYSIWYG editor that writes markdown pages. Mounts
  only if `ADMIN_PATH` is set (**fail-closed**), behind magic-link auth + an
  `ADMIN_EMAILS` allowlist; the secret path is obscurity *on top of* auth, never
  instead. The AI key stays server-side via a key-injecting proxy. The core stays
  no-standing-admin by default -- install only where you want it
  (`npx create-volt add editor`). See `/docs/editor`.

## [0.22.0] - 2026-06-29

### Added
- **Third-party add-ons (plugins) -- the WordPress-plugin equivalent.** Any
  `VOLT_ADDONS` entry that is not built-in is loaded from a local
  `.volt/addons/<name>/index.js` or an installed npm package
  `volt-addon-<name>`, and wired via a single `register(ctx)` export
  (ctx = app, express, io, store, mailer, env, log). Install functionality as
  small, owned packages instead of dashboard plugins.
  - `create-volt add <name>` -- install `volt-addon-<name>` and enable it.
  - `create-volt create-addon <name>` -- scaffold a publishable add-on package.
  - New `/docs/plugins`.

### Fixed
- `availableAddons()` tolerates add-on directories without `meta.json` (so
  local third-party add-ons do not break the wizard).

## [0.21.0] - 2026-06-29

### Added
- **`import-wp-db`** -- import WordPress content by reading its MySQL/MariaDB
  database directly, for when the REST API is disabled but you have DB access
  (on the server or via an SSH tunnel). `--prefix` for non-default table
  prefixes (validated against SQL injection); creds via `WP_DB_URL` to keep them
  out of shell history; `mysql2` loaded lazily. Reuses the WXR converter; unit
  tested with an injected connection. Third migration path alongside
  `import-wp` (REST) and `import-wxr` (file).

## [0.20.0] - 2026-06-29

### Added
- **`import-wp` -- fully-automated WordPress import over the REST API.**
  `npx create-volt import-wp <https://site>` pulls published posts + pages
  directly (paginated) into markdown `pages/` -- no export file, and **no
  credentials for public content**. Drafts/private need an Application Password
  via `WP_USER` + `WP_APP_PASSWORD` (Basic auth, **sent only over HTTPS, never
  logged**). Falls back to `import-wxr` if the REST API is disabled. Reuses the
  WXR→markdown converter; unit-tested with a mocked fetch. `/docs/migrate`
  updated to lead with the automated path.

## [0.19.0] - 2026-06-29

### Added
- **`import-wxr` -- WordPress importer.** `npx create-volt import-wxr <export.xml>`
  converts a WordPress WXR export into markdown pages: published pages + posts →
  `pages/<slug>.md` with front-matter (title, date, tags), Gutenberg block
  comments stripped, body kept as HTML/markdown; drafts + attachments skipped;
  slugs sanitized + de-duplicated. Flags: `--out <dir>`, `--drafts`, `--force`.
  Zero-dep parser (WXR is a consistent format); unit-tested. Lowers the cost of
  moving off WordPress. New `/docs/migrate`.

## [0.18.0] - 2026-06-29

### Added
- **Volt SSR** -- `volt-ssr.js`, a tiny server-side renderer: render the same
  `html` / `h()` markup and signal values to an HTML string in Node (`${values}`
  escaped by default, `raw()` for trusted HTML) via `renderToString`. Ships in
  every template, so a scaffolded app can be server-rendered for SEO + fast first
  paint and hydrate with `volt.js` on the client. The Volt site itself is now
  built with it -- marketing pages as Volt components, docs as markdown rendered
  with `raw()`, the whole page composed by `renderToString`.

## [0.17.0] - 2026-06-29

### Added
- **PaaS deploy targets** -- every scaffold now ships a `Dockerfile`,
  `.dockerignore`, `render.yaml`, `fly.toml`, and `Procfile`, so a Volt app
  deploys to Render / Fly.io / Railway / DO App Platform (which handle the
  server, DNS, and TLS) with config supplied as platform env vars. New
  `/docs/deploy` guide covering the PaaS and PM2+nginx paths.

### Changed
- The server boots straight into app mode (no setup wizard) when
  `NODE_ENV=production` or `VOLT_ADDONS` is set via env -- so a container/PaaS
  runs the app from platform env vars without a committed `.env`.

## [0.16.0] - 2026-06-29

### Added
- **`media` add-on** -- file uploads with a swappable storage driver: `local`
  (disk, served at `/media`) or `s3` (any S3-compatible store: AWS S3,
  DigitalOcean Spaces, …). `POST /api/media` is auth-gated (depends on the auth
  add-on); uploads are size-capped (`MEDIA_MAX_MB`, default 10), restricted to
  raster images + PDF (SVG rejected), stored under a random key, and returned as
  a public URL. Driver + S3 settings are configured in the setup wizard. Pulls in
  `busboy` (and `@aws-sdk/client-s3` when `MEDIA_DRIVER=s3`), both tracked by the
  dependency auto-updater and exercised by the smoke gate.

## [0.15.1] - 2026-06-29

### Fixed
- `volt.js` no longer touches `window` at import time -- the hot-reload client is
  guarded with `typeof window`, so the library is safe to import in Node (SSR,
  tests), not just the browser.

### Changed
- The `pages` add-on imports `express`/`marked` lazily (only when mounted), so
  its pure helpers load without those packages present.

### Added (repo tooling -- not shipped in scaffolded apps)
- A `node --test` unit suite (reactive core, memory store, pages helpers), a
  `smoke` script (scaffold → install → boot → hit endpoints), a CI workflow, and
  a smoke-test **gate** on the dependency auto-updater: a version bump is
  committed only if unit tests + smoke pass on the bumped versions.

## [0.15.0] - 2026-06-28

### Added
- **`pages` add-on** -- markdown pages, no database and no admin. Drop `.md`
  files in `pages/` and each is served as HTML at `/<slug>`; front-matter
  `title:` sets the page title. Author them in your editor or with AI. Pulls in
  `marked` (added on enable, tracked by the dependency auto-updater); the
  `pages/` directory is auto-created with a sample on first run. Mounted last,
  so your own app routes always win.

## [0.14.0] - 2026-06-28

### Changed
- **Adopted the most-secure admin model: ephemeral, shell-only.** Removed the
  persistent role-gated `admin` add-on (from 0.13.0). There is now **no web
  admin** anywhere -- the data browser is the ephemeral, localhost-only
  `--studio`, and config is `--edit`; both are shell/SSH-gated. SECURITY.md
  updated to state this as a core property.

### Added
- Dependency auto-update: `scripts/update-deps.mjs` + a weekly GitHub Action
  bump create-volt's pinned dependency floors to the latest **within the current
  major** (never a breaking major). Repo-only -- scaffolded apps are untouched.
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
- **`--template starter`** -- a complete, no-build app shell, fully wired and on
  out of the box: top nav over **Home**, magic-link **Account**, per-user
  **Notes** (auth-gated CRUD, db-backed), and **Chat** (realtime rooms + presence
  + typing). Ships a default `.env` enabling db+mailer+auth+realtime; includes
  the setup wizard (`--edit`) and Studio (`--studio`). The SaaS-style starting
  point.
- Templates can now ship a default `.env` (as `env`, renamed on scaffold).

## [0.11.0] - 2026-06-28

### Added
- **`create-volt studio`** (and `npm run dev -- --studio`) -- an ephemeral,
  localhost-only **data browser**, à la Prisma Studio. Browse collections and
  documents across any driver (memory / MongoDB / MySQL / Postgres) and delete
  docs. It's **never a route in the running app** -- it exists only while you run
  it, binds `127.0.0.1`, and disappears on Ctrl-C (shell/SSH access is the auth).
  Internal collections (auth tokens/sessions) are hidden.
- Stores gained `collections()` (enumerate collection names) on every adapter.

### Security
- Admin/data surfaces are **ephemeral by design** -- no standing `/admin` route in
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
  renders through Volt holes (text nodes -- HTML-escaped, no innerHTML); server
  validation + caps (email ≤ 320, chat ≤ 500); `.env` values stripped of newlines;
  session cookies `HttpOnly` + `SameSite=Lax`.

## [0.9.0] - 2026-06-28

### Changed
- The setup wizard is now the single place to configure an app, and it shows
  **all** add-ons: tick db/auth/realtime/mailer + fill their settings. Enabling
  is pure config -- **Apply writes `.env`** (a `VOLT_ADDONS` list + settings) and
  **adds any needed packages to `package.json` + runs `npm install`**, then
  starts the app, which **auto-wires** whatever `.env` enables (auth routes,
  realtime sockets, db). Add-on code ships bundled under `.volt/addons`; nothing
  is copied into your `lib/`.
- `create-volt config` now just opens that in-app wizard (`server.js --edit`) --
  one implementation, localhost-only (shell/SSH access is the auth).

### Removed
- The standalone create-volt config page and its `--host`/key flags (superseded
  by the in-app wizard, which is localhost-only + SSH-tunnel for remote).

### Note
- Backend of an enabled add-on is wired automatically; the frontend UI (login
  form, chat) is yours to build -- or start from `--template guestbook`.

## [0.8.0] - 2026-06-28

### Added
- **First-run setup wizard** baked into the app: on first run (no `.env`) or with
  `npm run dev -- --edit` (`-e`), `server.js` serves a disposable local config
  page; click **Apply** and it writes `.env`, loads it, and starts the app
  in-process -- the setup page then disappears. It self-detects which add-ons are
  present and only asks for their settings.
- **Auto-open browser** on first run (and prints the link); skips opening on
  headless/remote boxes (no `DISPLAY`). Opt out with `--no-open` / `VOLT_NO_OPEN`.
- **`--start`** flag for `create-volt`: scaffold, then launch the dev server
  (which opens the setup page) in one go.
- **`.env` auto-loader** in templates -- no `node --env-file` needed; reads the
  file directly, so it behaves identically on Windows/PowerShell.
- **Test connection** button in the wizard: actually connects with the entered
  DB credentials before you save.

### Changed
- `create-volt config` is **localhost-only by default** (shell/SSH access is the
  auth -- no key). Expose on a LAN with `--host 0.0.0.0`, which then mints a key.

## [0.7.0] - 2026-06-28

### Added
- `create-volt config` -- a disposable, key-gated local page (built with Volt) for
  add-ons. Tick the add-ons (or **All**), fill settings (DB driver/URL, SMTP,
  port), then **Apply**: it copies the add-on files into the app *and* writes
  `.env`, and shows copy-able install + wiring. Prints localhost **and** LAN
  links plus an SSH-tunnel hint for remote/headless boxes; a random key gates the
  page and the apply endpoint. Dependency-free (node:http). Run apps with
  `node --env-file=.env`.

### Removed
- The `create-volt add` command (from 0.6.0) -- applying add-ons now happens
  through `create-volt config`, which both copies files and writes `.env`.

## [0.6.0] - 2026-06-28

### Added
- `create-volt add <integration>` -- layer composable add-ons into an existing
  app instead of cloning whole templates. Copies self-contained files and prints
  the wiring (never edits your code); supports `--dry-run` and `--force`, and
  `create-volt add` with no name lists what's available. Integrations:
  - `db` -- document store over memory / MongoDB / MySQL / Postgres
  - `mailer` -- console (dev) / SMTP (prod) email
  - `auth` -- magic-link login + sessions (builds on db + mailer)
  - `realtime` -- Socket.io chat with rooms, presence, and typing

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
  update` inside an app. Only touches the library file -- never your `app.js`,
  `server.js`, or chosen port. Supports `--dry-run` to check without writing.

## [0.3.2] - 2026-06-28

### Changed
- Scaffolded apps' `README.md` now has a **Dev port** section explaining the
  date-derived port and how to override it (`PORT` env / `--port`).
- Package README shows `--port` directly in the Usage block.

## [0.3.1] - 2026-06-28

### Changed
- Internal: releases now publish from GitHub Actions via npm **Trusted
  Publishing** (OIDC, with provenance) -- no functional changes to scaffolded apps.

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

[0.81.0]: https://github.com/MIR-2025/volt/releases/tag/v0.81.0
[0.80.0]: https://github.com/MIR-2025/volt/releases/tag/v0.80.0
[0.79.1]: https://github.com/MIR-2025/volt/releases/tag/v0.79.1
[0.79.0]: https://github.com/MIR-2025/volt/releases/tag/v0.79.0
[0.78.0]: https://github.com/MIR-2025/volt/releases/tag/v0.78.0
[0.77.0]: https://github.com/MIR-2025/volt/releases/tag/v0.77.0
[0.76.0]: https://github.com/MIR-2025/volt/releases/tag/v0.76.0
[0.75.0]: https://github.com/MIR-2025/volt/releases/tag/v0.75.0
[0.74.0]: https://github.com/MIR-2025/volt/releases/tag/v0.74.0
[0.73.0]: https://github.com/MIR-2025/volt/releases/tag/v0.73.0
[0.72.0]: https://github.com/MIR-2025/volt/releases/tag/v0.72.0
[0.71.0]: https://github.com/MIR-2025/volt/releases/tag/v0.71.0
[0.70.0]: https://github.com/MIR-2025/volt/releases/tag/v0.70.0
[0.69.0]: https://github.com/MIR-2025/volt/releases/tag/v0.69.0
[0.68.2]: https://github.com/MIR-2025/volt/releases/tag/v0.68.2
[0.68.1]: https://github.com/MIR-2025/volt/releases/tag/v0.68.1
[0.68.0]: https://github.com/MIR-2025/volt/releases/tag/v0.68.0
[0.67.0]: https://github.com/MIR-2025/volt/releases/tag/v0.67.0
[0.66.0]: https://github.com/MIR-2025/volt/releases/tag/v0.66.0
[0.65.0]: https://github.com/MIR-2025/volt/releases/tag/v0.65.0
[0.64.0]: https://github.com/MIR-2025/volt/releases/tag/v0.64.0
[0.63.1]: https://github.com/MIR-2025/volt/releases/tag/v0.63.1
[0.63.0]: https://github.com/MIR-2025/volt/releases/tag/v0.63.0
[0.62.0]: https://github.com/MIR-2025/volt/releases/tag/v0.62.0
[0.61.0]: https://github.com/MIR-2025/volt/releases/tag/v0.61.0
[0.60.0]: https://github.com/MIR-2025/volt/releases/tag/v0.60.0
[0.59.0]: https://github.com/MIR-2025/volt/releases/tag/v0.59.0
[0.58.1]: https://github.com/MIR-2025/volt/releases/tag/v0.58.1
[0.58.0]: https://github.com/MIR-2025/volt/releases/tag/v0.58.0
[0.57.0]: https://github.com/MIR-2025/volt/releases/tag/v0.57.0
[0.56.1]: https://github.com/MIR-2025/volt/releases/tag/v0.56.1
[0.56.0]: https://github.com/MIR-2025/volt/releases/tag/v0.56.0
[0.55.1]: https://github.com/MIR-2025/volt/releases/tag/v0.55.1
[0.55.0]: https://github.com/MIR-2025/volt/releases/tag/v0.55.0
[0.54.0]: https://github.com/MIR-2025/volt/releases/tag/v0.54.0
[0.53.0]: https://github.com/MIR-2025/volt/releases/tag/v0.53.0
[0.52.0]: https://github.com/MIR-2025/volt/releases/tag/v0.52.0
[0.51.0]: https://github.com/MIR-2025/volt/releases/tag/v0.51.0
[0.50.0]: https://github.com/MIR-2025/volt/releases/tag/v0.50.0
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
