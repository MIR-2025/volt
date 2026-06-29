// enhance.js — progressive enhancement for the server-rendered site. Content is
// already in the HTML (for SEO + no-JS); this just wires copy buttons and drops
// a live Volt widget on the landing (so the site dogfoods its own library).
import { signal, el, mount } from "/volt.js";

// copy buttons baked into marketing pages (cmd boxes)
for (const b of document.querySelectorAll(".copy")) {
  b.addEventListener("click", () => {
    navigator.clipboard?.writeText(b.dataset.copy || "");
    const t = b.textContent;
    b.textContent = "✓ copied";
    setTimeout(() => (b.textContent = t), 1200);
  });
}

// add a copy button to every code block in the markdown-rendered docs
for (const pre of document.querySelectorAll(".docs-content pre")) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "copy";
  btn.textContent = "Copy";
  btn.addEventListener("click", () => {
    navigator.clipboard?.writeText(pre.innerText);
    btn.textContent = "✓ copied";
    setTimeout(() => (btn.textContent = "Copy"), 1200);
  });
  pre.appendChild(btn);
}

const demo = document.getElementById("volt-demo");
if (demo) {
  const n = signal(0);
  mount(
    demo,
    el(
      "div",
      { class: "card-x d-inline-flex align-items-center gap-2 p-2 px-3" },
      el("span", { class: "small lead2" }, "a live Volt signal →"),
      el("button", { class: "btn btn-sm btn-outline-secondary", onClick: () => n(n() - 1) }, "−"),
      el("span", { class: "fw-bold", style: "min-width:2ch;text-align:center" }, () => String(n())),
      el("button", { class: "btn btn-sm btn-primary", onClick: () => n(n() + 1) }, "+"),
    ),
  );
}
