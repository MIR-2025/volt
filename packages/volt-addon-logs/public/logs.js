// logs.js — the log viewer client (raw tail + mir-sentinel analytics).
const base = window.__LOGS_BASE || "";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
let timer = null;

async function loadSources() {
  const { sources = [] } = await (await fetch(base + "/api/sources")).json();
  $("#src").innerHTML = sources.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("") || `<option>(no logs found)</option>`;
}

async function render() {
  const src = $("#src").value;
  if (!src) return;
  if ($("#view").value === "analytics") {
    const a = await (await fetch(`${base}/api/analytics?source=${encodeURIComponent(src)}`)).json();
    if (!a.ok) {
      $("#out").innerHTML = `<div class="text-muted small">${esc(a.error || "no analytics")}</div>`;
      return;
    }
    const tbl = (title, rows) => `<h6 class="mt-3">${title}</h6><table class="table table-dark table-sm mb-0"><tbody>${(rows || []).map(([k, v]) => `<tr><td>${esc(String(k))}</td><td class="text-end">${v}</td></tr>`).join("")}</tbody></table>`;
    $("#out").innerHTML = `<div class="small text-muted mb-2">${a.total} lines · ${a.bots} bot · ${a.attacks} attack</div>` + tbl("Top paths", a.paths) + tbl("Status codes", a.statuses) + tbl("Top IPs", a.ips);
  } else {
    const { lines = [] } = await (await fetch(`${base}/api/tail?source=${encodeURIComponent(src)}&lines=400`)).json();
    const filter = $("#filter").value.toLowerCase();
    const shown = filter ? lines.filter((l) => l.toLowerCase().includes(filter)) : lines;
    const pre = document.createElement("pre");
    pre.textContent = shown.join("\n") || "(empty)";
    $("#out").innerHTML = "";
    $("#out").appendChild(pre);
    pre.scrollTop = pre.scrollHeight;
  }
}

$("#refresh").onclick = render;
$("#src").onchange = render;
$("#view").onchange = render;
$("#filter").oninput = render;
$("#follow").onchange = (e) => {
  clearInterval(timer);
  if (e.target.checked) timer = setInterval(render, 3000);
};
loadSources().then(render);
