// editor.js — the RTEPro editor client. Loads after rte-pro.js (window.RTEPro).
// Lists pages, loads one (markdown rendered to HTML server-side), edits, and
// saves back as markdown via getMarkdown().
const base = window.__VOLT_BASE || location.pathname.replace(/\/+$/, "");
const $ = (s) => document.querySelector(s);

// Load the active theme's CSS so the editor preview matches the published page.
let themeCss = "";
try {
  themeCss = await (await fetch("/_theme.css")).text();
} catch {
  /* no theme css */
}

const ed = RTEPro.init("#editor", {
  height: "62vh",
  placeholder: "Write…",
  aiProxy: base + "/api/ai",
  aiProvider: window.__VOLT_AI_PROVIDER || "anthropic",
  exportCSS: themeCss,
});

// Markdown can't round-trip complex layouts (multi-column, merged table cells,
// inline styles, colors, embeds). Detect those and lock the save format to HTML
// so the layout isn't silently flattened on save.
const fmtSel = $("#fmt");
const mdOption = fmtSel && [...fmtSel.options].find((o) => o.value === "markdown");
function isComplex(html) {
  return (
    /\bstyle\s*=\s*["'][^"']*(text-align|column|float|grid|flex|width|height|color|background|font|margin|padding)/i.test(html) ||
    /\b(colspan|rowspan)\b/i.test(html) ||
    /<(u|font|mark|sub|sup|iframe|video|audio|figure)\b/i.test(html) ||
    /class\s*=\s*["'][^"']*(col|grid|row|flex|layout)/i.test(html)
  );
}
function updateFmtLock() {
  if (!mdOption) return;
  const complex = isComplex(ed.getHTML() || "");
  mdOption.disabled = complex;
  mdOption.textContent = complex ? "Markdown — unavailable (complex layout)" : "Markdown";
  if (complex && fmtSel.value === "markdown") fmtSel.value = "html";
  if (complex) $("#msg").textContent = "Complex layout — saving as HTML to preserve it (Markdown would flatten it).";
}
$("#editor").addEventListener("input", updateFmtLock);

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
  if (d.format) $("#fmt").value = d.format;
  $("#desc").value = d.description || "";
  $("#img").value = d.image || "";
  $("#jsonld").value = d.jsonld || "";
  ed.setHTML(d.html || "");
  updateFmtLock();
  $("#msg").textContent = "Editing " + slug;
}

function newPage() {
  $("#slug").value = "";
  $("#title").value = "";
  $("#desc").value = "";
  $("#img").value = "";
  $("#jsonld").value = "";
  ed.setHTML("");
  updateFmtLock();
  $("#msg").textContent = "New page";
}

async function save() {
  const slug = ($("#slug").value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return ($("#msg").textContent = "Slug must be lowercase letters, numbers, hyphens.");
  const fmt = ($("#fmt") || {}).value || "html";
  const seo = { description: $("#desc").value, image: $("#img").value, jsonld: $("#jsonld").value };
  const payload = fmt === "markdown" ? { slug, title: $("#title").value, markdown: ed.getMarkdown(), ...seo } : { slug, title: $("#title").value, html: ed.getHTML(), ...seo };
  const res = await (
    await fetch(base + "/api/page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  ).json();
  $("#msg").textContent = res.ok ? "Saved → " + res.url : "Error: " + (res.error || "?");
  if (res.ok) refresh();
}

$("#save").onclick = save;
$("#new").onclick = newPage;
refresh();
updateFmtLock();
