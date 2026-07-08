// volt.js — a tiny, no-build, signals-based UI library.
//
// Not React: there is no JSX, no virtual DOM, and no "re-render the whole
// component" step. State lives in *signals*; reading a signal inside a piece of
// UI subscribes that exact piece; writing the signal re-runs only those
// subscribers and touches only the precise text node / attribute that changed.
//
// Two ways to author UI, same engine underneath:
//   1. html``  — tagged-template markup with ${signal} holes
//   2. el(...)  — imperative DOM helpers with function-children
// They interoperate freely (drop an el() node into an html`` template, etc.).
//
// Public API: signal, computed, effect, el, html, mount.

// ---------------------------------------------------------------------------
// Reactive core (signals + effects with ownership-based disposal)
// ---------------------------------------------------------------------------

let activeEffect = null;

// A signal is a function: call with no args to read, one arg to write.
//   const n = signal(0);  n();      // read  → 0
//                         n(n()+1); // write → notifies subscribers
export function signal(value) {
  const subs = new Set();
  return function sig(...args) {
    if (args.length) {
      const next = args[0];
      if (next === value) return value; // no-op on identical value
      value = next;
      for (const eff of [...subs]) eff.run(); // copy: run() mutates subs
      return value;
    }
    if (activeEffect) {
      subs.add(activeEffect);
      activeEffect.deps.add(subs);
    }
    return value;
  };
}

// effect(fn) runs fn now, tracks every signal it reads, and re-runs it whenever
// any of those change. Effects created *inside* another effect are owned by it
// and disposed before each re-run — so dynamic regions clean up after themselves.
export function effect(fn) {
  const eff = {
    deps: new Set(),
    children: new Set(),
    parent: activeEffect,
    disposed: false,
    run() {
      // A signal write notifies a *snapshot* of subscribers; a parent re-render
      // can dispose this effect before its turn in that snapshot — so skip if so.
      if (eff.disposed) return;
      disposeChildren(eff);
      cleanupDeps(eff);
      const prev = activeEffect;
      activeEffect = eff;
      try {
        fn();
      } finally {
        activeEffect = prev;
      }
    },
    dispose() {
      eff.disposed = true;
      disposeChildren(eff);
      cleanupDeps(eff);
      if (eff.parent) eff.parent.children.delete(eff);
    },
  };
  if (activeEffect) activeEffect.children.add(eff);
  eff.run();
  return () => eff.dispose();
}

// computed(fn) is a read-only derived signal: () => value, auto-updating.
export function computed(fn) {
  const s = signal(undefined);
  effect(() => s(fn()));
  return () => s();
}

function cleanupDeps(eff) {
  for (const subs of eff.deps) subs.delete(eff);
  eff.deps.clear();
}

function disposeChildren(eff) {
  for (const child of [...eff.children]) child.dispose();
  eff.children.clear();
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

// el(tag, props?, ...children) → a real DOM element.
//   props: { onClick: fn }        → event listener
//          { class: () => ... }   → reactive attribute (function = live)
//          { id: 'x' }            → static attribute
//   children: strings, numbers, nodes, arrays, or functions (functions = live)
export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      if (key.startsWith("on") && typeof val === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (typeof val === "function") {
        effect(() => setAttr(node, key, val()));
      } else {
        setAttr(node, key, val);
      }
    }
  }
  for (const child of children) appendChild(node, child);
  return node;
}

// mount(target, ...children) appends children into target (selector or element).
// Top-level function-children are reactive too.
export function mount(target, ...children) {
  const parent = typeof target === "string" ? document.querySelector(target) : target;
  for (const child of children) appendChild(parent, child);
  return parent;
}

// Boolean attributes: presence means "on", so a false/null/"false" value must turn
// them OFF (readonly="false" is still readonly in HTML). Set via the DOM property;
// readonly's property is readOnly, so map it.
const BOOL_ATTRS = new Set(["checked", "disabled", "selected", "readonly", "required", "multiple", "hidden", "autofocus", "open"]);
const BOOL_PROP = { readonly: "readOnly" };
function setAttr(node, name, value) {
  if (name === "value") {
    const v = value ?? "";
    if (node.value !== v) node.value = v; // skip redundant writes — they reset the caret while typing
    return;
  }
  if (BOOL_ATTRS.has(name)) {
    node[BOOL_PROP[name] || name] = !!value && value !== "false";
    return;
  }
  if (value === false || value == null) {
    node.removeAttribute(name);
    return;
  }
  node.setAttribute(name, value);
}

// Append a child, making function-children into self-updating dynamic regions
// bounded by two comment anchors (so they can render text, nodes, or lists).
function appendChild(parent, child) {
  if (typeof child === "function") {
    const start = document.createComment("");
    const end = document.createComment("");
    parent.appendChild(start);
    parent.appendChild(end);
    effect(() => renderRange(start, end, child()));
    return;
  }
  for (const node of toNodes(child)) parent.appendChild(node);
}

// Replace everything between the start/end anchors with `value`'s nodes.
function renderRange(start, end, value) {
  if (!end.parentNode) return; // range detached (parent re-rendered) — nothing to do
  let n = start.nextSibling;
  while (n && n !== end) {
    const t = n.nextSibling;
    n.remove();
    n = t;
  }
  for (const node of toNodes(value)) end.parentNode.insertBefore(node, end);
}

// Normalize any child value into an array of DOM nodes.
function toNodes(value) {
  if (value == null || value === false || value === true) return [];
  if (Array.isArray(value)) return value.flatMap(toNodes);
  if (value instanceof Node) return [value];
  return [document.createTextNode(String(value))];
}

// ---------------------------------------------------------------------------
// html`` template layer (parses once, wires holes to the same primitives)
// ---------------------------------------------------------------------------

const PH = (i) => `__voltph${i}__`;
const PH_RE = /__voltph(\d+)__/g;

// We're inside an open tag (attribute context) if the last '<' comes after the
// last '>' in the accumulated string.
function isAttrContext(str) {
  return str.lastIndexOf("<") > str.lastIndexOf(">");
}

export function html(strings, ...values) {
  let acc = "";
  strings.forEach((str, i) => {
    acc += str;
    if (i < values.length) {
      acc += isAttrContext(acc) ? PH(i) : `<!--${PH(i)}-->`;
    }
  });

  const tpl = document.createElement("template");
  tpl.innerHTML = acc.trim();

  // Bind attribute holes.
  for (const node of tpl.content.querySelectorAll("*")) {
    for (const attr of [...node.attributes]) {
      PH_RE.lastIndex = 0;
      if (PH_RE.test(attr.value)) bindAttr(node, attr, values);
    }
  }

  // Bind node holes (comment placeholders).
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_COMMENT);
  const holes = [];
  let c;
  while ((c = walker.nextNode())) {
    const m = c.data.match(/^__voltph(\d+)__$/);
    if (m) holes.push([c, Number(m[1])]);
  }
  for (const [comment, i] of holes) bindNodeHole(comment, values[i]);

  const nodes = [...tpl.content.childNodes];
  return nodes.length === 1 ? nodes[0] : nodes;
}

function bindAttr(node, attr, values) {
  const name = attr.name;
  const raw = attr.value;
  const single = raw.match(/^__voltph(\d+)__$/);
  node.removeAttribute(name);

  // onX=${fn} → event listener
  if (name.startsWith("on") && single) {
    node.addEventListener(name.slice(2).toLowerCase(), values[Number(single[1])]);
    return;
  }

  // Otherwise a (possibly mixed) attribute value. If any hole is a function it
  // is read inside the effect, so the attribute stays live.
  effect(() => {
    const text = raw.replace(PH_RE, (_, j) => {
      const v = values[Number(j)];
      return String(typeof v === "function" ? v() : v ?? "");
    });
    setAttr(node, name, text);
  });
}

function bindNodeHole(comment, value) {
  const start = document.createComment("");
  comment.parentNode.insertBefore(start, comment); // `comment` becomes the end anchor
  if (typeof value === "function") {
    effect(() => renderRange(start, comment, value()));
  } else {
    renderRange(start, comment, value);
  }
}

// ---------------------------------------------------------------------------
// Hot reload client — listens for the dev server's reload event over Socket.io
// ---------------------------------------------------------------------------

(function startHotReload() {
  if (typeof window === "undefined") return; // not a browser (SSR / Node imports / tests)

  // Patch `from` to match `to` in place — only changed nodes are touched, so
  // focus, caret, scroll, and untouched subtrees survive. Positional (no keys),
  // which is plenty for a dev reload; the caller falls back to a full reload if
  // anything throws.
  const morph = (from, to) => {
    const active = document.activeElement;
    if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName) {
      from.replaceWith(document.importNode(to, true));
      return;
    }
    if (from.nodeType === 3 || from.nodeType === 8) {
      if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
      return;
    }
    if (from.nodeType !== 1) return;
    for (const a of [...to.attributes]) {
      if (from === active && a.name === "value") continue; // don't fight the typist
      if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
    }
    for (const a of [...from.attributes]) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
    let f = from.firstChild,
      t = to.firstChild;
    while (f && t) {
      const nf = f.nextSibling,
        nt = t.nextSibling;
      morph(f, t);
      f = nf;
      t = nt;
    }
    while (f) {
      const nf = f.nextSibling;
      from.removeChild(f);
      f = nf;
    }
    while (t) {
      const nt = t.nextSibling;
      from.appendChild(document.importNode(t, true));
      t = nt;
    }
  };

  const bustStyles = () => {
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      const u = new URL(link.getAttribute("href"), location.href);
      u.searchParams.set("_hr", Date.now());
      link.setAttribute("href", u.pathname + u.search);
    }
  };

  let busy = false;
  const onChange = async (info) => {
    const file = (info && info.file) || "";
    if (/\.css(\?|$)/i.test(file)) return bustStyles(); // pure CSS → swap, no reload
    if (/\.(js|mjs)(\?|$)/i.test(file)) return location.reload(); // JS changed → must re-run
    if (busy) return;
    busy = true;
    try {
      const html = await (await fetch(location.href, { headers: { "x-volt-hot": "1" } })).text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      // a client-rendered app (#app filled by JS, empty in server HTML) can't be
      // morphed without wiping it — full reload instead.
      const cur = document.querySelector("#app");
      const next = doc.querySelector("#app");
      if (cur && cur.children.length && next && !next.children.length) {
        location.reload();
        return;
      }
      morph(document.body, doc.body);
      if (document.title !== doc.title) document.title = doc.title;
      if (/_theme/.test(file)) bustStyles(); // theme/layout edit may change CSS too
    } catch {
      location.reload();
    } finally {
      busy = false;
    }
  };

  const connect = () => {
    if (!window.io) return false;
    window.io().on("volt:reload", onChange);
    console.log("[volt] hot reload connected (live morph)");
    return true;
  };
  if (!connect()) window.addEventListener("load", connect);
})();
