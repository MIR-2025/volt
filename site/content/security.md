# Security model

Privileged surfaces are ephemeral, not standing — the opposite of an always-on CMS admin.

- **No web admin.** Nothing like `/wp-admin`. Config (`--edit`) and the data browser (`--studio`) are on-demand, localhost-only; shell/SSH is the auth.
- **Multiple admins = multiple SSH keys** — per-person, revocable, audited; nothing public to brute-force.
- **No XSS by construction** — dynamic content renders as escaped text nodes.
- **Validation + caps** server-side; `.env` values newline-stripped.
- **Security headers** on every response; sessions `HttpOnly` + `SameSite=Lax`; magic-link tokens single-use, time-limited, same-browser.

Full write-up: [SECURITY.md](https://github.com/MIR-2025/volt/blob/main/SECURITY.md).
