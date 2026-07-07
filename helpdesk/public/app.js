// app.js — the help desk UI, built with Volt signals. Three screens routed by the URL hash:
//   #/            submit a ticket + link to track it
//   #/t/<id>      a customer's ticket thread (the id is the access token)
//   #/staff       the staff inbox (key-gated): list → detail → reply / set status
//
// Volt idiom note: signals are read ONLY inside ${() => …} closures, never at the top of a
// view function — so a view is built once and the fine-grained bindings update in place
// (typing never recreates the input, so focus is kept).
import { signal, html, mount } from "/volt.js";

const api = async (method, url, body, headers = {}) => {
  const res = await fetch(url, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

// ---- state ----
const view = signal("home");                 // home | ticket | staff
const msg = signal("");                       // status line (✓ / ✗)
const busy = signal(false);
const form = signal({ name: "", email: "", subject: "", body: "" });
const setForm = (p) => form({ ...form(), ...p });
const ticket = signal(null);                  // the open ticket (customer thread OR staff detail)
const reply = signal("");
const staffKey = signal(sessionStorage.getItem("hd_key") || "");
const staffOk = signal(false);
const staffList = signal([]);
const staffCounts = signal({});
const staffFilter = signal("");
const staffReply = signal("");

const fmt = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };
const badge = (s) => "text-bg-" + ({ open: "danger", pending: "warning", resolved: "success" }[s] || "secondary");
const say = (m) => msg(m);

// ---- actions ----
async function submitTicket() {
  if (busy()) return; busy(true); say("");
  try {
    const r = await api("POST", "/api/tickets", form());
    setForm({ name: "", email: "", subject: "", body: "" });
    location.hash = "#/t/" + r.id;             // → route() → loadTicket
    say(`✓ Ticket ${r.ref} created — bookmark this page to track it.`);
  } catch (e) { say("✗ " + e.message); } finally { busy(false); }
}
async function loadTicket(id) {
  busy(true);
  try { ticket(await api("GET", "/api/tickets/" + id)); view("ticket"); }
  catch (e) { say("✗ " + e.message); view("home"); } finally { busy(false); }
}
async function sendReply() {
  if (busy() || !reply().trim()) return; busy(true);
  try { ticket(await api("POST", `/api/tickets/${ticket().id}/reply`, { body: reply() })); reply(""); }
  catch (e) { say("✗ " + e.message); } finally { busy(false); }
}
async function staffLoad() {
  if (!staffKey().trim()) return; busy(true); say("");
  try {
    const r = await api("GET", "/api/staff/tickets" + (staffFilter() ? "?status=" + staffFilter() : ""), null, { "x-staff-key": staffKey() });
    staffList(r.tickets); staffCounts(r.counts); staffOk(true);
    sessionStorage.setItem("hd_key", staffKey());
  } catch (e) { say("✗ " + e.message); staffOk(false); sessionStorage.removeItem("hd_key"); } finally { busy(false); }
}
async function staffOpen(id) {
  busy(true);
  try { ticket(await api("GET", "/api/staff/tickets/" + id, null, { "x-staff-key": staffKey() })); }
  catch (e) { say("✗ " + e.message); } finally { busy(false); }
}
async function staffSend() {
  if (busy() || !staffReply().trim() || !ticket()) return; busy(true);
  try { ticket(await api("POST", `/api/staff/tickets/${ticket().id}/reply`, { body: staffReply() }, { "x-staff-key": staffKey() })); staffReply(""); staffLoad(); }
  catch (e) { say("✗ " + e.message); } finally { busy(false); }
}
async function staffStatus(status) {
  if (!ticket()) return; busy(true);
  try { ticket(await api("POST", `/api/staff/tickets/${ticket().id}/status`, { status }, { "x-staff-key": staffKey() })); staffLoad(); }
  catch (e) { say("✗ " + e.message); } finally { busy(false); }
}
function signOut() { staffKey(""); staffOk(false); ticket(null); sessionStorage.removeItem("hd_key"); location.hash = "#/"; }

// ---- routing ----
function route() {
  say("");
  const m = location.hash.match(/^#\/t\/(.+)$/);
  if (m) return loadTicket(decodeURIComponent(m[1]));
  if (location.hash === "#/staff") { ticket(null); view("staff"); if (staffKey().trim()) staffLoad(); return; }
  ticket(null); view("home");
}
window.addEventListener("hashchange", route);

// ---- pieces ----
const bubble = (m) => html`
  <div class="d-flex mb-2 ${m.from === "staff" ? "justify-content-start" : "justify-content-end"}">
    <div class="bubble p-2 rounded border ${m.from === "staff" ? "bg-white" : "text-bg-primary border-primary"}">
      <div class="small fw-semibold mb-1">${m.from === "staff" ? "Support" : "Customer"}<span class="fw-normal opacity-75"> · ${fmt(m.at)}</span></div>
      <div>${m.body}</div>
    </div>
  </div>`;

const thread = () => html`<div class="thread border rounded p-3 mb-3 bg-light">${() => (ticket() ? ticket().messages.map(bubble) : "")}</div>`;

const field = (label, key, type = "text") => html`
  <div class="mb-3">
    <label class="form-label small text-muted mb-1">${label}</label>
    <input class="form-control" type=${type} value=${() => form()[key]} oninput=${(e) => setForm({ [key]: e.target.value })} />
  </div>`;

// ---- screens ----
const homeView = () => html`
  <div class="card shadow-sm"><div class="card-body p-4">
    <h1 class="h4 mb-1">How can we help?</h1>
    <p class="text-muted small mb-4">Send us a message and we'll get back to you. You'll get a link to track your ticket.</p>
    ${() => field("Your name", "name")}
    ${() => field("Email", "email", "email")}
    ${() => field("Subject", "subject")}
    <div class="mb-3">
      <label class="form-label small text-muted mb-1">Message</label>
      <textarea class="form-control" rows="5" value=${() => form().body} oninput=${(e) => setForm({ body: e.target.value })}></textarea>
    </div>
    <button class="btn btn-primary" disabled=${() => busy()} onclick=${submitTicket}>${() => (busy() ? "Sending…" : "Submit ticket")}</button>
  </div></div>`;

const ticketView = () => html`
  <div class="card shadow-sm"><div class="card-body p-4">
    <a class="small" href="#/">← New ticket</a>
    <div class="d-flex justify-content-between align-items-start mt-2 mb-3">
      <div><h1 class="h5 mb-1">${() => ticket()?.subject || ""}</h1>
        <div class="small text-muted mono">${() => ticket()?.ref || ""} · opened ${() => fmt(ticket()?.createdAt)}</div></div>
      <span class="badge ${() => badge(ticket()?.status)}">${() => ticket()?.status || ""}</span>
    </div>
    ${thread()}
    <div class="input-group">
      <input class="form-control" placeholder="Add a reply…" value=${() => reply()} oninput=${(e) => reply(e.target.value)}
        onkeydown=${(e) => { if (e.key === "Enter") sendReply(); }} />
      <button class="btn btn-primary" disabled=${() => busy()} onclick=${sendReply}>Send</button>
    </div>
  </div></div>`;

const staffSignIn = () => html`
  <div class="card shadow-sm" style="max-width:420px;margin:0 auto"><div class="card-body p-4">
    <h1 class="h5 mb-3">Staff sign in</h1>
    <div class="input-group">
      <input class="form-control" type="password" placeholder="Staff key" value=${() => staffKey()} oninput=${(e) => staffKey(e.target.value)}
        onkeydown=${(e) => { if (e.key === "Enter") staffLoad(); }} />
      <button class="btn btn-primary" disabled=${() => busy()} onclick=${staffLoad}>Sign in</button>
    </div>
    <div class="form-text">The key from the app's <code>.env</code> (<code>HELPDESK_KEY</code>).</div>
  </div></div>`;

const staffRow = (t) => html`
  <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" onclick=${() => staffOpen(t.id)}>
    <span class="text-truncate me-2"><span class="mono small text-muted">${t.ref}</span> ${t.subject}
      <span class="d-block small text-muted">${t.name} · ${t.count} msg · ${fmt(t.updatedAt)}</span></span>
    <span class="badge ${badge(t.status)}">${t.status}</span>
  </button>`;

const filterTab = (key, label) => html`
  <button type="button" class="btn btn-sm ${() => (staffFilter() === key ? "btn-primary" : "btn-outline-secondary")}"
    onclick=${() => { staffFilter(key); staffLoad(); }}>${label} ${() => (staffCounts()[key || "all"] != null ? `(${staffCounts()[key || "all"]})` : "")}</button>`;

const staffDetail = () => html`
  <div>
    <a class="small" href="#/staff" onclick=${(e) => { e.preventDefault(); ticket(null); }}>← Inbox</a>
    <div class="d-flex justify-content-between align-items-start mt-2 mb-3">
      <div><h1 class="h5 mb-1">${() => ticket()?.subject || ""}</h1>
        <div class="small text-muted">${() => ticket()?.name} &lt;${() => ticket()?.email}&gt; · <span class="mono">${() => ticket()?.ref}</span></div></div>
      <span class="badge ${() => badge(ticket()?.status)}">${() => ticket()?.status || ""}</span>
    </div>
    <div class="btn-group btn-group-sm mb-3">
      ${["open", "pending", "resolved"].map((s) => html`<button type="button" class="btn btn-outline-secondary" onclick=${() => staffStatus(s)}>Mark ${s}</button>`)}
    </div>
    ${thread()}
    <div class="input-group">
      <input class="form-control" placeholder="Reply to the customer…" value=${() => staffReply()} oninput=${(e) => staffReply(e.target.value)}
        onkeydown=${(e) => { if (e.key === "Enter") staffSend(); }} />
      <button class="btn btn-primary" disabled=${() => busy()} onclick=${staffSend}>Send</button>
    </div>
  </div>`;

const staffInbox = () => html`
  <div class="card shadow-sm"><div class="card-body p-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h1 class="h5 mb-0">Inbox</h1>
      <button class="btn btn-sm btn-link text-muted" onclick=${signOut}>Sign out</button>
    </div>
    ${() => (ticket() ? staffDetail() : html`
      <div class="d-flex gap-2 mb-3 flex-wrap">${filterTab("", "All")}${filterTab("open", "Open")}${filterTab("pending", "Pending")}${filterTab("resolved", "Resolved")}</div>
      <div class="list-group">${() => (staffList().length ? staffList().map(staffRow) : html`<div class="text-muted small p-3 text-center">No tickets.</div>`)}</div>`)}
  </div></div>`;

const staffView = () => html`<div>${() => (staffOk() ? staffInbox() : staffSignIn())}</div>`;

const screen = () => { const v = view(); return v === "ticket" ? ticketView() : v === "staff" ? staffView() : homeView(); };

// ---- mount ----
mount(document.getElementById("app"), html`
  ${() => (msg() ? html`<div class="alert ${msg().startsWith("✓") ? "alert-success" : "alert-danger"} py-2 small">${() => msg()}</div>` : "")}
  ${() => screen()}
`);
route();
