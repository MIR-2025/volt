# create-volt

Scaffold a new [Volt](https://github.com/) app in one command — a tiny,
**no-build**, signals-based UI with **Socket.io hot reload**. Think
`create-react-app`, but the whole framework is one ~260-line file you can read.

## Usage

```bash
npm create volt@latest my-app
# or
npx create-volt my-app
# or with pnpm / yarn / bun
pnpm create volt my-app
yarn create volt my-app
bun create volt my-app

# choose the dev port (default: derived from today's date)
npm create volt@latest my-app -- --port 26630

# pick a starter template
npm create volt@latest my-app -- --template guestbook
```

## Templates

Pick one with `--template` (default: `default`):

| Template    | What you get                                                          |
| ----------- | -------------------------------------------------------------------- |
| `default`   | The Counter + Todos demo on the Volt signal engine. Minimal.        |
| `guestbook` | A real app: magic-link auth, Socket.io real-time message board, and pluggable **MongoDB / MySQL / Postgres** storage (in-memory by default, so it runs with zero setup). |

Then:

```bash
cd my-app
npm run dev        # → http://localhost:26628
```

Edit `public/app.js` and save — the page hot-reloads itself.

## Add-on integrations

Apps ship with the add-ons **bundled** (under `.volt/addons`) but off. The
**setup wizard** turns them on — it opens on first run, or anytime with:

```bash
npm run dev -- --edit      # or: npx create-volt config
```

Tick the features you want, fill in their settings, and **Apply**. Enabling is
pure config: it writes `.env` (a `VOLT_ADDONS` list + settings) and adds any
needed packages to `package.json` + runs `npm install`. The app then auto-wires
whatever's enabled. Available add-ons:

| Add-on     | What it gives you                                                    |
| ---------- | ------------------------------------------------------------------- |
| `db`       | document store: memory / MongoDB / MySQL / Postgres, one interface  |
| `mailer`   | console (dev) / SMTP (prod) email                                   |
| `auth`     | magic-link login + sessions (pulls in db + mailer)                  |
| `realtime` | Socket.io chat: rooms, presence, typing (pulls in db)              |

The wizard is localhost-only (shell/SSH access is the auth; it prints an
SSH-tunnel hint on a remote box). Enabling an add-on wires its **backend**
automatically — the **frontend** UI (login form, chat) is yours to build, or
start from `--template guestbook`, which has it wired end-to-end.

## Updating Volt

Volt is vendored as a single file (`public/volt.js`), not an npm dependency.
To pull the latest library into an existing app, run from its directory:

```bash
npx create-volt@latest update         # refresh public/volt.js
npx create-volt@latest update --dry-run   # just check if an update is available
```

It only rewrites `public/volt.js` — your `app.js`, `server.js`, and dev port are
left untouched. Review the change with `git diff public/volt.js`.

## Options

| Flag              | Effect                                                  |
| ----------------- | ------------------------------------------------------- |
| `--port <number>` | Dev port for the app (default: derived from today's date)|
| `--skip-install`  | Don't run the install step (scaffold files only)        |
| `--no-git`        | Don't initialize a git repository                       |
| `--dry-run`       | Show what would be created without writing anything      |
| `--force`         | Scaffold into an existing non-empty directory           |
| `-h`, `--help`    | Show help                                               |
| `-v`, `--version` | Print the create-volt version                           |

By default the new project is initialized as a git repository with one initial
commit (skip with `--no-git`).

### Dev port

Each app's dev port is baked into its `server.js`. By default it's derived from
**today's date** — two-digit year + month + two-digit day (e.g. `2026-06-28` →
`26628`) — so apps created on different days never collide. Scaffolding more than
one app on the same day? Give them distinct ports with `--port`:

```bash
npm create volt@latest api-app -- --port 26630
```

The runtime `PORT` env var still overrides it at launch.

The installer auto-detects whichever package manager invoked it
(npm / pnpm / yarn / bun) and uses it for `install`.

## What you get

```
my-app/
├── public/
│   ├── volt.js       the Volt library (no build step)
│   └── app.js        your app — Counter + Todos demo
├── views/index.html  the HTML shell
├── server.js         dev server (Express + Socket.io + file watcher)
├── package.json
└── .gitignore
```

## Requirements

Node.js ≥ 16.7. Works on Linux, macOS and Windows.

## License

MIT
