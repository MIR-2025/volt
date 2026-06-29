// admin-ui.js — the role-gated admin panel (frontend for the admin add-on).
// Renders nothing for non-admins; for admins, a data browser over /admin/api/*.
// Mounted by the app when the admin add-on is enabled.
import { signal, html } from "/volt.js";

const j = async (url, opts) => {
  const res = await fetch(url, opts);
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

export function adminPanel() {
  const ready = signal(false);
  const isAdmin = signal(false);
  const driver = signal("");
  const collections = signal([]);
  const current = signal("");
  const docs = signal([]);
  const note = signal("");

  async function init() {
    const { status, body } = await j("/admin/api/me");
    if (status === 200) isAdmin(!!body.isAdmin);
    ready(true);
    if (isAdmin()) load();
  }
  async function load() {
    const { body } = await j("/admin/api/collections");
    driver(body.driver || "");
    collections(body.collections || []);
    if (!current() && collections().length) open(collections()[0]);
  }
  async function open(name) {
    current(name);
    const { body } = await j(`/admin/api/collection?name=${encodeURIComponent(name)}`);
    docs(body.ok ? body.docs : []);
  }
  async function del(id) {
    await j(`/admin/api/doc?name=${encodeURIComponent(current())}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
    docs(docs().filter((d) => d.id !== id));
    note("Deleted.");
  }
  init();

  const tab = (name) =>
    html`<button class=${() => "btn btn-sm " + (current() === name ? "btn-primary" : "btn-outline-secondary")} onclick=${() => open(name)}>${name}</button>`;
  const row = (d) =>
    html`<div class="d-flex justify-content-between align-items-start gap-2 py-1" style="border-top:1px solid #232a36">
      <pre class="mb-0 small flex-grow-1" style="white-space:pre-wrap;color:#cfe3ff">${JSON.stringify(d, null, 2)}</pre>
      <button class="btn btn-sm btn-outline-danger" onclick=${() => del(d.id)}>✕</button>
    </div>`;

  // hidden entirely for non-admins (and until we know)
  return html`${() =>
    !ready() || !isAdmin()
      ? null
      : html`<div class="card-x p-4 mb-4">
          <h2 class="h6 mb-3">Admin <span class="text-muted small">— data ${() => (driver() ? "· " + driver() : "")}</span></h2>
          <div class="d-flex flex-wrap gap-1 mb-2">${() => (collections().length ? collections().map(tab) : html`<span class="text-muted small">No collections yet.</span>`)}</div>
          <div style="max-height:260px;overflow:auto">${() => (docs().length ? docs().map(row) : html`<span class="text-muted small">Empty.</span>`)}</div>
          ${() => (note() ? html`<p class="small text-muted mb-0 mt-2">${note}</p>` : null)}
        </div>`}`;
}
