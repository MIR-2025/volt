# Deploy

A Volt app is a plain Node app. Every scaffold ships a `Dockerfile`, `render.yaml`, `fly.toml`, and `Procfile`, so a platform can stand up the server, DNS, and TLS for you.

## One-click PaaS (recommended)

- **Render** — push to GitHub, then New -> Blueprint (uses `render.yaml`).
- **Fly.io** — `fly launch` (uses the `Dockerfile`).
- **Railway / DigitalOcean App Platform** — point at the repo; they build the `Dockerfile`.

Config comes from the platform's **env vars**, not a committed `.env`:

1. Run `npm run dev` locally and enable your add-ons in the wizard — that saves their packages into `package.json`. Commit it.
2. Deploy, and set the same config as env vars: `VOLT_ADDONS`, `DB_DRIVER`, `MONGODB_URI`/`DATABASE_URL`, `MEDIA_DRIVER` + `S3_*`, `SMTP_URL`, …

`NODE_ENV=production` (set by the Dockerfile) makes the app boot straight up — no setup wizard.

## Your own server (PM2 + nginx)

```
PORT=8080 pm2 start server.js --name my-app
pm2 save
# nginx: proxy your domain -> 127.0.0.1:8080
```

Ensure config is present (a `.env` or env vars) so it boots the app, not the localhost wizard. This very site is deployed this way.
