# Changelog

All notable changes to `create-volt` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

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

[0.5.0]: https://github.com/MIR-2025/volt/releases/tag/v0.5.0
[0.4.0]: https://github.com/MIR-2025/volt/releases/tag/v0.4.0
[0.3.2]: https://github.com/MIR-2025/volt/releases/tag/v0.3.2
[0.3.1]: https://github.com/MIR-2025/volt/releases/tag/v0.3.1
[0.3.0]: https://github.com/MIR-2025/volt/releases/tag/v0.3.0
[0.2.0]: https://github.com/MIR-2025/volt/releases/tag/v0.2.0
[0.1.0]: https://github.com/MIR-2025/volt/releases/tag/v0.1.0
