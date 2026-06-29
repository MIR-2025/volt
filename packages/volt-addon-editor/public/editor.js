// editor.js — the RTEPro editor client. Loads after rte-pro.js (window.RTEPro).
// Lists pages, loads one (markdown rendered to HTML server-side), edits, and
// saves back as markdown via getMarkdown().
const base = window.__VOLT_BASE || location.pathname.replace(/\/+$/, "");
const $ = (s) => document.querySelector(s);

const ed = RTEPro.init("#editor", {
  height: "62vh",
  placeholder: "Write…",
  aiProxy: base + "/api/ai",
  aiProvider: window.__VOLT_AI_PROVIDER || "anthropic",
});

async function refresh() {
  const { pages } = await (await fetch(base + "/api/pages")).json();
  const list = $("#pages");
  list.innerHTML = "";
  for (const p of pages) {
    const a = document.createElement("a");
    a.className = "list-group-item list-group-item-action bg-transparent text-light";
    a.textContent = p.slug;
    a.onclick = (e) => {
      e.preventDefault();
      load(p.slug);
    };
    list.appendChild(a);
  }
}

async function load(slug) {
  const d = await (await fetch(base + "/api/page?slug=" + encodeURIComponent(slug))).json();
  $("#slug").value = slug;
  $("#title").value = d.title || slug;
  ed.setHTML(d.html || "");
  $("#msg").textContent = "Editing " + slug;
}

function newPage() {
  $("#slug").value = "";
  $("#title").value = "";
  ed.setHTML("");
  $("#msg").textContent = "New page";
}

async function save() {
  const slug = ($("#slug").value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return ($("#msg").textContent = "Slug must be lowercase letters, numbers, hyphens.");
  const res = await (
    await fetch(base + "/api/page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, title: $("#title").value, html: ed.getHTML() }),
    })
  ).json();
  $("#msg").textContent = res.ok ? "Saved → " + res.url : "Error: " + (res.error || "?");
  if (res.ok) refresh();
}

$("#save").onclick = save;
$("#new").onclick = newPage;
refresh();
