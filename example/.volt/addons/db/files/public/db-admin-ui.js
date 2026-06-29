// db-admin-ui.js — a tiny, auth-gated data browser (frontend for the db add-on).
// Served at /db-admin-ui.js; mounted by public/app.js only when db + auth are on.
// Works for every driver — it reads through the generic store API on the server.
// Documents render as escaped JSON text (Volt holes → text nodes), never HTML.
import { signal, computed, html } from "/volt.js";

const j = async (url, opts) => {
  const res = await fetch(url, opts);
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

export function dbAdminPanel() {
  const ready = signal(false); // signed in + loaded
  const denied = signal(false); // 401
  const driver = signal("");
  const collections = signal([]);
  const current = signal("");
  const docs = signal([]);
  const note = signal("");

  async function loadCollections() {
    const { status, body } = await j("/admin/db/collections");
    if (status === 401) {
      denied(true);
      return;
    }
    denied(false);
    driver(body.driver || "");
    collections(body.collections || []);
    ready(true);
    if (!current() && collections().length) openCollection(collections()[0]);
  }
  async function openCollection(name) {
    current(name);
    note("");
    const { body } = await j(`/admin/db/collection?name=${encodeURIComponent(name)}`);
    docs(body.ok ? body.docs : []);
  }
  async function del(id) {
    if (!id) return;
    await j(`/admin/db/doc?name=${encodeURIComponent(current())}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
    docs(docs().filter((d) => d.id !== id));
    note("Deleted.");
  }

  loadCollections();

  const collTab = (name) =>
    html`<button class=${() => "btn btn-sm " + (current() === name ? "btn-primary" : "btn-outline-secondary")} onclick=${() => openCollection(name)}>${name}</button>`;

  const docRow = (d) =>
    html`<div class="d-flex justify-content-between align-items-start gap-2 py-1" style="border-top:1px solid #232a36">
      <pre class="mb-0 small flex-grow-1" style="white-space:pre-wrap;color:#cfe3ff">${JSON.stringify(d, null, 2)}</pre>
      <button class="btn btn-sm btn-outline-danger" onclick=${() => del(d.id)}>✕</button>
    </div>`;

  const heading = computed(() => `Data ${driver() ? `— ${driver()}` : ""}`);

  return html`<div class="card-x p-4 mb-4">
    <h2 class="h6 mb-3">${heading} <span class="text-muted small">— admin</span></h2>
    ${() =>
      denied()
        ? html`<p class="text-muted small mb-0">Sign in to browse your data.</p>`
        : !ready()
          ? html`<p class="text-muted small mb-0">Loading…</p>`
          : html`<div class="d-flex flex-wrap gap-1 mb-2">${() => (collections().length ? collections().map(collTab) : html`<span class="text-muted small">No collections yet.</span>`)}</div>
              <div style="max-height:260px;overflow:auto">
                ${() => (docs().length ? docs().map(docRow) : html`<span class="text-muted small">Empty.</span>`)}
              </div>
              ${() => (note() ? html`<p class="small text-muted mb-0 mt-2">${note}</p>` : null)}`}
  </div>`;
}
