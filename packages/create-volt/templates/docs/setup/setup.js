// setup.js — first-run / --edit wizard, built with Volt. Tick add-ons + fill
// settings → writes .env (a VOLT_ADDONS list + settings), adds any needed
// packages, installs, and starts the app. Add-on code is bundled; enabling is
// just config.
import { signal, computed, html, mount } from "/volt.js";

const { available, themes = [], current, defaultPort, configDefaultPort = 5050 } = await (await fetch("/setup/state")).json();
const depsOf = Object.fromEntries(available.map((a) => [a.name, a.dependsOn || []]));
const order = available.map((a) => a.name);
const enabledNow = new Set(String(current.VOLT_ADDONS || "").split(",").map((s) => s.trim()).filter(Boolean));

const state = signal({
  addons: Object.fromEntries(available.map((a) => [a.name, enabledNow.has(a.name)])),
  dbDriver: current.DB_DRIVER || "memory",
  mongoUri: current.MONGODB_URI || "",
  mongoDb: current.MONGODB_DATABASE || "",
  dbUrl: current.DATABASE_URL || "",
  smtpUrl: current.SMTP_URL || "",
  mailFrom: current.MAIL_FROM || "",
  mediaDriver: current.MEDIA_DRIVER || "local",
  s3Endpoint: current.S3_ENDPOINT || "",
  s3Region: current.S3_REGION || "",
  s3Bucket: current.S3_BUCKET || "",
  s3Key: current.S3_KEY || "",
  s3Secret: current.S3_SECRET || "",
  s3PublicBase: current.S3_PUBLIC_BASE || "",
  port: current.PORT || String(defaultPort),
  // detect the admin's timezone from their browser (the wizard runs here), so
  // dates render in their zone — not the server's (usually UTC on a host).
  tz: current.SITE_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  siteName: current.SITE_NAME || "",
  siteUrl: current.SITE_URL || "",
  configPort: current.CONFIG_PORT || "",
  theme: current.THEME || "",
  aiProvider: current.AI_PROVIDER || "anthropic",
  aiKey: current.ANTHROPIC_API_KEY || current.OPENAI_API_KEY || current.GEMINI_API_KEY || "",
});
const set = (patch) => state({ ...state(), ...patch });
const toggle = (n) => state({ ...state(), addons: { ...state().addons, [n]: !state().addons[n] } });
const status = signal("");

// selected add-ons, dependencies expanded, in display order
function effective(s) {
  const want = new Set();
  const visit = (n) => {
    if (want.has(n)) return;
    want.add(n);
    (depsOf[n] || []).forEach(visit);
  };
  for (const n of order) if (s.addons[n]) visit(n);
  return order.filter((n) => want.has(n));
}

// which *enabled* add-ons pull in `name` as a (transitive) dependency
function requiredBy(s, name) {
  const causes = [];
  for (const n of order) {
    if (n === name || !s.addons[n]) continue;
    const seen = new Set();
    const visit = (x) => {
      if (seen.has(x)) return;
      seen.add(x);
      (depsOf[x] || []).forEach(visit);
    };
    (depsOf[n] || []).forEach(visit);
    if (seen.has(name)) causes.push(n);
  }
  return causes;
}

const clean = (v) => String(v).replace(/[\r\n]/g, "").trim(); // one value per line; no injection
function genEnv(s) {
  const eff = effective(s);
  const out = [`VOLT_ADDONS=${eff.join(",")}`, `PORT=${clean(s.port)}`];
  if (s.tz) out.push(`SITE_TZ=${clean(s.tz)}`); // admin's timezone, for date display
  if (s.siteName) out.push(`SITE_NAME=${clean(s.siteName)}`);
  if (s.siteUrl) out.push(`SITE_URL=${clean(s.siteUrl)}`);
  if (s.configPort) out.push(`CONFIG_PORT=${clean(s.configPort)}`);
  if ((eff.includes("pages") || eff.includes("posts")) && s.theme) out.push(`THEME=${clean(s.theme)}`);
  if (s.aiKey) {
    out.push(`AI_PROVIDER=${clean(s.aiProvider)}`);
    const keyVar = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" }[s.aiProvider] || "ANTHROPIC_API_KEY";
    out.push(`${keyVar}=${clean(s.aiKey)}`);
  }
  if (eff.includes("db")) {
    out.push(`DB_DRIVER=${clean(s.dbDriver)}`);
    if (s.dbDriver === "mongodb") {
      out.push(`MONGODB_URI=${clean(s.mongoUri)}`);
      if (s.mongoDb) out.push(`MONGODB_DATABASE=${clean(s.mongoDb)}`);
    } else if (s.dbDriver === "mysql" || s.dbDriver === "postgres") {
      out.push(`DATABASE_URL=${clean(s.dbUrl)}`);
    }
  }
  if (eff.includes("mailer")) {
    if (s.smtpUrl) out.push(`SMTP_URL=${clean(s.smtpUrl)}`);
    else out.push("# SMTP_URL=        # unset → emails print to the console");
    if (s.mailFrom) out.push(`MAIL_FROM=${clean(s.mailFrom)}`);
  }
  if (eff.includes("media")) {
    out.push(`MEDIA_DRIVER=${clean(s.mediaDriver)}`);
    if (s.mediaDriver === "s3") {
      out.push(`S3_ENDPOINT=${clean(s.s3Endpoint)}`);
      out.push(`S3_REGION=${clean(s.s3Region)}`);
      out.push(`S3_BUCKET=${clean(s.s3Bucket)}`);
      out.push(`S3_KEY=${clean(s.s3Key)}`);
      out.push(`S3_SECRET=${clean(s.s3Secret)}`);
      if (s.s3PublicBase) out.push(`S3_PUBLIC_BASE=${clean(s.s3PublicBase)}`);
    }
  }
  return out.join("\n") + "\n";
}
const env = computed(() => genEnv(state()));
const eff = computed(() => effective(state()));
// Memoized, primitive-valued derivations: a conditional section keyed on these
// only re-renders when the *discriminant* changes — not on every keystroke in a
// field it contains (which would recreate the input and drop focus).
const dbDriver = computed(() => state().dbDriver);
const mediaDriver = computed(() => state().mediaDriver);
const hasDb = computed(() => eff().includes("db"));
const hasMailer = computed(() => eff().includes("mailer"));
const hasMedia = computed(() => eff().includes("media"));
const hasContent = computed(() => eff().includes("pages") || eff().includes("posts")); // themes apply to pages/posts

// "Customize": copy the selected bundled theme to pages/_theme.js, then use it
// locally (THEME cleared) so edits take effect.
async function ejectTheme() {
  const theme = state().theme;
  if (!theme) return;
  status("Copying theme…");
  try {
    const r = await (await fetch("/setup/eject-theme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme }) })).json();
    if (r.ok) {
      set({ theme: "" });
      status(`Copied ${theme} → ${r.path}. Edit it freely; THEME was cleared so your local copy is used.`);
    } else status("Error: " + (r.error || "?"));
  } catch {
    status("Network error copying theme.");
  }
}

async function testDb() {
  const s = state();
  const e = { DB_DRIVER: s.dbDriver };
  if (s.dbDriver === "mongodb") {
    e.MONGODB_URI = s.mongoUri;
    e.MONGODB_DATABASE = s.mongoDb;
  } else if (s.dbDriver === "mysql" || s.dbDriver === "postgres") {
    e.DATABASE_URL = s.dbUrl;
  }
  status("Testing connection…");
  try {
    const r = await (await fetch("/setup/test-db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ env: e }) })).json();
    status(r.ok ? `✓ Connected (${r.driver}).` : `✗ ${r.error}`);
  } catch {
    status("Network error testing connection.");
  }
}

async function apply() {
  status("Saving…");
  let d;
  try {
    d = await (await fetch("/setup/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addons: eff(), env: env() }) })).json();
  } catch {
    return status("Network error.");
  }
  if (!d.ok) return status("Error: " + d.error);
  status(d.installing?.length ? `Installing ${d.installing.join(", ")}, then starting…` : "Starting the app…");
  const target = `http://localhost:${d.port}/`;
  const tries = d.installing?.length ? 90 : 20; // npm install can take a while
  const go = async (n) => {
    try {
      await fetch(target, { mode: "no-cors" });
      location.href = target;
    } catch {
      if (n > 0) setTimeout(() => go(n - 1), 500);
      else location.href = target;
    }
  };
  setTimeout(() => go(tries), 600);
}

// --- views ---
const field = (label, key, placeholder = "") =>
  html`<div class="mb-2">
    <label class="form-label small mb-1">${label}</label>
    <input class="form-control" placeholder=${placeholder} value=${() => state()[key]} oninput=${(e) => set({ [key]: e.target.value })} />
  </div>`;

// A dependency pulled in by another enabled add-on shows as checked + disabled
// (you can't turn it off while something needs it), with a "required by" note —
// so the .env's VOLT_ADDONS always matches what the boxes show.
const addonRow = (a) =>
  html`<div class="form-check mb-2">
    <input class="form-check-input" type="checkbox" id=${"x-" + a.name}
      checked=${() => eff().includes(a.name)}
      disabled=${() => !state().addons[a.name] && eff().includes(a.name)}
      onchange=${() => toggle(a.name)} />
    <label class="form-check-label" for=${"x-" + a.name}>
      <span class="accent">${a.name}</span>${a.dependsOn?.length ? html` <span class="text-muted small">(needs ${a.dependsOn.join(", ")})</span>` : ""}${() =>
        !state().addons[a.name] && eff().includes(a.name) ? html` <span class="text-muted small">· required by ${requiredBy(state(), a.name).join(", ")}</span>` : ""}
      <div class="small text-muted">${a.description}</div>
    </label>
  </div>`;

const dbSettings = () =>
  html`<div class="mb-2">
      <label class="form-label small mb-1">Database (DB_DRIVER)</label>
      <select class="form-select" value=${() => dbDriver()} onchange=${(e) => set({ dbDriver: e.target.value })}>
        <option value="memory">memory (no setup)</option>
        <option value="mongodb">mongodb</option>
        <option value="mysql">mysql</option>
        <option value="postgres">postgres</option>
      </select>
    </div>
    ${() =>
      dbDriver() === "mongodb"
        ? html`${field("MONGODB_URI", "mongoUri", "mongodb://user:pass@host:27017/db")}${field("MONGODB_DATABASE", "mongoDb", "db")}`
        : dbDriver() === "mysql" || dbDriver() === "postgres"
          ? field("DATABASE_URL", "dbUrl", dbDriver() + "://user:pass@host/db")
          : null}
    ${() => (dbDriver() !== "memory" ? html`<button class="btn btn-sm btn-outline-secondary mb-2" onclick=${testDb}>Test connection</button>` : null)}`;

const mediaSettings = () =>
  html`<div class="mb-2">
      <label class="form-label small mb-1">Media storage (MEDIA_DRIVER)</label>
      <select class="form-select" value=${() => mediaDriver()} onchange=${(e) => set({ mediaDriver: e.target.value })}>
        <option value="local">local (disk)</option>
        <option value="s3">s3 — AWS S3 / DigitalOcean Spaces</option>
      </select>
    </div>
    ${() =>
      mediaDriver() === "s3"
        ? html`${field("S3_ENDPOINT", "s3Endpoint", "https://nyc3.digitaloceanspaces.com")}${field("S3_REGION", "s3Region", "us-east-1")}${field("S3_BUCKET", "s3Bucket", "my-space")}${field("S3_KEY", "s3Key", "access key")}${field("S3_SECRET", "s3Secret", "secret key")}${field("S3_PUBLIC_BASE (optional CDN base)", "s3PublicBase", "https://cdn.example.com")}`
        : null}`;

// theme chooser: a bundled theme (or the built-in/local one), with Customize
const themePicker = () =>
  html`<div class="mb-2">
    <label class="form-label small mb-1">Theme (THEME)</label>
    <select class="form-select" value=${() => state().theme} onchange=${(e) => set({ theme: e.target.value })}>
      <option value="">default — built-in, or your pages/_theme.js</option>
      ${themes.map((t) => html`<option value=${t.name}>${t.name}${t.description ? " — " + t.description : ""}</option>`)}
    </select>
    ${() =>
      state().theme
        ? html`<button class="btn btn-sm btn-outline-secondary mt-1" onclick=${ejectTheme}>Customize → copy to pages/_theme.js</button>`
        : html`<div class="small text-muted mt-1">Pick a starter theme, or keep the built-in / your local <code>pages/_theme.js</code>.</div>`}
  </div>`;

// AI keys (optional) — used by the WYSIWYG editor's assistant. Kept server-side.
const AI_KEY_URL = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  gemini: "https://aistudio.google.com/app/apikey",
};
const aiSettings = () =>
  html`<details class="mb-2"><summary class="form-label small mb-0" style="cursor:pointer">AI assistant for the editor (optional)</summary>
    <div class="mt-2">
      <p class="small text-muted mb-2">Powers the WYSIWYG editor's "write with AI" button. <strong>Totally optional</strong> — leave the key blank and the editor still works, just without AI.</p>
      <label class="form-label small mb-1">Provider</label>
      <select class="form-select mb-1" value=${() => state().aiProvider} onchange=${(e) => set({ aiProvider: e.target.value })}>
        <option value="anthropic">Anthropic (Claude)</option>
        <option value="openai">OpenAI</option>
        <option value="gemini">Google Gemini</option>
      </select>
      ${() => html`<a class="small d-inline-block mb-1" href=${AI_KEY_URL[state().aiProvider] || AI_KEY_URL.anthropic} target="_blank" rel="noopener">Get a ${state().aiProvider} key → paste it below (stays server-side in .env)</a>`}
      ${field("API key", "aiKey", "sk-…")}
    </div>
  </details>`;

// --- Manage content (a second screen reached via "Manage content →") ---
const view = signal("config"); // "config" | "manage"
// upgrade check: compare bundled version to npm latest; offer a one-click upgrade
const upgrade = signal(null); // { current, latest, available }
fetch("/setup/upgrade-check").then((r) => r.json()).then((u) => upgrade(u)).catch(() => {});
async function doUpgrade() {
  status("Upgrading via npx create-volt@latest update…");
  try {
    const r = await (await fetch("/setup/upgrade", { method: "POST" })).json();
    status(r.ok ? "Upgraded — restart the wizard/app to load the new version." : "Upgrade failed (see terminal).");
    if (r.ok) upgrade({ ...upgrade(), available: false });
  } catch {
    status("Upgrade request failed.");
  }
}
const items = signal({ pages: [], posts: [] });
const editing = signal(null); // { type, slug, body, isNew } — set only on open/save/close, so typing doesn't re-render
const loadItems = async () => items(await (await fetch("/setup/content")).json());
async function editItem(type, slug) {
  const d = await (await fetch(`/setup/content/raw?type=${type}&slug=${encodeURIComponent(slug)}`)).json();
  editing({ type, slug, body: d.body || "", isNew: false });
}
function newItem(type) {
  const body = type === "post" ? "---\ntitle: New Post\ndate: 2026-01-01\ncategory: \ntags: \n---\n\nWrite your post here.\n" : "---\ntitle: New Page\n---\n\nWrite your page here.\n";
  editing({ type, slug: "", body, isNew: true });
}
async function saveItem() {
  const e = editing();
  const slug = (document.querySelector("#mg-slug").value || "").trim().toLowerCase();
  const body = document.querySelector("#mg-body").value;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return status("Slug must be lowercase letters, numbers, hyphens.");
  const r = await (await fetch("/setup/content/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: e.type, slug, body }) })).json();
  if (!r.ok) return status("Error: " + (r.error || "?"));
  status("Saved → " + r.file);
  editing(null);
  loadItems();
}
async function delItem(type, slug) {
  if (typeof confirm === "function" && !confirm(`Delete ${slug}?`)) return;
  await fetch("/setup/content/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, slug }) });
  status("Deleted " + slug);
  loadItems();
}

const itemRow = (it) =>
  html`<li class="list-group-item bg-transparent text-light d-flex justify-content-between align-items-center py-1 px-2">
    <span><a href=${"http://localhost:" + state().port + (it.type === "post" ? "/blog/" : "/") + it.slug} target="_blank" rel="noopener">${it.title}</a> <span class="text-muted small">/${it.type === "post" ? "blog/" : ""}${it.slug}</span></span>
    <span><button class="btn btn-sm btn-link p-0 me-3" onclick=${() => editItem(it.type, it.slug)}>edit</button><button class="btn btn-sm btn-link p-0 text-danger" onclick=${() => delItem(it.type, it.slug)}>delete</button></span>
  </li>`;
const section = (label, type, key) =>
  html`<div class="mb-3">
    <div class="d-flex justify-content-between align-items-center mb-1"><strong>${label}</strong><button class="btn btn-sm btn-outline-secondary" onclick=${() => newItem(type)}>+ New</button></div>
    ${() => (items()[key].length ? html`<ul class="list-group">${items()[key].map(itemRow)}</ul>` : html`<div class="small text-muted">No ${key} yet.</div>`)}
  </div>`;
const editorPanel = () => {
  const e = editing(); // inputs are uncontrolled (read on Save) so typing never re-renders
  return html`<div class="p-3 mb-2" style="border:1px solid #232a36;border-radius:10px">
    <div class="d-flex gap-2 mb-2"><input id="mg-slug" class="form-control" placeholder="slug" value=${e.slug} readonly=${!e.isNew} /><span class="align-self-center small text-muted">${e.type === "post" ? "posts/" : "pages/"}</span></div>
    <textarea id="mg-body" class="form-control" rows="16" style="font-family:ui-monospace,monospace;font-size:13px">${e.body}</textarea>
    <div class="mt-2 d-flex gap-2"><button class="btn btn-primary btn-sm" onclick=${saveItem}>Save</button><button class="btn btn-outline-secondary btn-sm" onclick=${() => editing(null)}>Cancel</button></div>
  </div>`;
};
const manageView = () =>
  html`<div class="card-x p-4 mb-3">
    <div class="d-flex justify-content-between align-items-center mb-3"><h2 class="h6 mb-0">Manage content</h2><button class="btn btn-sm btn-outline-secondary" onclick=${() => view("config")}>← Settings</button></div>
    ${() => (editing() ? editorPanel() : html`${section("Pages", "page", "pages")}${section("Posts", "post", "posts")}<p class="small text-muted mb-0">Pages → <code>/slug</code>, posts → <code>/blog/slug</code>; <code>index</code> page is your home. All rendered in your theme. Edits hot-reload the running app.</p>`)}
  </div>`;

const configView = () =>
  html`${() => (upgrade()?.available ? html`<div class="card-x p-3 mb-3 d-flex justify-content-between align-items-center"><span class="small">⬆ <strong>create-volt ${upgrade().latest}</strong> is available — you have ${upgrade().current}.</span><button class="btn btn-sm btn-primary" onclick=${doUpgrade}>Upgrade</button></div>` : "")}
    ${available.length ? html`<div class="card-x p-4 mb-3"><h2 class="h6 mb-3">Features</h2>${available.map(addonRow)}<p class="small text-muted mb-0">Enabling a feature wires its backend automatically. Frontend UI (login form, chat) is yours to build — or start from <code>--template guestbook</code>.</p></div>` : ""}
    <div class="card-x p-4 mb-3">
      <h2 class="h6 mb-3">Settings</h2>
      ${field("PORT", "port", String(defaultPort))}
      ${field("SITE_NAME", "siteName", "My Site")}
      ${() => (hasContent() ? themePicker() : null)}
      ${() => (hasDb() ? dbSettings() : null)}
      ${() => (hasMailer() ? html`${field("SMTP_URL (optional)", "smtpUrl", "smtp://user:pass@smtp.host:587")}${field("MAIL_FROM", "mailFrom", "App <no-reply@you.com>")}` : null)}
      ${() => (hasMedia() ? mediaSettings() : null)}
      ${aiSettings()}
      ${field("SITE_URL (optional — absolute links, RSS, canonical)", "siteUrl", "https://example.com")}
      ${field("CONFIG_PORT (this wizard's own port)", "configPort", String(configDefaultPort))}
    </div>
    <div class="card-x p-4 mb-3">
      <div class="d-flex justify-content-between align-items-center mb-2"><h2 class="h6 mb-0">.env</h2><div class="d-flex gap-2">${() => (hasContent() ? html`<button class="btn btn-outline-light btn-sm" onclick=${() => (view("manage"), loadItems())}>Manage content →</button>` : "")}<button class="btn btn-primary btn-sm" onclick=${apply}>Apply & start →</button></div></div>
      <pre class="mb-0" style="background:#0b0d11;border:1px solid #232a36;border-radius:10px;padding:12px;color:#cfe3ff;white-space:pre-wrap">${env}</pre>
    </div>`;

mount(
  "#app",
  () => (view() === "config" ? configView() : manageView()),
  () => (status() ? html`<p class="small accent">${status}</p>` : null),
);
