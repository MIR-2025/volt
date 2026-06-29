// volt-ssr.js — server-side rendering for Volt. Renders the same html`` markup,
// h() elements, and signal values to an HTML string in Node (no DOM), so a Volt
// app can be fully server-rendered for SEO and hydrate interactive islands with
// volt.js on the client.
//
//   import { html, h, raw, renderToString } from "./volt-ssr.js";
//   renderToString(html`<p>${name}</p>`)   // → "<p>Ada</p>" (name is escaped)
//
// Authoring matches the client: html`` interpolations render as escaped text;
// nest html``/h() nodes for structure; use raw() for trusted pre-built HTML.

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// trusted, pre-rendered HTML — emitted verbatim. Use only for content you control.
export const raw = (s) => ({ __raw: String(s) });

// tagged-template markup; the literal chunks are trusted, ${values} are escaped.
export const html = (strings, ...values) => ({ __tpl: true, strings, values });

const isNode = (x) => x && typeof x === "object" && (x.__tpl || x.__raw || x.__el);

// hyperscript element: h(tag, props?, ...children)
export function h(tag, props, ...children) {
  if (props === undefined || props === null || isNode(props) || Array.isArray(props) || typeof props !== "object") {
    if (props !== undefined && props !== null) children.unshift(props);
    props = {};
  }
  return { __el: true, tag, props, children };
}

const read = (v) => (typeof v === "function" ? v() : v); // resolve signals/thunks (once)

function attrs(props) {
  let out = "";
  for (const [k, rawVal] of Object.entries(props)) {
    if (k === "children" || k.startsWith("on")) continue; // event handlers don't SSR
    const v = read(rawVal);
    if (v == null || v === false) continue;
    const name = k === "className" ? "class" : k;
    out += v === true ? ` ${name}` : ` ${name}="${esc(v)}"`;
  }
  return out;
}

export function renderToString(node) {
  const v = read(node);
  if (v == null || v === false || v === true) return "";
  if (typeof v === "string" || typeof v === "number") return esc(v);
  if (v.__raw != null) return v.__raw;
  if (Array.isArray(v)) return v.map(renderToString).join("");
  if (v.__tpl) {
    let out = v.strings[0];
    for (let i = 0; i < v.values.length; i++) out += renderToString(v.values[i]) + v.strings[i + 1];
    return out;
  }
  if (v.__el) {
    if (typeof v.tag === "function") return renderToString(v.tag({ ...v.props, children: v.children }));
    const open = `<${v.tag}${attrs(v.props)}>`;
    return VOID.has(v.tag) ? open : `${open}${v.children.map(renderToString).join("")}</${v.tag}>`;
  }
  return esc(String(v));
}
