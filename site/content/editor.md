# WYSIWYG editor

A standing, role-gated rich-text editor — the WordPress-editor experience, hardened. It's a **third-party add-on** (`volt-addon-editor`, powered by [RTEPro](https://rte.whitneys.co)) that writes markdown pages, so it doesn't touch the core: install it only where you want it.

## Install (needs the auth + pages add-ons)

```
npx create-volt add editor
```

Then set, in `.env`:

```
ADMIN_PATH=/your-secret-path     # fail-closed: no path → not mounted
ADMIN_EMAILS=you@example.com     # allowlist of editors
AI_PROVIDER=anthropic            # anthropic | openai | gemini
ANTHROPIC_API_KEY=sk-...
```

Sign in (magic link), open your secret path, write, publish. Pages are saved as `pages/<slug>.md` with `format: html` (the editor stores HTML so **complex layouts are preserved losslessly** — markdown cannot represent multi-column/styled layouts). Served by the pages add-on; still editable by hand.

## Security

- **Fail-closed** — mounts only if `ADMIN_PATH` is set.
- The secret path is **obscurity on top of** magic-link auth **and** the `ADMIN_EMAILS` allowlist — never instead of them.
- The AI key stays **server-side**: the editor's AI requests go through a key-injecting proxy, so the key never reaches the browser.
- It's opt-in — the **core stays no-standing-admin by default**.
