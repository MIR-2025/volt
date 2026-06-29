// Volt SSR — renderToString over html`` / h() / raw() and signals (no DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { html, h, raw, renderToString } from "../packages/create-volt/templates/default/public/volt-ssr.js";
import { signal } from "../packages/create-volt/templates/default/public/volt.js";

test("html`` interpolations are escaped", () => {
  assert.equal(renderToString(html`<p>${"a & <b>"}</p>`), "<p>a &amp; &lt;b&gt;</p>");
});

test("static template chunks are emitted verbatim", () => {
  assert.equal(renderToString(html`<div class="x">hi</div>`), '<div class="x">hi</div>');
});

test("raw() passes trusted HTML through unescaped", () => {
  assert.equal(renderToString(html`<div>${raw("<b>x</b>")}</div>`), "<div><b>x</b></div>");
});

test("nested nodes and arrays compose", () => {
  const items = [html`<li>${"<1>"}</li>`, html`<li>2</li>`];
  assert.equal(renderToString(html`<ul>${items}</ul>`), "<ul><li>&lt;1&gt;</li><li>2</li></ul>");
});

test("h() renders attributes, escapes values, maps className→class", () => {
  assert.equal(renderToString(h("a", { href: "/x?q=1&y=2", className: "n" }, "go")), '<a href="/x?q=1&amp;y=2" class="n">go</a>');
});

test("h() void elements have no closing tag; event handlers are dropped", () => {
  assert.equal(renderToString(h("br")), "<br>");
  assert.equal(renderToString(h("button", { onclick: () => {} }, "x")), "<button>x</button>");
});

test("signals/thunks resolve to their current value (escaped)", () => {
  const n = signal(5);
  assert.equal(renderToString(html`<i>${n}</i>`), "<i>5</i>");
  assert.equal(renderToString(html`<i>${() => "<z>"}</i>`), "<i>&lt;z&gt;</i>");
});

test("function components receive props + children", () => {
  const Card = ({ title, children }) => html`<section><h2>${title}</h2>${children}</section>`;
  assert.equal(renderToString(h(Card, { title: "<t>" }, raw("<p>body</p>"))), "<section><h2>&lt;t&gt;</h2><p>body</p></section>");
});
