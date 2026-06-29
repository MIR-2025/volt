// app.js — the Volt product + docs site, built with Volt. Landing page + a
// hash-routed docs section, rendered from signals. (Yes, this whole site is a
// Volt app: no build step, one file you can read.)
import { signal, html, mount } from "/volt.js";

const GH = "https://github.com/MIR-2025/volt";
const NPM = "https://www.npmjs.com/package/create-volt";

const copy = (text) => (e) => {
  navigator.clipboard?.writeText(text);
  const b = e.currentTarget;
  const t = b.textContent;
  b.textContent = "✓ copied";
  setTimeout(() => (b.textContent = t), 1200);
};
const cmd = (text) =>
  html`<div class="cmd d-flex align-items-center justify-content-between gap-2 p-2 ps-3 my-2">
    <code style="white-space:pre-wrap">${text}</code>
    <button class="btn btn-sm btn-outline-secondary flex-shrink-0" onclick=${copy(text)}>Copy</button>
  </div>`;
const codeblock = (text) => html`<pre class="my-3">${text}</pre>`;

// --- router (hash-based) ---
const route = signal(location.hash || "#/");
addEventListener("hashchange", () => {
  route(location.hash || "#/");
  scrollTo(0, 0);
});
const inDocs = () => route().startsWith("#/docs");

// --- docs content ---
const SECTIONS = [
  {
    id: "getting-started",
    title: "Getting started",
    body: () =>
      html`<div>
        <h2 class="h4 mb-3">Getting started</h2>
        <p class="lead2">One command scaffolds an app. No build step, no config to hand-write.</p>
        ${cmd("npm create volt@latest my-app")}
        ${cmd("cd my-app && npm run dev")}
        <p>The <strong>first run opens a setup wizard</strong> in your browser — tick the features you want (auth, realtime, a database), fill in settings, click <em>Apply</em>, and the app starts. On a headless/remote box it prints a link + an SSH-tunnel command instead. Reopen settings anytime with <code>npm run dev -- --edit</code>.</p>
        <p class="lead2">Requirements: Node.js ≥ 16.7. Works on Linux, macOS, and Windows (no <code>--env-file</code> flag needed — <code>.env</code> is auto-loaded).</p>
      </div>`,
  },
  {
    id: "templates",
    title: "Templates",
    body: () =>
      html`<div>
        <h2 class="h4 mb-3">Templates</h2>
        <p class="lead2">Pick one with <code>--template</code> (default: <code>default</code>).</p>
        ${cmd("npm create volt@latest my-app -- --template starter")}
        <table class="table table-dark table-borderless cmp mt-2">
          <thead><tr><th>Template</th><th>What you get</th></tr></thead>
          <tbody>
            <tr><td class="accent">default</td><td>Counter + Todos demo on the signal engine. Add-ons off; turn them on in the wizard.</td></tr>
            <tr><td class="accent">starter</td><td>A full app shell, everything on out of the box: nav + Home, magic-link Account, per-user Notes (CRUD), and realtime Chat.</td></tr>
            <tr><td class="accent">guestbook</td><td>A focused real app: magic-link auth + a Socket.io message board over pluggable Mongo/MySQL/Postgres storage.</td></tr>
          </tbody>
        </table>
      </div>`,
  },
  {
    id: "library",
    title: "The library",
    body: () =>
      html`<div>
        <h2 class="h4 mb-3">The Volt library</h2>
        <p class="lead2">Fine-grained signals, two authoring styles, one ~260-line file. Not React: no JSX, no virtual DOM, no re-render-the-world — reading a signal subscribes that exact piece of UI; writing it updates only the text/attribute that changed.</p>
        ${codeblock(`import { signal, computed, effect, el, html, mount } from "/volt.js";

const n = signal(0);                 // n() reads, n(next) writes
const even = computed(() => n() % 2 === 0);
effect(() => console.log("n is", n())); // re-runs when n changes

// imperative style
const view = el("button", { onClick: () => n(n() + 1) }, () => String(n()));

// template style — \${signal} holes update in place
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
        <p>Interpolated values render as <strong>text nodes (HTML-escaped)</strong> — so user content can't inject markup.</p>
      </div>`,
  },
  {
    id: "addons",
    title: "Add-ons",
    body: () =>
      html`<div>
        <h2 class="h4 mb-3">Add-ons</h2>
        <p class="lead2">Apps ship with add-ons <strong>bundled but off</strong>. The setup wizard turns them on — pure config: it writes <code>.env</code>, adds any needed packages, runs <code>npm install</code>, and the app auto-wires whatever's enabled.</p>
        ${cmd("npm run dev -- --edit")}
        <table class="table table-dark table-borderless cmp mt-2">
          <thead><tr><th>Add-on</th><th>What it gives you</th></tr></thead>
          <tbody>
            <tr><td class="accent">db</td><td>Document store: memory / MongoDB / MySQL / Postgres — one interface.</td></tr>
            <tr><td class="accent">mailer</td><td>Console (dev) / SMTP (prod) email.</td></tr>
            <tr><td class="accent">auth</td><td>Magic-link login + sessions (pulls in db + mailer).</td></tr>
            <tr><td class="accent">realtime</td><td>Socket.io chat: rooms, presence, typing (pulls in db).</td></tr>
          </tbody>
        </table>
        <p>Enabling an add-on wires its backend automatically; <code>auth</code> and <code>realtime</code> also ship a frontend UI. The DB driver is swappable at any time from the wizard.</p>
      </div>`,
  },
  {
    id: "studio",
    title: "Studio",
    body: () =>
      html`<div>
        <h2 class="h4 mb-3">Studio</h2>
        <p class="lead2">An ephemeral, localhost-only data browser — like Prisma Studio. Browse collections + documents across any driver, delete docs.</p>
        ${cmd("npm run dev -- --studio")}
        <p>It connects the database in your <code>.env</code> and is <strong>never a route in the running app</strong> — it exists only while you run it, binds <code>127.0.0.1</code>, and disappears on Ctrl-C. Shell/SSH access is the auth. Internal collections (auth tokens/sessions) are hidden.</p>
      </div>`,
  },
  {
    id: "security",
    title: "Security",
    body: () =>
      html`<div>
        <h2 class="h4 mb-3">Security model</h2>
        <p class="lead2">Volt is built to avoid the class of problems that make a CMS a perennial target. The core idea: <strong>privileged surfaces are ephemeral, not standing.</strong></p>
        <ul class="lead2">
          <li><strong>No web admin.</strong> Nothing like <code>/wp-admin</code> anywhere. Config (<code>--edit</code>) and the data browser (<code>--studio</code>) are on-demand, localhost-only, and gone when the app runs — shell/SSH access is the auth.</li>
          <li><strong>Multiple admins = multiple SSH keys</strong> — per-person, revocable, audited; nothing public to brute-force.</li>
          <li><strong>No XSS by construction</strong> — all dynamic content renders as escaped text nodes; never <code>innerHTML</code> for user data.</li>
          <li><strong>Validation + caps</strong> server-side; <code>.env</code> values newline-stripped.</li>
          <li><strong>Security headers</strong> on every response; sessions are <code>HttpOnly</code> + <code>SameSite=Lax</code>; magic-link tokens are single-use, time-limited, same-browser.</li>
          <li><strong>No build step</strong> — no opaque toolchain to trust.</li>
        </ul>
        <p>Full write-up: <a href="${GH}/blob/main/SECURITY.md" target="_blank" rel="noopener">SECURITY.md</a>.</p>
      </div>`,
  },
  {
    id: "cli",
    title: "CLI reference",
    body: () =>
      html`<div>
        <h2 class="h4 mb-3">CLI reference</h2>
        ${codeblock(`npm create volt@latest <dir> [options]   # scaffold
  --template <name>   default | starter | guestbook
  --port <number>     dev port (default: derived from today's date)
  --start             scaffold, then run the dev server
  --no-git            don't init a git repo
  --skip-install      don't install dependencies

# inside an app:
npx create-volt@latest update     # refresh public/volt.js
npx create-volt@latest config     # open the setup wizard (= npm run dev -- --edit)
npx create-volt@latest studio     # ephemeral data browser`)}
        <p class="lead2">The dev port defaults to the creation date (YY+M+DD, e.g. <code>2026-06-28 → 26628</code>) so apps made on different days never collide; override with <code>--port</code> or the <code>PORT</code> env var.</p>
      </div>`,
  },
  {
    id: "deploy",
    title: "Deploy",
    body: () =>
      html`<div>
        <h2 class="h4 mb-3">Deploy</h2>
        <p class="lead2">It's a plain Node app — run it anywhere. Under PM2, behind nginx:</p>
        ${codeblock(`# on the server
PORT=8080 pm2 start server.js --name my-app
pm2 save

# nginx: proxy your domain → 127.0.0.1:8080`)}
        <p>Make sure a <code>.env</code> exists in production (so it boots the app, not the localhost setup wizard). This very site is a Volt app deployed exactly this way.</p>
      </div>`,
  },
];

// --- views ---
const navbar = () =>
  html`<nav class="navx py-2">
    <div class="container d-flex align-items-center gap-3" style="max-width:1000px">
      <a class="brand h5 mb-0 accent" href="#/">⚡ Volt</a>
      <a class=${() => (inDocs() ? "active ms-2" : "ms-2")} href="#/docs">Docs</a>
      <a class="ms-auto" href=${GH} target="_blank" rel="noopener">GitHub</a>
      <a href=${NPM} target="_blank" rel="noopener">npm</a>
    </div>
  </nav>`;

const feat = (title, body) => html`<div class="col-md-4 mb-3"><div class="feat p-3"><h3 class="h6 accent">${title}</h3><p class="lead2 small mb-0">${body}</p></div></div>`;

const home = () =>
  html`<div class="container py-5" style="max-width:1000px">
    <div class="hero text-center py-4">
      <h1 class="display-4 mb-3">The <span class="accent">no-build</span> web framework.<br />Secure by default.</h1>
      <p class="lead2 fs-5 mb-4" style="max-width:680px;margin:0 auto">Scaffold an app in one command. Toggle auth, realtime, and a database from a config wizard. Ship — <strong>more secure than WordPress, simpler than the React stacks.</strong></p>
      <div style="max-width:520px;margin:0 auto">${cmd("npm create volt@latest my-app")}</div>
      <div class="mt-3">
        <a class="btn btn-primary" href="#/docs">Read the docs →</a>
        <a class="btn btn-outline-secondary ms-2" href=${GH} target="_blank" rel="noopener">Star on GitHub</a>
      </div>
    </div>

    <div class="row mt-5">
      ${feat("No build step", "The whole framework is one ~260-line file. Edit, save, hot-reload. No bundler, no transpile, no toolchain to trust.")}
      ${feat("Fine-grained signals", "Reading a signal subscribes that exact piece of UI; writing updates only the text/attribute that changed. No virtual DOM.")}
      ${feat("Secure by default", "Escaping by construction, validation + caps, security headers, HttpOnly cookies — and no standing /wp-admin to attack.")}
      ${feat("Config-driven add-ons", "Turn on db (Mongo/MySQL/Postgres), auth (magic-link), realtime (Socket.io), and email from a wizard. The app auto-wires them.")}
      ${feat("Ephemeral admin", "Config and the data browser (Studio) are on-demand, localhost-only tools that vanish when the app runs. Shell access is the auth.")}
      ${feat("Three templates", "default (minimal), starter (full app shell), guestbook (focused real app). Pick with --template.")}
    </div>

    <h2 class="h4 mt-5 mb-3 text-center">How it compares</h2>
    <table class="table table-dark table-borderless cmp">
      <thead><tr><th></th><th class="accent">Volt</th><th>WordPress</th><th>React stacks</th></tr></thead>
      <tbody>
        <tr><td>Build step</td><td class="accent">none</td><td>none (PHP)</td><td>bundler/transpile</td></tr>
        <tr><td>Admin surface</td><td class="accent">ephemeral, localhost</td><td>always-on /wp-admin</td><td>n/a (you build it)</td></tr>
        <tr><td>Auth / realtime / DB</td><td class="accent">toggle in a wizard</td><td>plugins</td><td>wire it yourself</td></tr>
        <tr><td>Customization</td><td class="accent">readable files</td><td>themes + DB</td><td>code</td></tr>
        <tr><td>Data browser</td><td class="accent">built-in (Studio)</td><td>via plugin</td><td>separate tool</td></tr>
      </tbody>
    </table>

    <div class="text-center mt-5">
      <h2 class="h4 mb-3">Get started</h2>
      <div style="max-width:520px;margin:0 auto">${cmd("npm create volt@latest my-app")}${cmd("cd my-app && npm run dev")}</div>
    </div>
  </div>`;

const docs = () =>
  html`<div class="container py-4" style="max-width:1000px">
    <div class="row">
      <div class="col-md-3 docs-side mb-3">
        <div class="position-sticky" style="top:70px">
          ${SECTIONS.map((s) => html`<a class=${() => (route() === "#/docs/" + s.id || (route() === "#/docs" && s.id === SECTIONS[0].id) ? "active" : "")} href=${"#/docs/" + s.id}>${s.title}</a>`)}
        </div>
      </div>
      <div class="col-md-9">
        ${() => {
          const id = (route().match(/^#\/docs\/(.+)$/) || [])[1] || SECTIONS[0].id;
          const sec = SECTIONS.find((s) => s.id === id) || SECTIONS[0];
          return sec.body();
        }}
      </div>
    </div>
  </div>`;

const footer = () =>
  html`<footer class="py-4 mt-5">
    <div class="container d-flex flex-wrap gap-3 small" style="max-width:1000px">
      <span>⚡ Volt — MIT licensed.</span>
      <a class="ms-auto" href=${GH} target="_blank" rel="noopener">GitHub</a>
      <a href=${NPM} target="_blank" rel="noopener">npm</a>
      <a href="#/docs">Docs</a>
      <span class="badge-soft px-2 py-1 rounded">built with Volt</span>
    </div>
  </footer>`;

mount("#app", navbar(), () => (inDocs() ? docs() : home()), footer());
