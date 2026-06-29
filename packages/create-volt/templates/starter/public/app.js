// app.js — the starter app shell: a top nav over sections (Home, Notes, Chat,
// Account). Built on Volt signals. Auth + realtime + db are wired server-side;
// this is the UI. All dynamic text renders through Volt holes (text nodes,
// HTML-escaped), so user content can't inject markup.
import { signal, computed, el, html, mount } from "/volt.js";

let enabled = [];
try {
  enabled = await (await fetch("/__volt/addons")).json();
} catch {
  /* ignore */
}
const hasAuth = enabled.includes("auth");
const hasChat = enabled.includes("realtime");

const api = async (url, body, method) => {
  const res = await fetch(url, {
    method: method || (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({}));
};
const shortName = (e) => String(e || "").split("@")[0];

const me = signal(null);
const section = signal("home");
api("/api/me").then((r) => me(r.email || null));

// --- Account ---
function accountSection() {
  const email = signal("");
  const notice = signal("");
  async function sendLink(e) {
    e?.preventDefault?.();
    const addr = email().trim();
    if (!addr) return;
    notice("Sending…");
    const r = await api("/api/login", { email: addr });
    notice(r.ok ? (r.dev ? "Magic link printed to the server console — open it to sign in." : `Link sent to ${addr}.`) : r.error || "Failed.");
  }
  async function logout() {
    await api("/api/logout", {});
    me(null);
  }
  return html`<div class="card-x p-4">
    <h2 class="h6 mb-3">Account</h2>
    ${() =>
      me()
        ? html`<div class="d-flex justify-content-between align-items-center">
            <span class="text-muted small">Signed in as <span class="accent fw-semibold">${() => me()}</span></span>
            <button class="btn btn-sm btn-outline-secondary" onclick=${logout}>Sign out</button>
          </div>`
        : html`<form class="d-flex gap-2" onsubmit=${sendLink}>
            <input class="form-control" type="email" name="email" placeholder="you@example.com" maxlength="320" autocomplete="email" required value=${email} oninput=${(e) => email(e.target.value)} />
            <button class="btn btn-primary" type="submit">Send magic link</button>
          </form>`}
    ${() => (notice() ? html`<p class="small text-muted mb-0 mt-2">${notice}</p>` : null)}
  </div>`;
}

// --- Notes (per-user CRUD, auth-gated) ---
function notesSection() {
  const notes = signal([]);
  const draft = signal("");
  const err = signal("");
  async function load() {
    if (!me()) return;
    const r = await api("/api/notes");
    notes(r.notes || []);
  }
  async function add() {
    const text = draft().trim();
    if (!text) return;
    const r = await api("/api/notes", { text });
    if (r.ok) {
      draft("");
      load();
    } else err(r.error || "Failed.");
  }
  async function del(id) {
    await api("/api/notes/" + encodeURIComponent(id), null, "DELETE");
    load();
  }
  // reload whenever auth state flips to signed-in
  let loadedFor = null;
  const sync = computed(() => {
    if (me() && loadedFor !== me()) {
      loadedFor = me();
      load();
    }
    return me();
  });

  return html`<div class="card-x p-4">
    <h2 class="h6 mb-3">Notes</h2>
    ${() =>
      !sync()
        ? html`<p class="text-muted small mb-0">Sign in (Account) to keep notes.</p>`
        : html`<div class="input-group mb-3">
              <input class="form-control" maxlength="2000" placeholder="Write a note…" value=${draft} oninput=${(e) => draft(e.target.value)} onkeydown=${(e) => e.key === "Enter" && add()} />
              <button class="btn btn-primary" onclick=${add}>Add</button>
            </div>
            ${() =>
              notes().length
                ? notes().map(
                    (n) => html`<div class="d-flex justify-content-between align-items-start gap-2 py-2" style="border-top:1px solid #232a36">
                      <span>${n.text}</span>
                      <button class="btn btn-sm btn-outline-danger" onclick=${() => del(n.id)}>✕</button>
                    </div>`,
                  )
                : html`<span class="text-muted small">No notes yet.</span>`}
            ${() => (err() ? html`<p class="small text-danger mb-0 mt-2">${err}</p>` : null)}`}
  </div>`;
}

// --- Home ---
function homeSection() {
  return html`<div class="card-x p-4">
    <h2 class="h5 mb-2">Welcome ${() => (me() ? html`back, <span class="accent">${() => shortName(me())}</span>` : "to your Volt app")}</h2>
    <p class="text-muted mb-3">A no-build, signals-based app — auth, realtime, and a database, all wired and configured by file. Edit <code>public/app.js</code> and save; it hot-reloads.</p>
    <div class="d-flex flex-wrap gap-2">
      <button class="btn btn-sm btn-outline-secondary" onclick=${() => section("notes")}>📝 Notes</button>
      ${hasChat ? html`<button class="btn btn-sm btn-outline-secondary" onclick=${() => section("chat")}>💬 Chat</button>` : ""}
      <button class="btn btn-sm btn-outline-secondary" onclick=${() => section("account")}>${() => (me() ? "👤 Account" : "🔑 Sign in")}</button>
    </div>
  </div>`;
}

// --- build sections once; toggle visibility (keeps state + one chat socket) ---
const sections = { home: homeSection(), account: accountSection() };
if (hasAuth) sections.notes = notesSection();
if (hasChat) {
  try {
    sections.chat = (await import("/chat-ui.js")).chatPanel();
  } catch {
    /* chat UI unavailable */
  }
}
const TABS = [
  ["home", "Home"],
  ...(hasAuth ? [["notes", "Notes"]] : []),
  ...(sections.chat ? [["chat", "Chat"]] : []),
  ["account", "Account"],
];

const nav = () =>
  html`<nav class="navx py-2 mb-4">
    <div class="container d-flex align-items-center" style="max-width:760px">
      <span class="brand me-3"><span class="accent"><img src="/logo.webp" alt="" style="height:1em;vertical-align:-.15em" /> Volt</span></span>
      ${TABS.map(([key, label]) => html`<button class=${() => "btn btn-link btn-sm " + (section() === key ? "active" : "")} onclick=${() => section(key)}>${label}</button>`)}
      <span class="ms-auto small text-muted">${() => (me() ? shortName(me()) : "guest")}</span>
    </div>
  </nav>`;

const panel = (key) => el("div", { class: "container", style: () => "max-width:760px;display:" + (section() === key ? "block" : "none") }, sections[key]);

mount("#app", nav(), ...Object.keys(sections).map(panel));
