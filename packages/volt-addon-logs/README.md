# volt-addon-logs

A gated **log viewer** for [Volt](https://voltjs.com): tail your app's pm2
stdout/stderr, and — with [`mir-sentinel`](https://www.npmjs.com/package/mir-sentinel) —
parse Apache/nginx access logs (or request lines in pm2 stdout) into analytics.

## Install

```
npm install volt-addon-logs            # tail pm2 logs
npm install mir-sentinel               # optional: enables the Analytics tab
```

Enable it by adding `logs` to `VOLT_ADDONS` in `.env`.

## Security (same model as the editor)

Mounts **only** if `ADMIN_PATH` is set (fail-closed), behind magic-link auth + an
`ADMIN_EMAILS` allowlist. Logs leak information — never expose them
unauthenticated. The viewer lives at `/<ADMIN_PATH>/logs`.

## Log sources (fixed — no arbitrary paths)

| Source | File |
| --- | --- |
| `app` | `~/.pm2/logs/<app>-out.log` (pm2 stdout) |
| `error` | `~/.pm2/logs/<app>-error.log` (pm2 stderr) |
| `access` | `ACCESS_LOG` env (an Apache/nginx access log), if set |

- **Raw tail** — last N lines, with a filter box and a "follow" toggle.
- **Analytics** — runs lines through `mir-sentinel`'s `parseLine` → top paths,
  status codes, IPs, and bot/attack counts. The parser is format-tolerant, so it
  handles Apache combined, nginx, and request lines in pm2 stdout. The tab is
  hidden until `mir-sentinel` is installed.
