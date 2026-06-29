# Volt — Roadmap

This is the honest direction for Volt, including where it is **not** going. It's
deliberately conservative about scope: Volt's advantage is smallness, no build
step, and security-by-construction, and the roadmap protects those.

## What Volt is (and isn't)

- **Is:** a tiny, no-build, signals-based UI library (~260 lines, vendored, zero
  runtime deps) plus `create-volt`, a one-command scaffolder with config-driven
  add-ons (db, auth, realtime, mailer, pages). Closer to a small Solid/Preact-
  style core than to React or a CMS.
- **Isn't:** a React-ecosystem replacement (no claim to scale, hiring, native,
  the npm universe), and **not** a non-technical CMS. Privileged tools are
  ephemeral and shell-gated; there is no standing `/wp-admin`. See
  [SECURITY.md](SECURITY.md).

## The long-term direction (the honest version)

The north-star is to be a credible alternative for a slice of what WordPress
does — **but not by fighting WordPress head-on.** WordPress's moat (non-technical
editors, the plugin/theme economy, ubiquitous cheap hosting) is a decade and a
company to challenge. Its *weakness* is the opening:

> **Win developer-owned small-to-medium sites and apps** where code-ownership,
> no build step, security (no public admin to attack), and AI-assisted authoring
> beat plugin/theme sprawl and the WP security treadmill.

That's the realistic goal: displace WordPress where it's the *wrong tool*, not
where it's strong.

## Two tracks, kept separate

1. **Volt — the framework** (this repo). Stays small, secure, no-build. Most
   roadmap items below are add-ons, not core changes.
2. **A CMS variant built _on_ Volt** (a future, separate product — "VoltPress").
   This is the only path to non-technical editing + themes, and it must
   consciously relax the "no standing admin" rule (e.g. a separately deployed,
   role-gated editing app). It is **not** allowed to drag the core framework away
   from its simplicity/security advantage.

## Staged path

### Now — shipped
- [x] `create-volt` scaffolder, 3 templates (default / starter / guestbook)
- [x] Config-driven add-ons: db (memory/Mongo/MySQL/Postgres), auth (magic-link),
      realtime (Socket.io), mailer, **pages** (markdown)
- [x] Ephemeral admin: `--edit` (config) + `--studio` (data browser)
- [x] Server-rendered marketing + docs site with WP-grade SEO
- [x] Test suite (unit + headless-browser DOM tests), smoke test, CI
- [x] Dependency auto-updater with a smoke-test gate (within-major only)

### Next — strengthen the wedge (Path A)
- [ ] **WXR importer** — ingest a WordPress export into Volt `pages`/content.
      Migration cost is the #1 reason people don't leave WP; lowering it is
      leverage.
- [ ] **Media-upload add-on** — local/S3-style uploads + image resizing.
- [ ] Content model maturity: posts/collections + simple taxonomies on top of
      the `pages` model.
- [ ] 2–3 real "would-be-WordPress" sites built in Volt as proof (dogfood).

### Later — the CMS variant (Path B)
- [ ] Editing surface built on **RTEPro** (the AI WYSIWYG), with the
      security/editing tension resolved (separate role-gated editing app).
- [ ] A small theme/layout system a non-coder can choose.
- [ ] Managed/one-click hosting (the actual business model — WP's money is in
      hosting, not the software). Seed: `deploy.sh` + PM2 + nginx.

## Non-goals (on purpose)
- A standing, internet-facing admin in the core framework.
- Matching React's ecosystem/scale, or claiming to.
- Becoming a heavyweight, plugin-sprawl platform. If an add-on can't stay small
  and optional, it doesn't belong in core.
