# ⚡ Volt starter

A complete, **no-build** app shell — auth, realtime chat, a per-user notes CRUD,
and a database, all wired and turned on out of the box. Edit files and save;
the page hot-reloads.

## Run

```bash
npm install
npm run dev        # → http://localhost:26628
```

It ships with `VOLT_ADDONS=db,mailer,auth,realtime` in `.env`, so it runs the
full stack immediately (in-memory by default — magic-link emails print to the
console). Sign in from the **Account** tab, then use **Notes** and **Chat**.

## Sections

- **Home** — a simple dashboard.
- **Account** — magic-link sign-in (no passwords).
- **Notes** — per-user CRUD, auth-gated, stored in the db.
- **Chat** — Socket.io rooms with presence + typing.

## Configure & inspect

```bash
npm run dev -- --edit    # ephemeral wizard: toggle add-ons, set DB/SMTP, etc.
npm run dev -- --studio  # ephemeral data browser (like Prisma Studio)
```

Both are localhost-only and disappear when you close them — no standing admin
surface. Switch to a real database (MongoDB / MySQL / Postgres) anytime in the
wizard.

## Layout

```
public/app.js      the shell — nav + sections (Home/Notes/Chat/Account)
public/volt.js     the Volt library (no build step)
views/index.html   the HTML shell
server.js          dev server + wizard + studio; wires enabled add-ons + notes
.volt/addons/      bundled add-on sources (enabled via .env)
.env               which add-ons are on, + their settings
```

Scaffolded with [`create-volt`](https://www.npmjs.com/package/create-volt) — `--template starter`.
