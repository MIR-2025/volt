// setup.js — first-run / --edit wizard, built with Volt. Tick add-ons + fill
// settings → writes .env (a VOLT_ADDONS list + settings), adds any needed
// packages, installs, and starts the app. Add-on code is bundled; enabling is
// just config.
import { signal, computed, html, mount } from "/volt.js";

const { available, current, defaultPort } = await (await fetch("/setup/state")).json();
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
  port: current.PORT || String(defaultPort),
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

const clean = (v) => String(v).replace(/[\r\n]/g, "").trim(); // one value per line; no injection
function genEnv(s) {
  const eff = effective(s);
  const out = [`VOLT_ADDONS=${eff.join(",")}`, `PORT=${clean(s.port)}`];
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
  return out.join("\n") + "\n";
}
const env = computed(() => genEnv(state()));
const eff = computed(() => effective(state()));

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

const addonRow = (a) =>
  html`<div class="form-check mb-2">
    <input class="form-check-input" type="checkbox" id=${"x-" + a.name} checked=${() => state().addons[a.name]} onchange=${() => toggle(a.name)} />
    <label class="form-check-label" for=${"x-" + a.name}>
      <span class="accent">${a.name}</span>${a.dependsOn?.length ? html` <span class="text-muted small">(needs ${a.dependsOn.join(", ")})</span>` : ""}
      <div class="small text-muted">${a.description}</div>
    </label>
  </div>`;

const dbSettings = () =>
  html`<div class="mb-2">
      <label class="form-label small mb-1">Database (DB_DRIVER)</label>
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
          : null}
    ${() => (state().dbDriver !== "memory" ? html`<button class="btn btn-sm btn-outline-secondary mb-2" onclick=${testDb}>Test connection</button>` : null)}`;

mount(
  "#app",
  available.length
    ? html`<div class="card-x p-4 mb-3">
        <h2 class="h6 mb-3">Features</h2>
        ${available.map(addonRow)}
        <p class="small text-muted mb-0">Enabling a feature wires its backend automatically. Frontend UI (login form, chat) is yours to build — or start from <code>--template guestbook</code>.</p>
      </div>`
    : null,
  html`<div class="card-x p-4 mb-3">
    <h2 class="h6 mb-3">Settings</h2>
    ${field("PORT", "port", String(defaultPort))}
    ${() => (eff().includes("db") ? dbSettings() : null)}
    ${() => (eff().includes("mailer") ? html`${field("SMTP_URL (optional)", "smtpUrl", "smtp://user:pass@smtp.host:587")}${field("MAIL_FROM", "mailFrom", "App <no-reply@you.com>")}` : null)}
  </div>`,
  html`<div class="card-x p-4 mb-3">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h2 class="h6 mb-0">.env</h2>
      <button class="btn btn-primary btn-sm" onclick=${apply}>Apply & start →</button>
    </div>
    <pre class="mb-0" style="background:#0b0d11;border:1px solid #232a36;border-radius:10px;padding:12px;color:#cfe3ff;white-space:pre-wrap">${env}</pre>
  </div>`,
  () => (status() ? html`<p class="small accent">${status}</p>` : null),
);
