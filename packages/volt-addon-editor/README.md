# volt-addon-editor

A standing, role-gated WYSIWYG editor for [Volt](https://voltjs.com), powered by
[RTEPro](https://rte.whitneys.co). Editors log in at a **secret URL**, write in a
rich editor, and publish **markdown pages** (served by the `pages` add-on) — the
WordPress-editor experience, but hardened and markdown-on-disk.

## Install (in a Volt app with the `auth` + `pages` add-ons)

```
npx create-volt add editor
```

Then set, in `.env`:

```
ADMIN_PATH=/your-secret-path     # fail-closed: no path → editor not mounted
ADMIN_EMAILS=you@example.com     # allowlist of editors
AI_PROVIDER=anthropic            # anthropic | openai | gemini
ANTHROPIC_API_KEY=sk-...         # (or OPENAI_API_KEY / GEMINI_API_KEY)
```

Restart, sign in (magic link), and open `https://yoursite/your-secret-path`.

## Security

The editor mounts **only if `ADMIN_PATH` is set** (fail-closed). The secret path
is **obscurity layered on top of** magic-link auth **and** the `ADMIN_EMAILS`
allowlist — never instead of them. The AI key stays **server-side**: the editor's
AI calls go through `/<path>/api/ai`, which injects the provider key (the key is
never sent to the browser).

## What it does

- WYSIWYG editing (RTEPro) with AI, served at your secret path.
- Lists / loads / saves `pages/<slug>.md` (front-matter title + markdown body).
- Content is plain markdown — editable in the UI *or* by hand, served by `pages`.
