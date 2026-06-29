// app.js — the guestbook frontend, built with Volt signals. Renders the live
// message list, the sign-in (magic-link) form, and the post box, all driven by
// a handful of signals. New messages arrive over Socket.io and update in place.

import { signal, computed, html, mount } from "/volt.js";

// --- state ---
const me = signal(null); // signed-in email, or null
const messages = signal([]); // [{ id, email, body, createdAt }]
const draft = signal(""); // post box
const emailDraft = signal(""); // sign-in box
const notice = signal(""); // status line

const api = async (url, body) => {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};

const fmtWho = (email) => email.replace(/@.*/, ""); // show the local part only
const fmtTime = (ts) => new Date(ts).toLocaleString();

// --- actions ---
async function sendLink() {
  const email = emailDraft().trim();
  if (!email) return;
  notice("Sending…");
  const r = await api("/api/login", { email });
  notice(r.ok ? (r.dev ? "Magic link printed to the server console — open it to sign in." : `Magic link sent to ${email}.`) : r.error);
}
async function post() {
  const body = draft().trim();
  if (!body) return;
  const r = await api("/api/messages", { body });
  if (r.ok) draft("");
  else notice(r.error);
}
async function logout() {
  await api("/api/logout", {});
  me(null);
}

// --- views ---
const signIn = () =>
  html`
    <div class="card-x p-4 mb-4">
      <h2 class="h6 mb-3">Sign in to post</h2>
      <div class="input-group">
        <input class="form-control" type="email" placeholder="you@example.com"
               value=${emailDraft}
               oninput=${(e) => emailDraft(e.target.value)}
               onkeydown=${(e) => e.key === "Enter" && sendLink()} />
        <button class="btn btn-primary" onclick=${sendLink}>Send magic link</button>
      </div>
    </div>`;

const composer = () =>
  html`
    <div class="card-x p-4 mb-4">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="small text-muted">Signed in as <span class="who">${() => fmtWho(me())}</span></span>
        <button class="btn btn-sm btn-outline-secondary" onclick=${logout}>Sign out</button>
      </div>
      <div class="input-group">
        <input class="form-control" placeholder="Leave a message…"
               value=${draft}
               oninput=${(e) => draft(e.target.value)}
               onkeydown=${(e) => e.key === "Enter" && post()} />
        <button class="btn btn-primary" onclick=${post}>Post</button>
      </div>
    </div>`;

const messageRow = (m) =>
  html`
    <div class="msg py-2">
      <div class="d-flex justify-content-between">
        <span class="who">${fmtWho(m.email)}</span>
        <small class="text-muted">${fmtTime(m.createdAt)}</small>
      </div>
      <div>${m.body}</div>
    </div>`;

const board = () =>
  html`
    <div class="card-x p-4">
      <h2 class="h6 mb-3">${computed(() => `${messages().length} message${messages().length === 1 ? "" : "s"}`)}</h2>
      ${() => (messages().length ? messages().map(messageRow) : html`<p class="text-muted mb-0">No messages yet — be the first.</p>`)}
    </div>`;

mount(
  "#app",
  // sign-in box OR composer, depending on auth state
  () => (me() ? composer() : signIn()),
  () => (notice() ? html`<p class="small text-muted">${notice}</p>` : null),
  board(),
);

// --- load + live updates ---
async function boot() {
  const [{ email }, { messages: list }] = await Promise.all([api("/api/me"), api("/api/messages")]);
  me(email);
  messages(list || []);

  if (window.io) {
    const socket = window.io();
    socket.on("message:new", (m) => messages([...messages(), m]));
  }
}
boot();
