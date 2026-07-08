# Volt app

A tiny, **no-build**, signals-based UI app with **Socket.io hot reload**.
Not React: no JSX, no virtual DOM, no re-render-the-world. State lives in
*signals*; only the exact text/attribute that changed updates.

📖 **[How to build a Volt app →](https://github.com/MIR-2025/volt#readme)**

## Run

```bash
npm install        # if you scaffolded with --skip-install
npm run dev        # → http://localhost:26708
```

The **first run opens a quick setup page** in your browser (configure settings,
click Apply, and the app starts — the setup page then disappears). On a headless
or remote box it prints the link instead. Reopen settings anytime with
`npm run dev -- --edit` (`-e`). `.env` is auto-loaded, so no `--env-file` flag
is needed — it works the same on Windows.

Edit anything in `public/` or `views/` and save — the dev server pushes a
reload over Socket.io and the page refreshes itself.

## Dev port

This app's dev port is set in `server.js` (chosen when the project was
scaffolded). Override it at launch with the `PORT` env var:

```bash
PORT=4000 npm run dev
```

Scaffolding more apps? `create-volt` defaults each one's port to its creation
date and takes `--port <number>` to avoid collisions on the same day:

```bash
npm create volt@latest api-app -- --port 26630
```

## Updating Volt

`public/volt.js` is a vendored file, not an npm dependency. Pull the latest
library version with:

```bash
npx create-volt@latest update
```

This rewrites only `public/volt.js` — your app code and port stay as-is.

## Project layout

```
public/volt.js     the Volt library (a single ~260-line file, no build step)
public/app.js      your app — the Counter + Todos demo to start from
views/index.html   the HTML shell (loads socket.io then app.js as a module)
server.js          the dev server (Express + Socket.io + file watcher)
```

## API

```js
import { signal, computed, effect, el, html, mount } from "/volt.js";
```

- **`signal(initial)`** → a getter/setter function. `n()` reads, `n(next)` writes.
- **`computed(fn)`** → read-only derived signal, auto-updating.
- **`effect(fn)`** → runs `fn`, re-runs when any signal it read changes. Returns a disposer.
- **`el(tag, props?, ...children)`** → a DOM element. `onClick` = listener; a function
  prop = reactive attribute; a function child = live region.
- **``html`...` ``** → tagged-template markup. `${signal}` holes update in place;
  `onclick=${fn}` = listener; `value=${signal}` = reactive attribute.
- **`mount(target, ...children)`** → append children into a selector/element.

Scaffolded with [`create-volt`](https://www.npmjs.com/package/create-volt).
