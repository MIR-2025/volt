// content.js — the site, built with Volt. Marketing pages (home / build /
// compare) are Volt components authored in html``; docs pages are markdown files
// in ./content/*.md rendered with marked. Everything is composed by Volt's SSR
// renderer (volt-ssr.js) in server.js. The split mirrors a CMS: content is data
// (markdown), the theme/templates are code.

import { html, raw } from "./public/volt-ssr.js";
import { marked } from "marked";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, "content");

// copy-able command line (enhance.js wires the button). html`` escapes ${text}.
const cmd = (text) =>
  html`<div class="cmd"><code>${text}</code><button class="copy" type="button" data-copy="${text}">Copy</button></div>`;
const code = (text) => html`<pre><code>${text}</code></pre>`;

const GH = "https://github.com/MIR-2025/volt";
const NPM = "https://www.npmjs.com/package/create-volt";

// ----- landing -----
const feat = (t, b) => html`<div class="col-md-4 mb-3"><div class="feat p-3"><h3 class="h6 accent">${t}</h3><p class="lead2 small mb-0">${b}</p></div></div>`;

const home = {
  path: "/",
  title: "Volt — a no-build, signals-based UI library with a secure-by-default scaffold",
  desc: "Volt is a tiny, no-build, signals-based UI library with a create-volt app scaffold. No JSX, no virtual DOM, no build step — and no standing admin surface to attack.",
  body: html`
    <section class="hero text-center py-4">
      <h1 class="display-5 mb-3">A <span class="accent">no-build</span>, signals-based UI library.<br /><span class="lead2 fs-3">With a secure-by-default app scaffold.</span></h1>
      <p class="lead2 fs-5" style="max-width:720px;margin:0 auto">Closer to a tiny Solid/Preact-style reactive core than to React or a CMS. No JSX, no virtual DOM, no build step — signals update the exact text node that changed. Scaffold an app in one command; toggle auth, realtime, and a database from a config wizard.</p>
      <div style="max-width:520px;margin:1rem auto 0">${cmd("npm create volt@latest my-app")}</div>
      <div class="mt-3">
        <a class="btn btn-primary" href="/build">Build a login-protected CRUD app in 10 min →</a>
        <a class="btn btn-outline-secondary ms-2" href="/docs">Docs</a>
      </div>
      <div id="volt-demo" class="mt-4"></div>
    </section>

    <div class="row mt-4">
      ${feat("No build step", "The whole library is one ~260-line file. Edit, save, hot-reload. No bundler, no transpile, no toolchain to trust.")}
      ${feat("Fine-grained signals", "Reading a signal subscribes that exact piece of UI; writing updates only the text/attribute that changed. No virtual DOM, no re-render-the-world.")}
      ${feat("Secure by default", "Escaping by construction, validation + caps, security headers, HttpOnly cookies — and no standing /wp-admin to attack.")}
      ${feat("One-command scaffold", "create-volt builds a runnable app: pick a template, toggle add-ons (db, auth, realtime, email) in a wizard, ship.")}
      ${feat("Ephemeral admin", "Config (--edit) and the data browser (--studio) are on-demand, localhost-only tools that vanish when the app runs. Shell access is the auth.")}
      ${feat("Honest scope", "Great for prototypes, dashboards, admin-ish tools, demos, and small-to-medium “just ship it” apps. Not a React-ecosystem replacement.")}
    </div>

    <h2 class="h4 mt-5 mb-3 text-center">Where it fits</h2>
    <table class="table table-dark table-borderless cmp">
      <thead><tr><th></th><th class="accent">Volt</th><th>React stacks</th><th>WordPress</th></tr></thead>
      <tbody>
        <tr><td>What it is</td><td class="accent">tiny signals UI + scaffold</td><td>component ecosystem</td><td>CMS / publishing</td></tr>
        <tr><td>Build step</td><td class="accent">none</td><td>bundler / transpile</td><td>none (PHP)</td></tr>
        <tr><td>Admin surface</td><td class="accent">ephemeral, localhost</td><td>you build it</td><td>always-on /wp-admin</td></tr>
        <tr><td>Best for</td><td class="accent">small–medium apps, dashboards, demos</td><td>large apps, scale, hiring, native, SSR</td><td>content + editors + plugins</td></tr>
      </tbody>
    </table>
    <p class="lead2 text-center small">Volt isn't a React replacement — it's an anti-complexity tool for when React's tooling is overkill. It isn't a CMS — there's no public admin and no nontechnical editing.</p>

    <div class="text-center mt-5">
      <h2 class="h4 mb-3">Get started</h2>
      <div style="max-width:520px;margin:0 auto">${cmd("npm create volt@latest my-app")}${cmd("cd my-app && npm run dev")}</div>
    </div>`,
};

// ----- the killer demo -----
const build = {
  path: "/build",
  title: "Build a login-protected CRUD app in 10 minutes — no build step | Volt",
  desc: "A step-by-step: scaffold, run, and read the ~40 lines that make a magic-link, per-user CRUD app over a real database with Volt. No build tooling.",
  body: html`
    <span class="badge-soft px-2 py-1 rounded small">the killer demo</span>
    <h1 class="display-6 mt-2 mb-2">Build a <span class="accent">login-protected CRUD app</span><br />in 10 minutes — no build step.</h1>
    <p class="lead2 fs-5">Magic-link auth, a per-user database, and a working CRUD UI. One command to a running app; the rest is just reading the ~40 lines that power it.</p>

    <h2 class="h5 mt-4">1 · Scaffold it <span class="lead2 small">(~30s)</span></h2>
    ${cmd("npm create volt@latest tasks -- --template starter")}
    <p class="lead2">The <code>starter</code> ships with auth + a per-user CRUD already wired (the <strong>Account</strong> and <strong>Notes</strong> tabs). No build tool, no config to hand-write.</p>

    <h2 class="h5 mt-4">2 · Run it <span class="lead2 small">(~1 min)</span></h2>
    ${cmd("cd tasks && npm install && npm run dev")}
    <p class="lead2">Open the app, click <strong>Account</strong>, enter your email. In dev the magic link is printed to your terminal — open it, confirm, and you're signed in. The <strong>Notes</strong> tab is now your login-protected, per-user CRUD. <strong>A working app, ~90 seconds in.</strong></p>

    <h2 class="h5 mt-4">3 · The entire backend <span class="lead2 small">(it's this small)</span></h2>
    <p class="lead2">Auth is on, so every route is one <code>guard</code> from login-protected. The whole CRUD:</p>
    ${code(`import crypto from "node:crypto";

const tasks = store.collection("tasks");   // memory · Mongo · MySQL · Postgres
const guard = requireAuth(store);          // 401 unless signed in

app.get("/api/tasks", guard, async (req, res) =>
  res.json({ tasks: await tasks.find({ owner: req.user.email }) }));

app.post("/api/tasks", guard, async (req, res) => {
  const text = String(req.body.text || "").trim().slice(0, 500);
  const t = { id: crypto.randomBytes(8).toString("hex"),
              owner: req.user.email, text, done: false };
  await tasks.put(t.id, t);
  res.json({ ok: true, task: t });
});

app.delete("/api/tasks/:id", guard, async (req, res) => {
  const t = await tasks.get(req.params.id);
  if (t?.owner === req.user.email) await tasks.delete(req.params.id);
  res.json({ ok: true });
});`)}

    <h2 class="h5 mt-4">4 · The entire frontend <span class="lead2 small">(no build, no JSX)</span></h2>
    ${code(`import { signal, html, mount } from "/volt.js";

const tasks = signal([]), draft = signal("");
const load = async () => tasks((await (await fetch("/api/tasks")).json()).tasks);
const add  = async () => {
  await fetch("/api/tasks", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: draft() }) });
  draft(""); load();
};
const del = (id) => fetch("/api/tasks/" + id, { method: "DELETE" }).then(load);
load();

mount("#app", html\`
  <input value=\${draft} oninput=\${(e) => draft(e.target.value)} placeholder="New task…" />
  <button onclick=\${add}>Add</button>
  \${() => tasks().map((t) => html\`<div>\${t.text} <button onclick=\${() => del(t.id)}>✕</button></div>\`)}
\`);`)}
    <p class="lead2">User input renders as escaped text nodes — no XSS to think about. Edit, save, it hot-reloads. No bundler ran.</p>

    <h2 class="h5 mt-4">5 · Make it production-grade <span class="lead2 small">(~2 min)</span></h2>
    ${cmd("npm run dev -- --edit     # pick Postgres / MySQL / Mongo, set the URL")}
    ${cmd("npm run dev -- --studio   # browse + edit your data, localhost-only")}
    <p class="lead2">No code changes — the same <code>store.collection("tasks")</code> now talks to Postgres.</p>

    <div class="feat p-4 mt-4 text-center">
      <p class="mb-2">A login-protected, per-user CRUD app over a real database — <strong>no build step, ~40 lines you can read.</strong></p>
      <div style="max-width:520px;margin:0 auto">${cmd("npm create volt@latest tasks -- --template starter")}</div>
    </div>`,
};

// ----- docs (content is markdown in ./content/*.md; this is just the ordered nav) -----
const DOCS = [
  { id: "getting-started", title: "Getting started" },
  { id: "templates", title: "Templates" },
  { id: "library", title: "The library" },
  { id: "ssr", title: "Server rendering" },
  { id: "customize-with-ai", title: "Customize with AI" },
  { id: "add-ons", title: "Add-ons" },
  { id: "plugins", title: "Add-ons & plugins (3rd-party)" },
  { id: "editor", title: "WYSIWYG editor" },
  { id: "themes", title: "Themes" },
  { id: "pages", title: "Markdown pages" },
  { id: "posts", title: "Posts (blog)" },
  { id: "migrate", title: "Migrate from WordPress" },
  { id: "media", title: "Media uploads" },
  { id: "studio", title: "Studio" },
  { id: "security", title: "Security" },
  { id: "cli", title: "CLI reference" },
  { id: "deploy", title: "Deploy" },
];

const docHtml = (id) => marked.parse(fs.readFileSync(path.join(CONTENT_DIR, id + ".md"), "utf8"));

// ----- side-by-side comparison -----
const col = (label, badge, codeStr) =>
  html`<div class="col-lg-4 mb-3"><div class="feat p-3 h-100"><div class="d-flex justify-content-between align-items-center mb-1"><span class="accent fw-bold">${label}</span><span class="badge-soft px-2 py-1 rounded small">${badge}</span></div>${code(codeStr)}</div></div>`;
const task = (title, note, volt, react, wp) =>
  html`<h2 class="h4 mt-5 mb-1">${title}</h2><p class="lead2 small mb-2">${note}</p><div class="row">${col("Volt", "no build", volt)}${col("React stack", "needs bundler", react)}${col("WordPress", "plugin + DB", wp)}</div>`;

const compare = {
  path: "/compare",
  title: "Volt vs React vs WordPress — side-by-side code | Volt",
  desc: "The same three tasks — a counter, a per-user CRUD list, and login — built in Volt, a React stack, and WordPress. See where each one fits in 30 seconds.",
  body: html`
    <h1 class="display-6 mb-2">Volt vs React vs WordPress</h1>
    <p class="lead2 fs-5">The same three tasks in each — a counter, a per-user CRUD list, and login. Different tools for different jobs; this just makes the trade-off concrete.</p>

    ${task(
      "A counter",
      "The “hello world” of reactivity.",
      `import { signal, html, mount } from "/volt.js";

const n = signal(0);
mount("#app",
  html\`<button onclick=\${() => n(n() + 1)}>\${n}</button>\`);
// no build — save and it hot-reloads`,
      `import { useState } from "react";

export default function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>{n}</button>;
}
// + Vite/Next, npm install, a build step`,
      `// no native counter — functions.php:
add_shortcode('counter', fn() =>
  '<button onclick="this.textContent=
     +this.textContent+1">0</button>');
// then type [counter] into a post`,
    )}

    ${task(
      "A per-user CRUD list",
      "Create/read/delete, scoped to the logged-in user.",
      `// server.js — auth add-on already on
const todos = store.collection("todos");
const guard = requireAuth(store);

app.get("/api/todos", guard, async (req, res) =>
  res.json({ todos: await todos.find({ owner: req.user.email }) }));
app.post("/api/todos", guard, async (req, res) => {
  await todos.put(id(), { owner: req.user.email, text: req.body.text });
  res.json({ ok: true });
});
// + a ~10-line Volt list. That's it.`,
      `function Todos() {
  const [items, set] = useState([]);
  useEffect(() => {
    fetch("/api/todos").then(r => r.json()).then(set);
  }, []);
  // ...and you still build the API,
  // the auth, and the database yourself
}`,
      `// a custom post type or a CRUD plugin
register_post_type('todo', [ /* ... */ ]);
// data lives in wp_posts + wp_postmeta,
// edited through /wp-admin; per-user
// scoping needs a plugin or custom
// meta_query in PHP`,
    )}

    ${task(
      "Login",
      "Authenticated sessions for real users.",
      `# enable the auth add-on — no code:
npm run dev -- --edit      # tick "auth"

# magic-link login + sessions are wired.
# guard any route:
app.get("/me", requireAuth(store),
  (req, res) => res.json(req.user));`,
      `// choose a library, then configure it
import NextAuth from "next-auth";
export default NextAuth({
  providers: [ /* ... */ ],
  // + a session store, callbacks,
  // env secrets, route handlers
});`,
      `// built-in users at /wp-admin/, or for
// front-end login install a membership
// plugin, then configure roles + pages
// in the dashboard (often a paid add-on)`,
    )}

    <h2 class="h4 mt-5 mb-2">Where each one wins</h2>
    <table class="table table-dark table-borderless cmp">
      <thead><tr><th></th><th class="accent">Volt</th><th>React stack</th><th>WordPress</th></tr></thead>
      <tbody>
        <tr><td>Build step</td><td class="accent">none</td><td>bundler / transpile</td><td>none (PHP)</td></tr>
        <tr><td>Auth</td><td class="accent">toggle an add-on</td><td>wire a library</td><td>built-in / plugin</td></tr>
        <tr><td>Data</td><td class="accent">store.collection(...)</td><td>your own DB layer</td><td>wp_posts + plugins</td></tr>
        <tr><td>Where you edit</td><td class="accent">your files</td><td>your files</td><td>/wp-admin + DB</td></tr>
        <tr><td>Best for</td><td class="accent">small–medium apps, dashboards</td><td>large apps, scale, hiring</td><td>content, editors, plugins</td></tr>
      </tbody>
    </table>
    <p class="lead2 small">This isn't “WordPress bad” — it's the best tool in the world when content and nontechnical editors are the point. The comparison is about <strong>code-owned apps</strong>, where Volt's smallness and no-build feedback loop win, versus React, where you trade setup for a vast ecosystem.</p>

    <div class="text-center mt-4">
      <div style="max-width:520px;margin:0 auto">${cmd("npm create volt@latest my-app")}</div>
    </div>`,
};

const docsPage = (id) => {
  const idx = Math.max(0, DOCS.findIndex((d) => d.id === id));
  const cur = DOCS[idx];
  const side = DOCS.map((d) => html`<a class="${d.id === cur.id ? "active" : ""}" href="/docs/${d.id}">${d.title}</a>`);
  return {
    path: `/docs/${cur.id}`,
    title: `${cur.title} — Volt docs`,
    desc: `Volt documentation: ${cur.title}.`,
    body: html`<div class="row"><div class="col-md-3 docs-side mb-3"><div class="position-sticky" style="top:70px">${side}</div></div><div class="col-md-9 docs-content">${raw(docHtml(cur.id))}</div></div>`,
  };
};

export { home, build, compare, DOCS, docsPage, GH, NPM };
