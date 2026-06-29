# The Volt library

Fine-grained signals, two authoring styles, one ~260-line file. Not React: no JSX, no virtual DOM — reading a signal subscribes that exact piece of UI; writing touches only the text/attribute that changed.

```
import { signal, computed, effect, el, html, mount } from "/volt.js";

const n = signal(0);                  // n() reads, n(next) writes
const even = computed(() => n() % 2 === 0);
effect(() => console.log("n is", n()));

const view = el("button", { onClick: () => n(n() + 1) }, () => String(n()));
const card = html`<p>${n} is ${() => (even() ? "even" : "odd")}</p>`;
mount("#app", view, card);
```

- `signal(initial)` — getter/setter function.
- `computed(fn)` — read-only derived signal.
- `effect(fn)` — runs fn, re-runs on change; returns a disposer.
- `el(tag, props?, ...children)` — a DOM element; function props/children are live.
- The `html` tagged template — `${signal}` holes, `onclick=${fn}`, `value=${signal}`.
- `mount(target, ...children)` — append into a selector/element.

Interpolated values render as text nodes (HTML-escaped) — user content can't inject markup.
