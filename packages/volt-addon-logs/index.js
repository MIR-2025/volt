// volt-addon-logs — a gated log viewer for Volt.
//
// Sources (no arbitrary paths — fixed, safe set):
//   app    → ~/.pm2/logs/<app>-out.log   (pm2 stdout)
//   error  → ~/.pm2/logs/<app>-error.log (pm2 stderr)
//   access → process.env.ACCESS_LOG       (an Apache/nginx access log, if set)
//
// "App"/"error" tail raw lines. "Analytics" runs lines through mir-sentinel's
// parseLine (optional dependency) → top paths / status / IPs + bot/attack counts;
// works for access logs AND request lines in pm2 stdout, since the parser is
// format-tolerant.
//
// Security: mounts ONLY if ADMIN_PATH is set (fail-closed), behind magic-link auth
// + an ADMIN_EMAILS allowlist. Logs leak info — never expose them unauthenticated.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function appName() {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")).name || "app";
  } catch {
    return "app";
  }
}
function sources(env) {
  const logs = path.join(os.homedir(), ".pm2", "logs");
  const name = appName();
  const out = { app: path.join(logs, `${name}-out.log`), error: path.join(logs, `${name}-error.log`) };
  if (env.ACCESS_LOG) out.access = env.ACCESS_LOG;
  return out;
}
function tail(file, n) {
  if (!file || !fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).slice(-n);
}

// optional: mir-sentinel's parseLine (Apache/nginx/pm2 request-line analytics)
let parserCache;
async function getParser() {
  if (parserCache !== undefined) return parserCache;
  try {
    parserCache = (await import("mir-sentinel")).parseLine || null;
  } catch {
    parserCache = null;
  }
  return parserCache;
}
function rollup(parsed) {
  const top = (key) => {
    const m = {};
    for (const p of parsed) if (p && p[key]) m[p[key]] = (m[p[key]] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
  };
  return {
    total: parsed.length,
    paths: top("path"),
    statuses: top("status"),
    ips: top("ip"),
    bots: parsed.filter((p) => p && p.isBot).length,
    attacks: parsed.filter((p) => p && p.isAttack).length,
  };
}

const HTML = (base, hasParser) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Logs — Volt</title><meta name="robots" content="noindex" /><link rel="icon" href="/favicon.webp" />
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
<style>body{background:#0f1115;color:#e7e9ee}pre{background:#0b0d11;color:#cfe3ff;border:1px solid #232a36;border-radius:8px;padding:12px;max-height:70vh;overflow:auto;font-size:12.5px}</style>
<script>window.__LOGS_BASE=${JSON.stringify(base)};window.__HAS_PARSER=${hasParser};</script>
</head><body><div class="container-fluid py-3">
  <div class="d-flex gap-2 align-items-center mb-2">
    <strong class="me-2">Logs</strong>
    <select id="src" class="form-select form-select-sm" style="max-width:200px"></select>
    <select id="view" class="form-select form-select-sm" style="max-width:160px"><option value="tail">Raw tail</option><option value="analytics">Analytics</option></select>
    <button id="refresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
    <label class="form-check-label small ms-2"><input id="follow" type="checkbox" class="form-check-input" /> follow</label>
    <input id="filter" class="form-control form-control-sm ms-auto" style="max-width:240px" placeholder="filter…" />
  </div>
  <div id="out"></div>
</div>
<script type="module" src="${base}/logs.js"></script>
</body></html>`;

export function register({ app, env, requireAuth, log }) {
  const raw = (env.ADMIN_PATH || "").trim();
  if (!raw) return log("ADMIN_PATH not set — logs viewer disabled (fail-closed).");
  if (!requireAuth) return log("auth add-on is required for the logs viewer — disabled.");
  const base = "/" + raw.replace(/^\/+|\/+$/g, "") + "/logs";
  const allow = new Set(String(env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const gate = [
    requireAuth,
    (req, res, next) => {
      if (allow.size && !allow.has(String(req.user?.email || "").toLowerCase())) return res.status(403).type("html").send("Not authorized.");
      next();
    },
  ];

  app.get(base, gate, async (_req, res) => res.type("html").send(HTML(base, !!(await getParser()))));
  app.get(base + "/logs.js", gate, (_req, res) => res.type("js").sendFile(path.join(__dirname, "public", "logs.js")));
  app.get(base + "/api/sources", gate, async (_req, res) => res.json({ sources: Object.keys(sources(env)), analytics: !!(await getParser()) }));
  app.get(base + "/api/tail", gate, (req, res) => {
    const file = sources(env)[req.query.source];
    if (!file) return res.status(400).json({ ok: false, error: "unknown source" });
    res.json({ ok: true, lines: tail(file, Math.min(2000, Number(req.query.lines) || 300)) });
  });
  app.get(base + "/api/analytics", gate, async (req, res) => {
    const parseLine = await getParser();
    if (!parseLine) return res.json({ ok: false, error: "install mir-sentinel for analytics" });
    const file = sources(env)[req.query.source];
    if (!file) return res.status(400).json({ ok: false, error: "unknown source" });
    res.json({ ok: true, ...rollup(tail(file, 5000).map((l) => parseLine(l))) });
  });

  log(`logs viewer at ${base} — analytics: ${parserCache ? "on" : "install mir-sentinel"}; allowlist: ${allow.size ? [...allow].join(", ") : "(any signed-in user — set ADMIN_EMAILS!)"}`);
}
