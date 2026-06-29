# Changelog

All notable changes to `create-volt` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

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
