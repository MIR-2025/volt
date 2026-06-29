// setup.js — the first-run / --edit settings wizard, built with Volt. Asks only
// for the settings the present add-ons need, writes .env, then the app starts.
import { signal, computed, html, mount } from "/volt.js";

const { present, current, defaultPort } = await (await fetch("/setup/state")).json();

const state = signal({
  port: current.PORT || String(defaultPort),
  dbDriver: current.DB_DRIVER || "memory",
  mongoUri: current.MONGODB_URI || "",
  mongoDb: current.MONGODB_DATABASE || "",
  dbUrl: current.DATABASE_URL || "",
  smtpUrl: current.SMTP_URL || "",
  mailFrom: current.MAIL_FROM || "",
});
const set = (patch) => state({ ...state(), ...patch });
const status = signal("");

function genEnv(s) {
  const out = [`PORT=${s.port}`];
  if (present.db) {
    out.push(`DB_DRIVER=${s.dbDriver}`);
    if (s.dbDriver === "mongodb") {
      out.push(`MONGODB_URI=${s.mongoUri}`);
      if (s.mongoDb) out.push(`MONGODB_DATABASE=${s.mongoDb}`);
    } else if (s.dbDriver === "mysql" || s.dbDriver === "postgres") {
      out.push(`DATABASE_URL=${s.dbUrl}`);
    }
  }
  if (present.mailer) {
    if (s.smtpUrl) out.push(`SMTP_URL=${s.smtpUrl}`);
    else out.push("# SMTP_URL=        # unset → emails print to the console");
    if (s.mailFrom) out.push(`MAIL_FROM=${s.mailFrom}`);
  }
  return out.join("\n") + "\n";
}
const env = computed(() => genEnv(state()));

async function apply() {
  status("Saving & starting…");
  try {
    const r = await fetch("/setup/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ env: env() }) });
    const d = await r.json();
    if (!d.ok) return status("Error: " + d.error);
    status("Starting the app…");
    const target = `http://localhost:${d.port}/`;
    const go = async (n) => {
      try {
        await fetch(target, { mode: "no-cors" }); // app is listening
        location.href = target;
      } catch {
        if (n > 0) setTimeout(() => go(n - 1), 400);
        else location.href = target;
      }
    };
    setTimeout(() => go(20), 500);
  } catch {
    status("Network error — try again.");
  }
}

async function testDb() {
  const s = state();
  const env = { DB_DRIVER: s.dbDriver };
  if (s.dbDriver === "mongodb") {
    env.MONGODB_URI = s.mongoUri;
    env.MONGODB_DATABASE = s.mongoDb;
  } else if (s.dbDriver === "mysql" || s.dbDriver === "postgres") {
    env.DATABASE_URL = s.dbUrl;
  }
  status("Testing connection…");
  try {
    const r = await fetch("/setup/test-db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ env }) });
    const d = await r.json();
    status(d.ok ? `✓ Connected (${d.driver}).` : `✗ ${d.error}`);
  } catch {
    status("Network error testing connection.");
  }
}

const field = (label, key, placeholder = "") =>
  html`<div class="mb-2">
    <label class="form-label small mb-1">${label}</label>
    <input class="form-control" placeholder=${placeholder} value=${() => state()[key]} oninput=${(e) => set({ [key]: e.target.value })} />
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
  html`<div class="card-x p-4 mb-3">
    <h2 class="h6 mb-3">Settings</h2>
    ${field("PORT", "port", String(defaultPort))}
    ${() => (present.db ? dbSettings() : null)}
    ${() => (present.mailer ? html`${field("SMTP_URL (optional)", "smtpUrl", "smtp://user:pass@smtp.host:587")}${field("MAIL_FROM", "mailFrom", "App <no-reply@you.com>")}` : null)}
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
