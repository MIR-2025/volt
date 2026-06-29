# Volt security model

Volt is designed to be **secure by default** and, specifically, to avoid the
class of problems that make a typical CMS (e.g. WordPress) a perennial target.
The core idea: **privileged surfaces are ephemeral, not standing.**

## Admin model: ephemeral by default

There is **no always-on admin route** in a running Volt app. The privileged
tools exist only as on-demand, **localhost-only** processes that disappear when
you close them:

- `npm run dev -- --edit` — the config wizard (toggle add-ons, set DB/SMTP).
- `npm run dev -- --studio` — the data browser (à la Prisma Studio).

Both bind `127.0.0.1`. **Shell/SSH access is the authentication** — if you can't
run the process or open an SSH tunnel to the box, you can't reach them. There is
no login page on the internet to phish or brute-force, and nothing to leave
exposed by accident.

### "Multiple admins" without a web admin

You don't need a web admin panel to have several admins. Give each admin their
own **SSH key**. That is *stronger* than a shared web admin:

- per-person keys, individually revocable;
- nothing to phish — no public login;
- OS-level audit logging of every access;
- zero standing attack surface.

### The one exception: non-shell admins

A **persistent, role-gated web admin** is only justified when you need admins who
must work through the browser and should never have server access (e.g. a
client's content editor). That reintroduces a standing surface, so in Volt it is
**opt-in**, never the default — the `admin` add-on, gated by auth **and** an
`ADMIN_EMAILS` allowlist. Enable it only when you actually need it.

## Other defaults

- **No XSS by construction.** All dynamic content renders through Volt holes,
  which create text nodes (HTML-escaped). The framework never uses `innerHTML`
  for user data.
- **Input validation + caps** server-side (e.g. email ≤ 320, chat ≤ 500), and
  `.env` values are newline-stripped so a pasted value can't inject env lines.
- **Hardened forms** — typed, length-capped, `autocomplete`d inputs.
- **Security headers** on every response: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: same-origin`, `X-Powered-By`
  removed.
- **Sessions** are `HttpOnly` + `SameSite=Lax` cookies; magic-link tokens are
  single-use, time-limited, and bound to the requesting browser.
- **No build step** — the whole framework is a single readable file, so there's
  no opaque toolchain or transitive build-time dependency to trust.

## Reporting

Found something? Open an issue at https://github.com/MIR-2025/volt/issues
(or email the maintainer for anything sensitive).
