#!/usr/bin/env node
// browser-test.mjs — exercises the DOM half of volt.js (el/html/mount, signal
// reactivity, events, attribute binding, escaping) in a REAL headless browser
// over CDP. Zero npm deps: uses Node's built-in WebSocket (Node 18.16+/22+),
// fetch, and http. Needs a Chromium-family browser on PATH (or $BROWSER).
//
//   node scripts/browser-test.mjs
//   BROWSER=/path/to/chrome node scripts/browser-test.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOLT = path.join(root, "packages", "create-volt", "templates", "default", "public", "volt.js");
const PORT = 27345;
const DBG = 9466;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="app"></div>
<script type="module">
  import * as Volt from "/volt.js";
  window.Volt = Volt;
  window.__voltReady = true;
</script></body></html>`;

// in-page test program — returns { results: [{name, ok}] }
const PROGRAM = `(() => {
  const { signal, computed, el, html, mount } = window.Volt;
  const app = document.getElementById("app");
  const r = [];
  const check = (name, ok) => r.push({ name, ok: !!ok });
  const reset = () => { app.innerHTML = ""; };

  reset();
  const n1 = signal(0);
  mount(app, el("button", { id: "b1" }, () => "count:" + n1()));
  const b1 = document.getElementById("b1");
  check("el() renders a node with text", b1 && b1.tagName === "BUTTON" && b1.textContent === "count:0");
  n1(5);
  check("el() function-child reacts to signal", b1.textContent === "count:5");

  reset();
  const n2 = signal(1);
  mount(app, html\`<p id="p1">val:\${n2}</p>\`);
  const p1 = document.getElementById("p1");
  check("html\\\` \\\` renders + interpolates", p1 && p1.textContent === "val:1");
  n2(2);
  check("html interpolation reacts", p1.textContent === "val:2");

  reset();
  const n3 = signal(0);
  mount(app, html\`<button id="b3" onclick=\${() => n3(n3() + 1)}>\${n3}</button>\`);
  const b3 = document.getElementById("b3");
  b3.click(); b3.click();
  check("event handler fires + updates DOM", b3.textContent === "2");

  reset();
  const v = signal("a");
  mount(app, html\`<input id="i1" value=\${v} />\`);
  const i1 = document.getElementById("i1");
  check("attribute binds", i1.getAttribute("value") === "a" || i1.value === "a");
  v("b");
  check("attribute reacts", i1.getAttribute("value") === "b" || i1.value === "b");

  reset();
  const c = signal(2);
  const dbl = computed(() => c() * 2);
  mount(app, html\`<span id="s1">\${dbl}</span>\`);
  const s1 = document.getElementById("s1");
  check("computed renders in DOM", s1.textContent === "4");
  c(10);
  check("computed reacts in DOM", s1.textContent === "20");

  reset();
  const danger = signal('<img src=x onerror="window.__xss=1">');
  mount(app, html\`<div id="d1">\${danger}</div>\`);
  const d1 = document.getElementById("d1");
  check("interpolation escapes HTML (no element injected)", d1.querySelector("img") === null && window.__xss === undefined && d1.textContent.indexOf("<img") === 0);

  return { results: r };
})()`;

function findBrowser() {
  const cands = [process.env.BROWSER, "brave-browser", "google-chrome-stable", "google-chrome", "chromium", "chromium-browser", "chrome"].filter(Boolean);
  for (const c of cands) {
    if (c.includes("/")) {
      if (fs.existsSync(c)) return c;
      continue;
    }
    try {
      execFileSync("which", [c], { stdio: "ignore" });
      return c;
    } catch {}
  }
  return null;
}

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.setHeader("content-type", "text/html");
    return res.end(HARNESS);
  }
  if (req.url === "/volt.js") {
    res.setHeader("content-type", "text/javascript");
    return res.end(fs.readFileSync(VOLT));
  }
  res.statusCode = 404;
  res.end();
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "volt-browser-"));
let browser, ws;
const cleanup = () => {
  try { browser?.kill("SIGKILL"); } catch {}
  try { server.close(); } catch {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
};

async function main() {
  const bin = findBrowser();
  if (!bin) throw new Error("no Chromium-family browser found (set $BROWSER)");
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

  browser = spawn(bin, ["--headless=new", `--remote-debugging-port=${DBG}`, `--user-data-dir=${tmp}`, "--no-first-run", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", `http://127.0.0.1:${PORT}/`], { stdio: "ignore" });

  let target;
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${DBG}/json`)).json();
      target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (target) break;
    } catch {}
  }
  if (!target) throw new Error("could not connect to the browser (CDP)");

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", () => rej(new Error("ws error")), { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalIn = async (expression) => {
    const m = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (m.result?.exceptionDetails) throw new Error("page eval threw: " + (m.result.exceptionDetails.exception?.description || JSON.stringify(m.result.exceptionDetails)));
    return m.result?.result?.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");

  let ready = false;
  for (let i = 0; i < 60; i++) {
    await sleep(150);
    try { if (await evalIn("window.__voltReady === true")) { ready = true; break; } } catch {}
  }
  if (!ready) throw new Error("volt.js did not load in the page");

  const { results } = await evalIn(PROGRAM);
  let failed = 0;
  for (const t of results) {
    console.log(`${t.ok ? "✓" : "✗"} ${t.name}`);
    if (!t.ok) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} DOM checks passed (${bin})`);
  if (failed) throw new Error(`${failed} browser check(s) failed`);
}

main()
  .then(() => { cleanup(); process.exit(0); })
  .catch((e) => { console.error(`\n✗ browser tests FAILED: ${e.message}`); cleanup(); process.exit(1); });
