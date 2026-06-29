// content.js — the site content as server-rendered HTML (no build step, no SPA).
// Each page returns { title, desc, path, body } so server.js can emit real,
// crawlable HTML per URL with proper <title>/meta/canonical/OG. A small Volt
// widget + enhance.js progressively enhance it in the browser.

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// copy-able command line (enhance.js wires the button)
const cmd = (text) =>
  `<div class="cmd"><code>${esc(text)}</code><button class="copy" type="button" data-copy="${esc(text)}">Copy</button></div>`;
const code = (text) => `<pre><code>${esc(text)}</code></pre>`;

const GH = "https://github.com/MIR-2025/volt";
const NPM = "https://www.npmjs.com/package/create-volt";

// ----- landing -----
const feat = (t, b) => `<div class="col-md-4 mb-3"><div class="feat p-3"><h3 class="h6 accent">${t}</h3><p class="lead2 small mb-0">${b}</p></div></div>`;

const home = {
  path: "/",
  title: "Volt — a no-build, signals-based UI library with a secure-by-default scaffold",
  desc: "Volt is a tiny, no-build, signals-based UI library with a create-volt app scaffold. No JSX, no virtual DOM, no build step — and no standing admin surface to attack.",
  body: `
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
  body: `
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

// ----- docs sections -----
const DOCS = [
  {
    id: "getting-started",
    title: "Getting started",
    body: `<h1 class="h3 mb-3">Getting started</h1>
      <p class="lead2">One command scaffolds an app. No build step, no config to hand-write.</p>
      ${cmd("npm create volt@latest my-app")}${cmd("cd my-app && npm run dev")}
      <p>The <strong>first run opens a setup wizard</strong> in your browser — tick the features you want (auth, realtime, a database), fill in settings, click <em>Apply</em>, and the app starts. On a headless/remote box it prints a link + an SSH-tunnel command. Reopen settings anytime with <code>npm run dev -- --edit</code>.</p>
      <p class="lead2">Requirements: Node.js ≥ 16.7. Works on Linux, macOS, and Windows — <code>.env</code> is auto-loaded, no <code>--env-file</code> flag.</p>`,
  },
  {
    id: "templates",
    title: "Templates",
    body: `<h1 class="h3 mb-3">Templates</h1>
      <p class="lead2">Pick one with <code>--template</code> (default: <code>default</code>).</p>
      ${cmd("npm create volt@latest my-app -- --template starter")}
      <table class="table table-dark table-borderless cmp mt-2"><thead><tr><th>Template</th><th>What you get</th></tr></thead><tbody>
        <tr><td class="accent">default</td><td>Counter + Todos demo on the signal engine. Add-ons off; turn them on in the wizard.</td></tr>
        <tr><td class="accent">starter</td><td>A full app shell, on out of the box: nav + Home, magic-link Account, per-user Notes (CRUD), realtime Chat.</td></tr>
        <tr><td class="accent">guestbook</td><td>A focused real app: magic-link auth + a Socket.io message board over Mongo/MySQL/Postgres.</td></tr>
      </tbody></table>`,
  },
  {
    id: "library",
    title: "The library",
    body: `<h1 class="h3 mb-3">The Volt library</h1>
      <p class="lead2">Fine-grained signals, two authoring styles, one ~260-line file. Not React: no JSX, no virtual DOM — reading a signal subscribes that exact piece of UI; writing touches only the text/attribute that changed.</p>
      ${code(`import { signal, computed, effect, el, html, mount } from "/volt.js";

const n = signal(0);                  // n() reads, n(next) writes
const even = computed(() => n() % 2 === 0);
effect(() => console.log("n is", n()));

const view = el("button", { onClick: () => n(n() + 1) }, () => String(n()));
const card = html\`<p>\${n} is \${() => (even() ? "even" : "odd")}</p>\`;
mount("#app", view, card);`)}
      <ul class="lead2">
        <li><code>signal(initial)</code> — getter/setter function.</li>
        <li><code>computed(fn)</code> — read-only derived signal.</li>
        <li><code>effect(fn)</code> — runs fn, re-runs on change; returns a disposer.</li>
        <li><code>el(tag, props?, ...children)</code> — a DOM element; function props/children are live.</li>
        <li><code>html\`…\`</code> — tagged-template markup; <code>\${signal}</code> holes, <code>onclick=\${fn}</code>, <code>value=\${signal}</code>.</li>
        <li><code>mount(target, ...children)</code> — append into a selector/element.</li>
      </ul>
      <p>Interpolated values render as text nodes (HTML-escaped) — user content can't inject markup.</p>`,
  },
  {
    id: "customize-with-ai",
    title: "Customize with AI",
    body: `<h1 class="h3 mb-3">Customize with AI</h1>
      <p class="lead2">Volt is unusually friendly to AI coding tools (Claude Code, Cursor, Copilot, …) — and that's not an accident. The qualities that make it small make it easy for an AI to understand and change correctly.</p>
      <h2 class="h5 mt-4">Why it works so well</h2>
      <ul class="lead2">
        <li><strong>One readable file.</strong> The entire UI library is ~260 lines of plain JS — an AI can hold all of it in context and reason about the whole framework, not a slice of a giant ecosystem.</li>
        <li><strong>No build step.</strong> The AI edits a file, you save, it hot-reloads. There's no bundler/transpiler config for the AI to get wrong, and no opaque error surface between the code and the result.</li>
        <li><strong>Plain files, not a database.</strong> Your app <em>is</em> <code>server.js</code>, <code>public/app.js</code>, <code>views/</code>, and <code>.env</code> — readable, diffable, version-controlled. There's no hidden config in a DB (the WordPress problem) for an AI to be blind to.</li>
        <li><strong>Safe by construction.</strong> Volt interpolations render as escaped text nodes, so an AI can't accidentally introduce an XSS hole by templating user data.</li>
      </ul>
      <h2 class="h5 mt-4">How to do it</h2>
      <p class="lead2">Open the app in your AI editor, point it at the relevant files, and ask. Give it <code>public/volt.js</code> plus the file you're changing, and mention the API (<a href="/docs/library">signal / computed / el / html / mount</a>). Then run <code>npm run dev</code> and watch it hot-reload.</p>
      ${cmd("npm run dev      # keep it running; AI edits hot-reload live")}
      <h2 class="h5 mt-4">Prompts that just work</h2>
      <ul class="lead2">
        <li>“Add a <em>priority</em> field to tasks — a low/med/high dropdown — and sort the list by it.”</li>
        <li>“Add a dark/light theme toggle stored in localStorage.”</li>
        <li>“Add pagination to the notes list, 20 per page.”</li>
        <li>“When a new item is added, email me a summary using the mailer add-on.”</li>
        <li>“Turn on realtime so the list updates live across tabs.” (the AI enables it via <code>--edit</code> + the realtime add-on)</li>
      </ul>
      <p class="lead2 small">Tip: have the AI <em>run the app and verify in a browser</em>, not just write code. No build step means the feedback loop is seconds.</p>
      <p class="lead2 small">Volt itself — and this site — were built this way.</p>`,
  },
  {
    id: "add-ons",
    title: "Add-ons",
    body: `<h1 class="h3 mb-3">Add-ons</h1>
      <p class="lead2">Apps ship with add-ons bundled but off. The wizard turns them on — pure config: it writes <code>.env</code>, adds packages, runs <code>npm install</code>, and the app auto-wires what's enabled.</p>
      ${cmd("npm run dev -- --edit")}
      <table class="table table-dark table-borderless cmp mt-2"><thead><tr><th>Add-on</th><th>What it gives you</th></tr></thead><tbody>
        <tr><td class="accent">db</td><td>Document store: memory / MongoDB / MySQL / Postgres — one interface.</td></tr>
        <tr><td class="accent">mailer</td><td>Console (dev) / SMTP (prod) email.</td></tr>
        <tr><td class="accent">auth</td><td>Magic-link login + sessions (pulls in db + mailer).</td></tr>
        <tr><td class="accent">realtime</td><td>Socket.io chat: rooms, presence, typing (pulls in db).</td></tr>
      </tbody></table>`,
  },
  {
    id: "studio",
    title: "Studio",
    body: `<h1 class="h3 mb-3">Studio</h1>
      <p class="lead2">An ephemeral, localhost-only data browser — like Prisma Studio.</p>
      ${cmd("npm run dev -- --studio")}
      <p>It connects the database in your <code>.env</code> and is <strong>never a route in the running app</strong> — it exists only while you run it, binds <code>127.0.0.1</code>, and disappears on Ctrl-C. Shell/SSH access is the auth; internal collections (auth tokens/sessions) are hidden.</p>`,
  },
  {
    id: "security",
    title: "Security",
    body: `<h1 class="h3 mb-3">Security model</h1>
      <p class="lead2">Privileged surfaces are ephemeral, not standing — the opposite of an always-on CMS admin.</p>
      <ul class="lead2">
        <li><strong>No web admin.</strong> Nothing like <code>/wp-admin</code>. Config (<code>--edit</code>) and the data browser (<code>--studio</code>) are on-demand, localhost-only; shell/SSH is the auth.</li>
        <li><strong>Multiple admins = multiple SSH keys</strong> — per-person, revocable, audited; nothing public to brute-force.</li>
        <li><strong>No XSS by construction</strong> — dynamic content renders as escaped text nodes.</li>
        <li><strong>Validation + caps</strong> server-side; <code>.env</code> values newline-stripped.</li>
        <li><strong>Security headers</strong> on every response; sessions <code>HttpOnly</code> + <code>SameSite=Lax</code>; magic-link tokens single-use, time-limited, same-browser.</li>
      </ul>
      <p>Full write-up: <a href="${GH}/blob/main/SECURITY.md">SECURITY.md</a>.</p>`,
  },
  {
    id: "cli",
    title: "CLI reference",
    body: `<h1 class="h3 mb-3">CLI reference</h1>
      ${code(`npm create volt@latest <dir> [options]   # scaffold
  --template <name>   default | starter | guestbook
  --port <number>     dev port (default: derived from today's date)
  --start             scaffold, then run the dev server
  --no-git            don't init a git repo
  --skip-install      don't install dependencies

# inside an app:
npx create-volt@latest update     # refresh public/volt.js
npx create-volt@latest config     # open the setup wizard (= npm run dev -- --edit)
npx create-volt@latest studio     # ephemeral data browser`)}
      <p class="lead2">The dev port defaults to the creation date (YY+M+DD, e.g. <code>2026-06-28 → 26628</code>) so apps made on different days never collide.</p>`,
  },
  {
    id: "deploy",
    title: "Deploy",
    body: `<h1 class="h3 mb-3">Deploy</h1>
      <p class="lead2">It's a plain Node app — run it anywhere. Under PM2, behind nginx:</p>
      ${code(`PORT=8080 pm2 start server.js --name my-app
pm2 save
# nginx: proxy your domain → 127.0.0.1:8080`)}
      <p>Ensure a <code>.env</code> exists in production (so it boots the app, not the localhost wizard). This very site is a Volt-scaffolded Node app deployed exactly this way.</p>`,
  },
];

const docsPage = (id) => {
  const idx = Math.max(0, DOCS.findIndex((d) => d.id === id));
  const cur = DOCS[idx];
  const side = DOCS.map((d) => `<a class="${d.id === cur.id ? "active" : ""}" href="/docs/${d.id}">${d.title}</a>`).join("");
  return {
    path: `/docs/${cur.id}`,
    title: `${cur.title} — Volt docs`,
    desc: `Volt documentation: ${cur.title}.`,
    body: `<div class="row"><div class="col-md-3 docs-side mb-3"><div class="position-sticky" style="top:70px">${side}</div></div><div class="col-md-9">${cur.body}</div></div>`,
  };
};

export { home, build, DOCS, docsPage, GH, NPM };
