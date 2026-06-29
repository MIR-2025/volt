# 📖 Guestbook — a real Volt app

A live message board built with [Volt](https://github.com/MIR-2025/volt):
fine-grained signals on the frontend, **Socket.io** for real-time updates,
**magic-link** sign-in (no passwords), and **pluggable storage** —
in-memory by default, or MongoDB / MySQL / Postgres for persistence.

## Run

```bash
npm install        # if you scaffolded with --skip-install
npm run dev        # → http://localhost:26629
```

Out of the box it uses an **in-memory store** and prints magic-link emails to
the **server console** — so you can try the whole flow with zero setup:

1. Enter your email, click **Send magic link**.
2. Copy the link printed in the terminal, open it.
3. Click **Confirm login** (must be the same browser).
4. Post a message — open a second tab to watch it appear live.

## Storage backends

Pick a backend with `DB_DRIVER` (default `memory`). Real drivers are lazy-loaded,
so install only the one you use.

```bash
# MongoDB
DB_DRIVER=mongodb MONGODB_URI="mongodb://user:<password>@host:27017/guestbook?authSource=admin" \
  MONGODB_DATABASE=guestbook npm start

# MySQL  (npm install mysql2)
DB_DRIVER=mysql DATABASE_URL="mysql://user:<password>@host:3306/guestbook" npm start

# Postgres  (npm install pg)
DB_DRIVER=postgres DATABASE_URL="postgres://user:<password>@host:5432/guestbook" npm start
```

Tables/collections are created automatically on first run. Never hard-code the
credential — keep it in your environment / `.env`.

## Email (magic links)

In dev, links are printed to the console. For real email, set `SMTP_URL` (and
`MAIL_FROM`) and `npm install nodemailer`:

```bash
SMTP_URL="smtp://user:pass@smtp.example.com:587" MAIL_FROM="Guestbook <no-reply@you.com>" npm start
```

## Layout

```
server.js          Express + Socket.io + storage/mailer wiring
router.js          routes; composes views with a header include
lib/store.js       backend selector (memory | mongodb | mysql | postgres)
lib/stores/        the adapters (same interface each)
lib/auth.js        magic-link tokens + sessions
lib/mailer.js      console (dev) or SMTP (prod)
public/volt.js     the Volt library (no build step)
public/app.js      the frontend — signals + Socket.io
views/             index, confirm page, header partial
```

## Production

Runs anywhere Node does. Under PM2: `pm2 start server.js --name guestbook`.
Set `PORT`, `DB_DRIVER`, the connection string, and `SMTP_URL` in the environment.

Scaffolded with [`create-volt`](https://www.npmjs.com/package/create-volt) — `--template guestbook`.
