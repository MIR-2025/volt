# ⚡ Volt app

A tiny, **no-build**, signals-based UI app with **Socket.io hot reload**.
Not React: no JSX, no virtual DOM, no re-render-the-world. State lives in
*signals*; only the exact text/attribute that changed updates.

## Run

```bash
npm install        # if you scaffolded with --skip-install
npm run dev        # → http://localhost:26628   (PORT env to override)
```

Edit anything in `public/` or `views/` and save — the dev server pushes a
reload over Socket.io and the page refreshes itself.

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
