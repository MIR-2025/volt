// app.js — demo app. Shows BOTH authoring styles on one shared signal engine,
// with live hot reload. Edit anything here (or in index.html) and save: the
// dev server pushes a reload over Socket.io and the page refreshes.

import { signal, computed, el, html, mount } from "/volt.js";

// --- Counter, written with el() helpers (imperative, zero template parsing) ---
function Counter() {
  const n = signal(0);
  return el("div", { class: "card-x p-4 mb-4" },
    el("h2", { class: "h5 mb-3" }, "Counter — built with el()"),
    el("div", { class: "d-flex align-items-center gap-3" },
      el("button", { class: "btn btn-outline-secondary", onClick: () => n(n() - 1) }, "−"),
      el("span", { class: "fs-4 fw-bold", style: "min-width:3ch;text-align:center" },
        () => String(n())), // function-child: only this text node updates
      el("button", { class: "btn btn-primary", onClick: () => n(n() + 1) }, "+"),
      el("span", { class: "text-muted ms-2" },
        () => (n() % 2 === 0 ? "even" : "odd")),
    ),
  );
}

// --- Todo list, written with html`` templates (markup-first) ---
function Todos() {
  const items = signal([]); // [{ id, text, done }]
  const draft = signal("");
  const remaining = computed(() => items().filter((t) => !t.done).length);

  const add = () => {
    const text = draft().trim();
    if (!text) return;
    items([...items(), { id: Date.now() + Math.random(), text, done: false }]);
    draft("");
  };
  const toggle = (id) =>
    items(items().map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id) => items(items().filter((t) => t.id !== id));

  const row = (t) => html`
    <li class="list-group-item d-flex align-items-center gap-2">
      <input class="form-check-input mt-0" type="checkbox"
             checked=${t.done} onchange=${() => toggle(t.id)} />
      <span class=${() => "flex-grow-1 " + (t.done ? "text-decoration-line-through text-muted" : "")}>
        ${t.text}
      </span>
      <button class="btn btn-sm btn-outline-danger" onclick=${() => remove(t.id)}>✕</button>
    </li>`;

  return html`
    <div class="card-x p-4">
      <h2 class="h5 mb-3">Todos — built with html\`\`</h2>
      <div class="input-group mb-3">
        <input class="form-control" placeholder="Add a task…"
               value=${draft}
               oninput=${(e) => draft(e.target.value)}
               onkeydown=${(e) => e.key === "Enter" && add()} />
        <button class="btn btn-primary" onclick=${add}>Add</button>
      </div>
      <ul class="list-group mb-2">
        ${() => items().map(row)}
      </ul>
      <small class="text-muted">${remaining} remaining</small>
    </div>`;
}

// Mount the demo, plus the UI for any enabled add-ons (auth, realtime, …).
// Add-ons serve their own /…-ui.js when turned on in the setup wizard.
const nodes = [Counter(), Todos()];
let enabled = [];
try {
  enabled = await (await fetch("/__volt/addons")).json();
} catch {
  /* older app without the endpoint — just the demo */
}
if (enabled.includes("auth")) {
  try {
    nodes.unshift((await import("/auth-ui.js")).authPanel());
  } catch {
    /* auth UI unavailable */
  }
}
if (enabled.includes("realtime")) {
  try {
    nodes.push((await import("/chat-ui.js")).chatPanel());
  } catch {
    /* realtime UI unavailable */
  }
}
if (enabled.includes("admin")) {
  try {
    nodes.push((await import("/admin-ui.js")).adminPanel());
  } catch {
    /* admin UI unavailable */
  }
}
mount("#app", ...nodes);
