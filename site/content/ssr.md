# Server rendering (SSR)

Volt ships a tiny server-side renderer, **volt-ssr.js**, so you can render the same Volt markup and signal values to an HTML string in Node — for SEO, crawlability, and fast first paint — then hydrate interactive islands with volt.js on the client.

```
import { html, h, raw, renderToString } from "/volt-ssr.js";

const page = html`<main><h1>${title}</h1>${raw(bodyHtml)}</main>`;
res.type("html").send(renderToString(page));
```

- **html / h** — author markup; interpolated `${values}` are HTML-escaped (no XSS).
- **raw(trustedHtml)** — emit pre-rendered HTML unescaped (e.g. a markdown render).
- **renderToString(node)** — render to an HTML string; signals and thunks resolve to their current value.

This very site uses it: the marketing pages are Volt components, the docs are markdown rendered with `raw()`, and the whole page is composed by `renderToString` — no build step, real per-page URLs and meta.
