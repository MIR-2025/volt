// config-app.js — the disposable add-on configurator, built with Volt itself.
import { signal, computed, html, mount } from "/volt.js";

const datePort = () => {
  const d = new Date();
  return `${String(d.getFullYear()).slice(-2)}${d.getMonth() + 1}${String(d.getDate()).padStart(2, "0")}`;
};

const addons = await (await fetch("/addons.json")).json();
const current = await (await fetch("/current.json")).json(); // existing .env, so Apply doesn't clobber it
const byName = (n) => addons.find((a) => a.name === n);

const state = signal({
  addons: Object.fromEntries(addons.map((a) => [a.name, a.installed])),
  dbDriver: current.DB_DRIVER || "memory",
  mongoUri: current.MONGODB_URI || "",
  mongoDb: current.MONGODB_DATABASE || "",
  dbUrl: current.DATABASE_URL || "",
  smtpUrl: current.SMTP_URL || "",
  mailFrom: current.MAIL_FROM || "",
  port: current.PORT || datePort(),
});
const set = (patch) => state({ ...state(), ...patch });
const toggle = (n) => state({ ...state(), addons: { ...state().addons, [n]: !state().addons[n] } });
const status = signal("");

// --- generators ---
function genEnv(s) {
  const out = [];
  if (s.port) out.push(`PORT=${s.port}`);
  if (s.addons.db) {
    out.push(`DB_DRIVER=${s.dbDriver}`);
    if (s.dbDriver === "mongodb") {
      out.push(`MONGODB_URI=${s.mongoUri}`);
      if (s.mongoDb) out.push(`MONGODB_DATABASE=${s.mongoDb}`);
    } else if (s.dbDriver === "mysql" || s.dbDriver === "postgres") {
      out.push(`DATABASE_URL=${s.dbUrl}`);
    }
  }
  if (s.addons.mailer) {
    if (s.smtpUrl) out.push(`SMTP_URL=${s.smtpUrl}`);
    else out.push(`# SMTP_URL=        # unset → emails print to the console`);
    if (s.mailFrom) out.push(`MAIL_FROM=${s.mailFrom}`);
  }
  return out.join("\n") + "\n";
}
function genInstall(s) {
  const deps = new Set();
  for (const a of addons) if (s.addons[a.name]) (a.install || []).forEach((d) => deps.add(d));
  if (s.addons.db) {
    if (s.dbDriver === "mongodb") deps.add("mongodb");
    if (s.dbDriver === "mysql") deps.add("mysql2");
    if (s.dbDriver === "postgres") deps.add("pg");
  }
  if (s.addons.mailer && s.smtpUrl) deps.add("nodemailer");
  return deps.size ? `npm install ${[...deps].join(" ")}` : "# no extra packages needed";
}
function genWiring(s) {
  const parts = [];
  for (const name of ["db", "mailer", "auth", "realtime"]) {
    if (s.addons[name]) parts.push(`// ── ${name} ──\n${byName(name).wiring}`);
  }
  return parts.join("\n\n") || "// select add-ons above";
}
function warnings(s) {
  const w = [];
  if (s.addons.auth && (!s.addons.db || !s.addons.mailer)) w.push("auth needs db + mailer");
  if (s.addons.realtime && !s.addons.db) w.push("realtime needs db (for message persistence)");
  return w;
}

const env = computed(() => genEnv(state()));

const KEY = new URLSearchParams(location.search).get("key") || "";
const copy = (text) => navigator.clipboard.writeText(text).then(() => (status("Copied."), setTimeout(() => status(""), 1500)));
const setAll = (v) => state({ ...state(), addons: Object.fromEntries(addons.map((a) => [a.name, v])) });
async function apply() {
  const selected = Object.keys(state().addons).filter((n) => state().addons[n]);
  status("Applying…");
  const r = await fetch("/apply", { method: "POST", headers: { "Content-Type": "application/json", "x-config-key": KEY }, body: JSON.stringify({ addons: selected, env: env() }) });
  const d = await r.json();
  status(d.ok ? `Applied ${selected.join(", ") || "(none)"} — copied ${d.copied.length} file(s) + wrote .env. Next: ${genInstall(state())} · npm run dev` : `Error: ${d.error}`);
  setTimeout(() => status(""), 9000);
}

// --- views ---
const addonToggles = () =>
  html`<div class="card-x p-4 mb-3">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h2 class="h6 mb-0">Add-ons</h2>
      <div>
        <button class="btn btn-sm btn-outline-secondary" onclick=${() => setAll(true)}>All</button>
        <button class="btn btn-sm btn-outline-secondary ms-1" onclick=${() => setAll(false)}>None</button>
      </div>
    </div>
    ${addons.map(
      (a) => html`<div class="form-check mb-2">
        <input class="form-check-input" type="checkbox" id=${"x-" + a.name}
               checked=${() => state().addons[a.name]} onchange=${() => toggle(a.name)} />
        <label class="form-check-label" for=${"x-" + a.name}>
          <span class="accent">${a.name}</span>${a.installed ? " · installed" : ""}
          <div class="small text-muted">${a.description}</div>
        </label>
      </div>`,
    )}
  </div>`;

const field = (label, key, placeholder = "") =>
  html`<div class="mb-2">
    <label class="form-label small mb-1">${label}</label>
    <input class="form-control" placeholder=${placeholder}
           value=${() => state()[key]} oninput=${(e) => set({ [key]: e.target.value })} />
  </div>`;

const settings = () =>
  html`<div class="card-x p-4 mb-3">
    <h2 class="h6 mb-3">Settings</h2>
    ${field("PORT", "port", "26628")}
    ${() =>
      state().addons.db
        ? html`<div class="mb-2">
              <label class="form-label small mb-1">DB_DRIVER</label>
              <select class="form-select" value=${() => state().dbDriver} onchange=${(e) => set({ dbDriver: e.target.value })}>
                <option value="memory">memory (no setup)</option>
                <option value="mongodb">mongodb</option>
                <option value="mysql">mysql</option>
                <option value="postgres">postgres</option>
              </select>
            </div>
            ${() =>
              state().dbDriver === "mongodb"
                ? html`${field("MONGODB_URI", "mongoUri", "mongodb://user:pass@host:27017/db")}${field("MONGODB_DATABASE", "mongoDb", "db")}`
                : state().dbDriver === "mysql" || state().dbDriver === "postgres"
                  ? field("DATABASE_URL", "dbUrl", state().dbDriver + "://user:pass@host/db")
                  : null}`
        : null}
    ${() => (state().addons.mailer ? html`${field("SMTP_URL (optional)", "smtpUrl", "smtp://user:pass@smtp.host:587")}${field("MAIL_FROM", "mailFrom", "App <no-reply@you.com>")}` : null)}
  </div>`;

const warnRow = () =>
  html`${() => {
    const w = warnings(state());
    return w.length ? html`<div class="alert alert-warning py-2 small">⚠ ${w.join(" · ")}</div>` : null;
  }}`;

const output = (title, getText, withWrite = false) =>
  html`<div class="card-x p-4 mb-3">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h2 class="h6 mb-0">${title}</h2>
      <div>
        <button class="btn btn-sm btn-outline-secondary" onclick=${() => copy(getText())}>Copy</button>
        ${withWrite ? html`<button class="btn btn-sm btn-primary ms-2" onclick=${apply}>Apply</button>` : null}
      </div>
    </div>
    <pre class="mb-0">${getText}</pre>
  </div>`;

mount(
  "#app",
  addonToggles(),
  settings(),
  warnRow(),
  output(".env", env, true),
  html`<p class="small text-muted mb-3">The app auto-loads <code>.env</code> on start — just run <code>npm run dev</code> (no flags; same on Windows).</p>`,
  output("Install", computed(() => genInstall(state()))),
  output("server.js wiring", computed(() => genWiring(state()))),
  () => (status() ? html`<p class="small accent">${status}</p>` : null),
);
