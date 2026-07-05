// setup.js — first-run / --edit wizard, built with Volt. Tick add-ons + fill
// settings → writes .env (a VOLT_ADDONS list + settings), adds any needed
// packages, installs, and starts the app. Add-on code is bundled; enabling is
// just config.
import { signal, computed, effect, html, mount } from "/volt.js";

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
  aiToken: current.VOLT_AI_TOKEN || "",
});
const set = (patch) => state({ ...state(), ...patch });
const toggle = (n) => state({ ...state(), addons: { ...state().addons, [n]: !state().addons[n] } });
const status = signal("");
// per-test inline results (shown right next to each Test button)
const dbTest = signal("");
const smtpTest = signal("");
const aiTest = signal("");
const genMsg = signal("");
const testResult = (m) => (m ? html`<span class="small ms-2 ${m.startsWith("✓") ? "text-success" : m.startsWith("✗") ? "text-danger" : "text-muted"}">${m}</span>` : "");
const envObj = () => Object.fromEntries(env().split("\n").filter((l) => /^[A-Za-z0-9_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));

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
  if (s.aiToken) out.push(`VOLT_AI_TOKEN=${clean(s.aiToken)}`); // hosted-tier token (used when no local key)
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
  dbTest("Testing…");
  try {
    const r = await (await fetch("/setup/test-db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ env: e }) })).json();
    dbTest(r.ok ? `✓ Connected (${r.driver})` : `✗ ${r.error}`);
  } catch {
    dbTest("✗ network error");
  }
}
async function testSmtp() {
  smtpTest("Testing…");
  try {
    const r = await (await fetch("/setup/test-smtp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ env: envObj() }) })).json();
    smtpTest(r.ok ? `✓ ${r.detail || "OK"}` : `✗ ${r.error}`);
  } catch {
    smtpTest("✗ network error");
  }
}
async function testAi() {
  aiTest("Testing…");
  try {
    const r = await (await fetch("/setup/test-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ env: envObj() }) })).json();
    aiTest(r.ok ? `✓ ${r.detail || "OK"}` : `✗ ${r.error}`);
  } catch {
    aiTest("✗ network error");
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
    ${() => (dbDriver() !== "memory" ? html`<button class="btn btn-sm btn-outline-secondary mb-2" onclick=${testDb}>Test connection</button>${() => testResult(dbTest())}` : null)}`;

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
      <div class="small text-muted mt-2 mb-1">— or — no key? Use the hosted tier (free, capped, then pay-as-you-go):</div>
      ${() => (state().aiToken ? html`<div class="small">Hosted token: <code>${state().aiToken.slice(0, 14)}…</code> <button class="btn btn-sm btn-link p-0 ms-1" onclick=${() => set({ aiToken: "" })}>clear</button></div>` : html`<button class="btn btn-sm btn-outline-secondary" onclick=${genToken}>Generate a free hosted token</button>${() => testResult(genMsg())}`)}
      <div class="mt-2"><button class="btn btn-sm btn-outline-secondary" onclick=${testAi}>Test AI</button>${() => testResult(aiTest())}</div>
    </div>
  </details>`;

// --- Manage content (a second screen reached via "Manage content →") ---
const view = signal("config"); // "config" | "manage" | "media"
// Desktop-only config: keep settings readable, but let the editor + library go wide.
effect(() => {
  const w = document.getElementById("wrap");
  if (w) w.style.maxWidth = view() !== "config" ? "min(1200px, 95vw)" : "720px";
});
// --- media library: upload / browse / delete files served at /media/<name> ---
const media = signal([]);
const loadMedia = async () => media(((await (await fetch("/setup/media")).json()).items) || []);
async function uploadMedia(file) {
  status(`Uploading ${file.name}…`);
  try {
    const r = await (await fetch("/setup/media/upload?name=" + encodeURIComponent(file.name), { method: "POST", body: file })).json();
    status(r.ok ? `Uploaded → ${r.url}` : `Upload failed: ${r.error || "?"}`);
  } catch {
    status("Upload failed.");
  }
  loadMedia();
}
async function delMedia(name) {
  if (typeof confirm === "function" && !confirm(`Delete ${name}?`)) return;
  await fetch("/setup/media/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  loadMedia();
}
const isImg = (n) => /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(n);
const isVid = (n) => /\.(mp4|webm|mov|ogg|ogv|m4v)$/i.test(n);
const kb = (n) => (n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB");
const mediaThumb = (m) =>
  isImg(m.name)
    ? html`<img src=${m.url} loading="lazy" class="object-fit-cover" alt=${m.name} />`
    : isVid(m.name)
      ? html`<video src=${m.url} muted class="object-fit-cover"></video>`
      : html`<div class="d-flex align-items-center justify-content-center text-white-50 small text-uppercase">${m.name.split(".").pop()}</div>`;
const mediaTile = (m) =>
  html`<div class="col"><div class="card h-100 shadow-sm">
    <div class="ratio ratio-4x3 bg-dark rounded-top overflow-hidden">${mediaThumb(m)}</div>
    <div class="card-body p-2">
      <div class="small text-truncate" title=${m.name}>${m.name}</div>
      <div class="small text-muted mb-2">${kb(m.size)}</div>
      <div class="btn-group btn-group-sm w-100" role="group">
        <button type="button" class="btn btn-outline-secondary" onclick=${() => (navigator.clipboard && navigator.clipboard.writeText(m.url), status(`Copied ${m.url}`))}>Copy URL</button>
        <button type="button" class="btn btn-outline-danger flex-grow-0" title="Delete" onclick=${() => delMedia(m.name)}>✕</button>
      </div>
    </div>
  </div></div>`;
const mediaView = () =>
  html`<div class="card">
    <div class="card-header d-flex justify-content-between align-items-center"><h2 class="h6 mb-0">Media library</h2><button class="btn btn-sm btn-outline-secondary" onclick=${() => view("config")}>← Settings</button></div>
    <div class="card-body">
      <input type="file" class="form-control mb-2" accept="image/*,video/*" multiple onchange=${(e) => { for (const f of e.target.files) uploadMedia(f); e.target.value = ""; }} />
      <p class="small text-muted">Uploads are stored in <code>public/media/</code> and served at <code>/media/&lt;name&gt;</code>. Copy a URL and paste it into a page's image slot in the editor. (Max 100&nbsp;MB per file.)</p>
      ${() => (media().length ? html`<div class="row row-cols-2 row-cols-sm-3 row-cols-md-4 g-3">${media().map(mediaTile)}</div>` : html`<div class="text-muted small border rounded p-4 text-center">No media yet — upload above.</div>`)}
    </div>
  </div>`;
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

// AI credits — config-only purchase flow (gateway mode). Hidden unless a
// VOLT_AI_TOKEN is set and the gateway answers.
const aiCredits = signal(null); // { ok, tier, creditBalanceUsd, payments } | { ok:false }
fetch("/setup/ai-credits").then((r) => r.json()).then((c) => aiCredits(c)).catch(() => {});
async function buyCredits(amountUsd) {
  status("Starting checkout…");
  try {
    const r = await (await fetch("/setup/ai-credits/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountUsd }) })).json();
    if (r.ok && r.url) window.open(r.url, "_blank");
    else status("Checkout failed: " + (r.error || "?"));
  } catch {
    status("Checkout request failed.");
  }
}
async function genToken() {
  genMsg("Requesting…");
  try {
    const r = await (await fetch("/setup/gen-token", { method: "POST" })).json();
    if (r.ok && r.token) {
      set({ aiToken: r.token });
      genMsg("✓ token generated — Apply to save");
    } else genMsg("✗ " + (r.error || "no token"));
  } catch {
    genMsg("✗ request failed");
  }
}
const items = signal({ pages: [], posts: [] });
const editing = signal(null); // { type, slug, title, isNew } — set only on open/save/close
let ed = null; // live RTEPro instance for the open editor
let themeCss = ""; // active theme's CSS, so the editor renders pages themed
fetch("/setup/theme-css").then((r) => r.text()).then((c) => { themeCss = c; }).catch(() => {});
const loadItems = async () => items(await (await fetch("/setup/content")).json());
// raw .md → { title, body, isHtml }; RTEPro takes markdown directly (setMarkdown),
// so no markdown library is needed.
function parseDoc(raw) {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const front = fm ? fm[1] : "";
  const title = ((front.match(/^title:\s*(.+)$/m) || [])[1] || "").trim();
  return { title, body: fm ? raw.slice(fm[0].length) : raw, isHtml: /^format:\s*html\s*$/m.test(front) };
}
function mountEditor(doc) {
  ed = window.RTEPro.init("#mg-editor", { height: "60vh", placeholder: "Write…", aiProxy: "/setup/ai", aiProvider: state().aiProvider || "anthropic", exportCSS: themeCss });
  if (doc && doc.isHtml) ed.setHTML(doc.body || "");
  else ed.setMarkdown((doc && doc.body) || "");
}
async function editItem(type, slug) {
  const d = await (await fetch(`/setup/content/raw?type=${type}&slug=${encodeURIComponent(slug)}`)).json();
  const doc = parseDoc(d.body || "");
  editing({ type, slug, title: doc.title, isNew: false });
  queueMicrotask(() => mountEditor(doc));
}
function newItem(type) {
  editing({ type, slug: "", title: "", isNew: true });
  queueMicrotask(() => mountEditor({ body: "", isHtml: false }));
}
// markdown can't round-trip complex layouts (columns, inline styles, merged cells,
// embeds) — save those as HTML so they aren't flattened.
function isComplex(h) {
  return /\bstyle\s*=\s*["'][^"']*(text-align|column|float|grid|flex|width|height|color|background|font|margin|padding)/i.test(h) || /\b(colspan|rowspan)\b/i.test(h) || /<(u|font|mark|sub|sup|iframe|video|audio|figure)\b/i.test(h) || /class\s*=\s*["'][^"']*(col|grid|row|flex|layout)/i.test(h);
}
async function saveItem() {
  const e = editing();
  const slug = (document.querySelector("#mg-slug").value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return status("Slug must be lowercase letters, numbers, hyphens.");
  const title = (document.querySelector("#mg-title").value || "").trim() || slug;
  const htmlOut = ed ? ed.getHTML() : "";
  const complex = isComplex(htmlOut);
  const front = [`title: ${title}`];
  if (complex) front.push("format: html");
  const docBody = complex ? htmlOut : ed ? ed.getMarkdown() : "";
  const body = `---\n${front.join("\n")}\n---\n\n${docBody}\n`;
  const r = await (await fetch("/setup/content/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: e.type, slug, body }) })).json();
  if (!r.ok) return status("Error: " + (r.error || "?"));
  status("Saved → " + r.file + (complex ? " (HTML — complex layout)" : ""));
  ed = null;
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
  const e = editing(); // inputs uncontrolled (read on Save); RTEPro mounts into #mg-editor
  return html`<div class="p-3 mb-2" style="border:1px solid var(--border,#232a36);border-radius:10px">
    <div class="d-flex gap-2 mb-2"><input id="mg-slug" class="form-control" placeholder="slug" value=${e.slug} readonly=${!e.isNew} style="max-width:200px" /><input id="mg-title" class="form-control" placeholder="Title" value=${e.title || ""} /><span class="align-self-center small text-muted">${e.type === "post" ? "posts/" : "pages/"}</span></div>
    <div id="mg-editor"></div>
    <div class="mt-2 d-flex gap-2"><button class="btn btn-primary btn-sm" onclick=${saveItem}>Save</button><button class="btn btn-outline-secondary btn-sm" onclick=${() => editing(null)}>Cancel</button></div>
  </div>`;
};
const manageView = () =>
  html`<div class="card-x p-4 mb-3">
    <div class="d-flex justify-content-between align-items-center mb-3"><h2 class="h6 mb-0">Manage content</h2><button class="btn btn-sm btn-outline-secondary" onclick=${() => view("config")}>← Settings</button></div>
    ${() => (editing() ? editorPanel() : html`${section("Pages", "page", "pages")}${section("Posts", "post", "posts")}<p class="small text-muted mb-0">Pages → <code>/slug</code>, posts → <code>/blog/slug</code>; <code>index</code> page is your home. All rendered in your theme. Edits hot-reload the running app.</p>`)}
  </div>`;

const configView = () =>
  html`${() => {
      const u = upgrade();
      if (!u || !u.current || u.current === "?") return "";
      return html`<div class="card-x p-3 mb-3 d-flex justify-content-between align-items-center"><span class="small">create-volt <strong>${u.current}</strong> ${u.available ? html`<span class="accent">(${u.latest} available)</span>` : u.latest && u.latest !== "?" ? html`<span class="text-muted">(up to date)</span>` : ""}</span>${u.available ? html`<button class="btn btn-sm btn-primary" onclick=${doUpgrade}>Upgrade</button>` : ""}</div>`;
    }}
    ${() => (aiCredits()?.ok ? html`<div class="card-x p-3 mb-3"><div class="d-flex justify-content-between align-items-center mb-2"><strong>AI credits</strong><span class="small text-muted">${aiCredits().tier}${typeof aiCredits().creditBalanceUsd === "number" ? ` · $${aiCredits().creditBalanceUsd.toFixed(2)} left` : ""}</span></div>${aiCredits().payments ? html`<div class="d-flex gap-2 align-items-center"><span class="small text-muted me-1">Top up:</span>${[10, 25, 50].map((a) => html`<button class="btn btn-sm btn-outline-primary" onclick=${() => buyCredits(a)}>$${a}</button>`)}</div>` : html`<div class="small text-muted">Pay-as-you-go isn't enabled on the gateway yet — using the free tier.</div>`}</div>` : "")}
    ${available.length ? html`<div class="card-x p-4 mb-3"><h2 class="h6 mb-3">Features</h2>${available.map(addonRow)}<p class="small text-muted mb-0">Enabling a feature wires its backend automatically. Frontend UI (login form, chat) is yours to build — or start from <code>--template guestbook</code>.</p></div>` : ""}
    <div class="card-x p-4 mb-3">
      <h2 class="h6 mb-3">Settings</h2>
      ${field("PORT", "port", String(defaultPort))}
      ${field("SITE_NAME", "siteName", "My Site")}
      ${() => (hasContent() ? themePicker() : null)}
      ${() => (hasDb() ? dbSettings() : null)}
      ${() => (hasMailer() ? html`${field("SMTP_URL (optional)", "smtpUrl", "smtp://user:pass@smtp.host:587")}${field("MAIL_FROM", "mailFrom", "App <no-reply@you.com>")}<div class="mb-2"><button class="btn btn-sm btn-outline-secondary" onclick=${testSmtp}>Test SMTP</button>${() => testResult(smtpTest())}</div>` : null)}
      ${() => (hasMedia() ? mediaSettings() : null)}
      ${aiSettings()}
      ${field("SITE_URL (optional — absolute links, RSS, canonical)", "siteUrl", "https://example.com")}
      ${field("CONFIG_PORT (this wizard's own port)", "configPort", String(configDefaultPort))}
    </div>
    <div class="card-x p-4 mb-3">
      <div class="d-flex justify-content-between align-items-center mb-2"><h2 class="h6 mb-0">.env</h2><div class="d-flex gap-2">${() => (hasContent() ? html`<button class="btn btn-outline-light btn-sm" onclick=${() => (view("manage"), loadItems())}>Manage content →</button>` : "")}<button class="btn btn-outline-light btn-sm" onclick=${() => (view("media"), loadMedia())}>Media →</button><button class="btn btn-primary btn-sm" onclick=${apply}>Apply & start →</button></div></div>
      <pre class="mb-0" style="background:#0b0d11;border:1px solid #232a36;border-radius:10px;padding:12px;color:#cfe3ff;white-space:pre-wrap">${env}</pre>
    </div>`;

mount(
  "#app",
  () => (view() === "config" ? configView() : view() === "media" ? mediaView() : manageView()),
  () => (status() ? html`<p class="small accent">${status}</p>` : null),
);
