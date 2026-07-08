# Volt

A tiny, **no-build**, signals-based UI library with **Socket.io hot reload** —
and a `create-react-app`-style scaffolder to start a new app in one command.

Not React: no JSX, no virtual DOM, no re-render-the-world. State lives in
*signals*; reading a signal inside a piece of UI subscribes that exact piece,
and writing it touches only the precise text node / attribute that changed.

## Quick start

```bash
npm create volt@latest my-app
cd my-app
npm run dev          # → http://localhost:26628
```

Edit `public/app.js` and save — the page reloads itself.

## Dev port

Each scaffolded app's dev port is baked into its `server.js`. By default it's
derived from the **date you create it** — two-digit year + month + two-digit day
(e.g. `2026-06-28` → `26628`) — so apps made on different days never collide.
Creating more than one app on the same day? Give them distinct ports with
`--port`:

```bash
npm create volt@latest web-app                 # → port from today's date
npm create volt@latest api-app -- --port 26630 # → explicit port
```

The runtime `PORT` env var still overrides it at launch: `PORT=4000 npm run dev`.

## This repo (monorepo)

```
packages/create-volt/   the scaffolder, published as `create-volt`
  ├── index.js          the CLI (bin)
  └── template/         the files copied into every new project
example/                a ready-to-run app scaffolded from the template
```

Run the bundled example straight from the repo:

```bash
npm install            # installs workspace deps (hoisted to ./node_modules)
npm run example        # → http://localhost:26628
```

Scaffold a throwaway app using the local (unpublished) CLI:

```bash
npm run create-volt -- /tmp/my-app --skip-install
```

## The library API

```js
import { signal, computed, effect, el, html, mount } from "/volt.js";
```

- **`signal(initial)`** → a getter/setter function. `n()` reads, `n(next)` writes.
- **`computed(fn)`** → read-only derived signal, auto-updating.
- **`effect(fn)`** → runs `fn`, re-runs when any signal it read changes. Returns a disposer.
- **`el(tag, props?, ...children)`** → a DOM element. `onClick` = listener; a
  function prop = reactive attribute; a function child = live region.
- **``html`...` ``** → tagged-template markup. `${signal}` holes update in place;
  `onclick=${fn}` = listener; `value=${signal}` = reactive attribute.
- **`mount(target, ...children)`** → append children into a selector/element.

Both authoring styles (`el()` and ``html` ` ``) run on the same engine and interoperate.

## Platform support

Pure Node.js (ESM) + browser. No build step, no native deps. The dev server
and the scaffolder run on Linux, macOS and Windows; the CLI auto-detects whether
it was invoked via npm / pnpm / yarn / bun.

## License

MIT
