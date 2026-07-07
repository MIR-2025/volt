// server.js — dev server with a built-in first-run setup wizard.
//
// First run (no .env) or `node server.js --edit` (-e) opens a disposable, local
// config page: tick add-ons, fill settings, Apply. Apply writes .env (a
// VOLT_ADDONS list + settings) and adds any needed packages to package.json,
// runs npm install, then starts the app — which wires whatever .env enables.
// Add-on code is bundled under .volt/addons; nothing is copied into your code.
//
// No build step, no env-file flag: .env is auto-loaded below.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dns from "node:dns";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";
import express from "express";
import { Server as SocketServer } from "socket.io";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, ".env");
const PKG_PATH = path.join(__dirname, "package.json");
const ADDONS_DIR = path.join(__dirname, ".volt", "addons"); // bundled add-on sources
const THEMES_DIR = path.join(__dirname, ".volt", "themes"); // bundled themes the wizard can pick
const DEFAULT_PORT = 26628; // create-volt stamps this with the project's date-port
const CONFIG_DEFAULT_PORT = 5050; // the --edit/--studio config UI's default port (its own, so it never clashes with a running app)

// `--port <n>` (or --port=<n>) overrides the listen port for this run — lets
// --edit/--studio dodge a port the running app already holds, and runs the app
// itself on a one-off port. Explicit flag wins over PORT in .env.
function cliPort() {
  const i = process.argv.indexOf("--port");
  const raw = i > -1 ? process.argv[i + 1] : (process.argv.find((a) => a.startsWith("--port=")) || "").split("=")[1];
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
}

// Port for the disposable config UI (--edit / --studio): --port wins, then
// CONFIG_PORT in .env (run it on its own port so it never clashes with the app),
// then the app's PORT, then the date-port.
function configPort() {
  const env = readEnvFile(); // --edit runs before loadEnv(), so read the file too
  return cliPort() || Number(process.env.CONFIG_PORT) || Number(env.CONFIG_PORT) || CONFIG_DEFAULT_PORT;
}
const PKG_VERSIONS = { mongodb: "^6.21.0", mysql2: "^3.22.5", pg: "^8.22.0", nodemailer: "^9.0.3", marked: "^18.0.5", busboy: "^1.6.0", "@aws-sdk/client-s3": "^3.1075.0" };
const LIB_FILE = { db: "store.js", mailer: "mailer.js", auth: "auth.js", realtime: "realtime.js", pages: "pages.js", posts: "posts.js", media: "media.js" };

// --- tiny .env loader (no dependency); never overrides an existing env var ---
function readEnvFile() {
  const out = {};
  if (!fs.existsSync(ENV_PATH)) return out;
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) {
      const v = m[2];
      out[m[1]] = (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")) ? v.slice(1, -1) : v.replace(/(?:^|\s+)#.*$/, "");
    }
  }
  return out;
}
function loadEnv() {
  for (const [k, v] of Object.entries(readEnvFile())) if (!(k in process.env)) process.env[k] = v;
}

// Add-ons available to enable (bundled under .volt/addons by create-volt).
function availableAddons() {
  if (!fs.existsSync(ADDONS_DIR)) return [];
  return fs
    .readdirSync(ADDONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(ADDONS_DIR, e.name, "meta.json"))) // skip local 3rd-party add-ons (no meta)
    .map((e) => {
      const m = JSON.parse(fs.readFileSync(path.join(ADDONS_DIR, e.name, "meta.json"), "utf8"));
      return { name: e.name, description: m.description, dependsOn: m.dependsOn || [] };
    });
}

// Themes bundled by create-volt (under .volt/themes), pickable in the wizard.
function availableThemes() {
  if (!fs.existsSync(THEMES_DIR)) return [];
  return fs
    .readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(THEMES_DIR, e.name, "index.js")))
    .map((e) => {
      let description = "";
      try {
        description = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, e.name, "meta.json"), "utf8")).description;
      } catch {
        /* no meta */
      }
      return { name: e.name, description };
    });
}

// Which add-ons does VOLT_ADDONS turn on (dependencies expanded)?
function enabledFrom(env) {
  const metas = Object.fromEntries(availableAddons().map((a) => [a.name, a]));
  const out = new Set();
  const visit = (n) => {
    if (out.has(n)) return; // include third-party names too, not just bundled ones
    out.add(n);
    for (const d of metas[n]?.dependsOn || []) visit(d);
  };
  for (const n of String(env.VOLT_ADDONS || "").split(",").map((s) => s.trim()).filter(Boolean)) visit(n);
  return out;
}

const imp = (rel) => import(pathToFileURL(path.join(__dirname, rel)).href);
const addonMod = (n) => imp(path.join(".volt", "addons", n, "files", "lib", LIB_FILE[n]));

// Built-in add-ons are wired explicitly below; everything else in VOLT_ADDONS is
// a third-party add-on — a local .volt/addons/<name>/index.js or an installed
// npm package "volt-addon-<name>" exporting register(ctx). See /docs/plugins.
const BUILTINS = new Set(Object.keys(LIB_FILE));
async function loadAddon(name) {
  const local = path.join(__dirname, ".volt", "addons", name, "index.js");
  if (fs.existsSync(local)) return imp(path.join(".volt", "addons", name, "index.js"));
  for (const id of [`volt-addon-${name}`, name]) {
    try {
      return await import(id);
    } catch {
      /* try next */
    }
  }
  return null;
}

function openBrowser(url) {
  if (process.env.VOLT_NO_OPEN || process.argv.includes("--no-open")) return false;
  const plat = process.platform;
  if (plat === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return false;
  const cmd = plat === "darwin" ? "open" : plat === "win32" ? "cmd" : "xdg-open";
  const args = plat === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {}); // launcher missing — emits async, don't crash
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// --- the actual app: wires whichever add-ons .env enables ---
async function startApp() {
  const PORT = cliPort() || Number(process.env.PORT) || DEFAULT_PORT;
  const enabled = enabledFrom(process.env);
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  app.use(express.static(path.join(__dirname, "public")));

  let store = null;
  let mailer = null;
  if (enabled.has("db")) {
    const dbMod = await addonMod("db");
    store = await dbMod.createStore();
    // seed data/*.json into empty collections on first boot (fixtures / migration output)
    const seeded = await dbMod.seed(store, path.join(__dirname, "data"));
    if (seeded.length) console.log("[db] seeded " + seeded.map((s) => `${s.count}→${s.collection}`).join(", ") + " from data/");
  }
  if (enabled.has("mailer")) mailer = await (await addonMod("mailer")).createMailer();
  if (enabled.has("auth") && store && mailer) app.use((await addonMod("auth")).authRouter({ store, mailer }));

  // expose which add-ons are on, and serve each enabled add-on's frontend assets
  app.get("/__volt/addons", (_req, res) => res.json([...enabled]));
  for (const n of enabled) {
    const pub = path.join(ADDONS_DIR, n, "files", "public");
    if (fs.existsSync(pub)) app.use(express.static(pub));
  }

  app.get("/", (_req, res, next) => {
    // a themed home page (pages/index.md) takes over "/" — else the app's index.html
    if (enabled.has("pages") && fs.existsSync(path.join(__dirname, "pages", "index.md"))) return next();
    res.sendFile(path.join(__dirname, "views", "index.html"));
  });

  // media uploads (POST /api/media, auth-gated; local files served at /media)
  if (enabled.has("media") && store) {
    const requireAuth = (await addonMod("auth")).requireAuth(store);
    app.use(await (await addonMod("media")).mediaRouter({ requireAuth, dir: path.join(__dirname, "media") }));
  }

  // markdown pages (/<slug> → pages/<slug>.md) — mounted last, so app routes win
  // blog posts (/blog, /blog/<slug>, /category, /tag, /feed.xml) — before pages so /blog wins; renders in the same theme.
  if (enabled.has("posts")) app.use(await (await addonMod("posts")).postsRouter({ dir: path.join(__dirname, "posts"), themeDir: path.join(__dirname, "pages") }));
  if (enabled.has("pages")) app.use(await (await addonMod("pages")).pagesRouter({ dir: path.join(__dirname, "pages") }));

  const server = http.createServer(app);
  const io = new SocketServer(server);
  if (enabled.has("realtime") && store) (await addonMod("realtime")).attachRealtime(io, { store });

  // Reload connected browsers on demand — used when a second `npm run dev` finds
  // the app already running (see the EADDRINUSE handler below) instead of crashing.
  app.get("/__volt/reload", (_req, res) => {
    io.emit("volt:reload", { file: "__manual__" });
    res.json({ ok: true });
  });

  // third-party add-ons — register(ctx). When auth is on, requireAuth/sessionFromReq
  // are provided so add-ons can gate routes by login.
  let requireAuth = null;
  let sessionFromReq = null;
  if (enabled.has("auth") && store) {
    const a = await addonMod("auth");
    requireAuth = a.requireAuth(store);
    sessionFromReq = (req) => a.sessionFromReq(store, req);
  }
  for (const name of enabled) {
    if (BUILTINS.has(name)) continue;
    const mod = await loadAddon(name);
    const register = mod && (mod.register || mod.default);
    if (typeof register === "function") {
      await register({ app, express, io, store, mailer, env: process.env, requireAuth, sessionFromReq, log: (...a) => console.log(`[${name}]`, ...a) });
    } else {
      console.warn(`[volt] add-on "${name}" not found or missing a register() export — skipped`);
    }
  }

  // themed 404 — registered LAST so a genuinely unknown path renders in the active
  // theme (with nav) instead of Express's bare "Cannot GET". Customize via pages/404.md.
  if (enabled.has("pages")) app.use((await addonMod("pages")).notFound(path.join(__dirname, "pages")));

  let timer = null;
  const onChange = (file) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`[volt] change: ${file ?? "?"} → reload`);
      io.emit("volt:reload", { file });
    }, 80);
  };
  const watchRecursive = (dir) => {
    try {
      fs.watch(dir, { recursive: true }, (_e, f) => onChange(f));
      return;
    } catch {
      /* per-dir fallback */
    }
    const w = (d) => {
      try {
        fs.watch(d, (_e, f) => onChange(f));
      } catch {
        /* ignore */
      }
      for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) w(path.join(d, e.name));
    };
    w(dir);
  };
  // watch content dirs too (pages/posts markdown is read per request, so a
  // browser reload shows the edit); skip dirs that don't exist.
  for (const d of ["views", "public", "pages", "posts"]) {
    const full = path.join(__dirname, d);
    if (fs.existsSync(full)) watchRecursive(full);
  }

  const on = [...enabled];
  // If the port's taken, the app is likely already running — reload it (tell the
  // running instance to refresh browsers) and exit, instead of an EADDRINUSE crash.
  server.on("error", async (e) => {
    if (e.code === "EADDRINUSE") {
      try {
        await fetch(`http://localhost:${PORT}/__volt/reload`);
      } catch {
        /* old instance without the reload route, or not ours */
      }
      console.log(`\n[volt] already running at http://localhost:${PORT} — reloaded it. (Stop that process, or use pm2, to restart.)`);
      process.exit(0);
    }
    throw e;
  });
  server.listen(PORT, () => console.log(`Volt at http://localhost:${PORT}${on.length ? "  (add-ons: " + on.join(", ") + ")" : ""}`));
}

// Packages an .env's selections need, beyond what package.json already has.
function neededPackages(env) {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
  const deps = pkg.dependencies || {};
  const want = [];
  const driver = (env.match(/^\s*DB_DRIVER\s*=\s*(\w+)/m) || [])[1];
  if (driver === "mongodb") want.push("mongodb");
  if (driver === "mysql") want.push("mysql2");
  if (driver === "postgres") want.push("pg");
  if (/^\s*SMTP_URL\s*=\s*\S/m.test(env)) want.push("nodemailer");
  if (/^\s*VOLT_ADDONS\s*=.*\b(pages|posts)\b/m.test(env)) want.push("marked");
  if (/^\s*VOLT_ADDONS\s*=.*\bmedia\b/m.test(env)) want.push("busboy");
  if (/^\s*MEDIA_DRIVER\s*=\s*s3\b/m.test(env)) want.push("@aws-sdk/client-s3");
  return want.filter((p) => !deps[p]);
}

// Install a DB driver's package on demand (pinned), so the wizard's "Test
// connection" works before Apply has installed it.
function ensureDriverInstalled(driver) {
  const pkg = { mongodb: "mongodb", mongo: "mongodb", mysql: "mysql2", postgres: "pg", postgresql: "pg", pg: "pg" }[String(driver || "").toLowerCase()];
  if (!pkg || fs.existsSync(path.join(__dirname, "node_modules", pkg))) return;
  console.log(`[volt] installing ${pkg} for the connection test…`);
  spawnSync("npm", ["install", `${pkg}@${PKG_VERSIONS[pkg] || "latest"}`], { cwd: __dirname, stdio: "inherit", shell: process.platform === "win32" });
}

// --- the disposable setup wizard (localhost only) ---
function startSetup() {
  const PORT = configPort();
  const assets = {
    "/setup.js": ["text/javascript; charset=utf-8", fs.readFileSync(path.join(__dirname, "setup", "setup.js"))],
    "/volt.js": ["text/javascript; charset=utf-8", fs.readFileSync(path.join(__dirname, "public", "volt.js"))],
    "/logo.webp": ["image/webp", fs.readFileSync(path.join(__dirname, "public", "logo.webp"))],
    "/favicon.webp": ["image/webp", fs.readFileSync(path.join(__dirname, "public", "favicon.webp"))],
  };
  const indexHtml = fs.readFileSync(path.join(__dirname, "setup", "index.html"));

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    const p = u.pathname;
    if (req.method === "GET" && p === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(indexHtml);
    }
    if (req.method === "GET" && assets[p]) {
      res.setHeader("Content-Type", assets[p][0]);
      return res.end(assets[p][1]);
    }
    // Serve uploaded media so library thumbnails + editor previews render inside the
    // config (the running app serves these via express.static; the config didn't).
    if (req.method === "GET" && p.startsWith("/media/")) {
      const base = path.join(__dirname, "public", "media");
      const f = path.resolve(base, decodeURIComponent(p.slice("/media/".length)));
      if ((f === base || f.startsWith(base + path.sep)) && fs.existsSync(f) && fs.statSync(f).isFile()) {
        const ext = (f.split(".").pop() || "").toLowerCase();
        const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg", m4v: "video/x-m4v", ogg: "audio/ogg", mp3: "audio/mpeg", wav: "audio/wav" }[ext] || "application/octet-stream";
        res.setHeader("Content-Type", mime);
        return res.end(fs.readFileSync(f));
      }
      res.statusCode = 404;
      return res.end("not found");
    }
    if (req.method === "GET" && p === "/setup/state") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ available: availableAddons(), themes: availableThemes(), current: readEnvFile(), defaultPort: DEFAULT_PORT, configDefaultPort: CONFIG_DEFAULT_PORT, firstRun: !fs.existsSync(ENV_PATH) }));
    }
    // --- upgrade: compare .volt/version to npm latest, and run the update ---
    if (req.method === "GET" && p === "/setup/upgrade-check") {
      const vf = path.join(__dirname, ".volt", "version");
      const current = (fs.existsSync(vf) ? fs.readFileSync(vf, "utf8").trim() : "") || "?";
      fetch("https://registry.npmjs.org/create-volt/latest")
        .then((r) => r.json())
        .then((j) => {
          const latest = j.version || "?";
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ current, latest, available: latest !== "?" && current !== "?" && latest !== current }));
        })
        .catch(() => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ current, latest: "?", available: false }));
        });
      return;
    }
    if (req.method === "POST" && p === "/setup/upgrade") {
      res.setHeader("Content-Type", "application/json");
      try {
        const r = spawnSync("npx", ["--yes", "create-volt@latest", "update"], { cwd: __dirname, encoding: "utf8", shell: process.platform === "win32" });
        res.end(JSON.stringify({ ok: r.status === 0, output: ((r.stdout || "") + (r.stderr || "")).slice(-2000) }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }
    // --- generate a free hosted-AI token from the gateway (self-service) ---
    if (req.method === "POST" && p === "/setup/gen-token") {
      res.setHeader("Content-Type", "application/json");
      const env = readEnvFile();
      const base = (env.VOLT_AI_GATEWAY || "https://voltjs.com/api/ai").replace(/\/api\/ai\/?$/, "");
      fetch(base + "/api/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: env.SITE_NAME || "volt-app" }) })
        .then((r) => (r.ok ? r.json() : { ok: false, error: `hosted AI gateway not available (HTTP ${r.status}) — is it deployed?` }))
        .then((j) => res.end(JSON.stringify(j)))
        .catch(() => res.end(JSON.stringify({ ok: false, error: "hosted AI gateway unreachable" })));
      return;
    }
    // --- AI proxy for the in-config editor (RTEPro). Uses a local provider key
    // (BYO) when set; otherwise falls back to the voltjs.com gateway via
    // VOLT_AI_TOKEN (free-capped, then pay-as-you-go on the host's key). The
    // key/token never reaches the browser. ---
    if (req.method === "POST" && p === "/setup/ai") {
      let cbody = "";
      req.on("data", (c) => (cbody += c));
      req.on("end", async () => {
        res.setHeader("Content-Type", "application/json");
        try {
          const env = readEnvFile();
          const body = JSON.parse(cbody || "{}");
          const provider = body._provider || env.AI_PROVIDER || "anthropic";
          delete body._provider;
          const localKey = { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY, gemini: env.GEMINI_API_KEY }[provider];
          let url, headers, payload = body;
          if (localKey) {
            if (provider === "anthropic") {
              url = "https://api.anthropic.com/v1/messages";
              headers = { "x-api-key": localKey, "anthropic-version": "2023-06-01", "content-type": "application/json" };
            } else if (provider === "openai") {
              url = "https://api.openai.com/v1/chat/completions";
              headers = { authorization: "Bearer " + localKey, "content-type": "application/json" };
            } else if (provider === "gemini") {
              const model = body.model || "gemini-2.0-flash";
              delete body.model;
              url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${localKey}`;
              headers = { "content-type": "application/json" };
            } else throw new Error("unknown AI provider: " + provider);
          } else if (env.VOLT_AI_TOKEN) {
            // no local key → host gateway (free-capped, then pay-as-you-go)
            url = env.VOLT_AI_GATEWAY || "https://voltjs.com/api/ai";
            headers = { authorization: "Bearer " + env.VOLT_AI_TOKEN, "content-type": "application/json" };
            payload = { messages: body.messages, system: body.system, max_tokens: body.max_tokens, model: body.model };
          } else {
            throw new Error("No AI key in .env and no VOLT_AI_TOKEN — add a provider key, or a gateway token to use the hosted tier.");
          }
          const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
          const text = await r.text();
          res.statusCode = r.status;
          res.setHeader("Content-Type", r.headers.get("content-type") || "application/json");
          res.end(text);
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    // --- AI credits: in-config purchase flow. Proxies the hosted gateway with
    // the app's VOLT_AI_TOKEN — the buy flow lives here in the (shell-gated)
    // config only, never in the running app. ---
    if (req.method === "GET" && p === "/setup/ai-credits") {
      const env = readEnvFile();
      res.setHeader("Content-Type", "application/json");
      if (!env.VOLT_AI_TOKEN) return res.end(JSON.stringify({ ok: false, error: "no VOLT_AI_TOKEN (BYO or unset)" }));
      const base = (env.VOLT_AI_GATEWAY || "https://voltjs.com/api/ai").replace(/\/api\/ai\/?$/, "");
      fetch(base + "/api/credits", { headers: { authorization: "Bearer " + env.VOLT_AI_TOKEN } })
        .then((r) => r.json())
        .then((j) => res.end(JSON.stringify(j)))
        .catch(() => res.end(JSON.stringify({ ok: false, error: "gateway unreachable" })));
      return;
    }
    if (req.method === "POST" && p === "/setup/ai-credits/checkout") {
      let cbody = "";
      req.on("data", (c) => (cbody += c));
      req.on("end", () => {
        const env = readEnvFile();
        res.setHeader("Content-Type", "application/json");
        if (!env.VOLT_AI_TOKEN) return res.end(JSON.stringify({ ok: false, error: "no VOLT_AI_TOKEN" }));
        const base = (env.VOLT_AI_GATEWAY || "https://voltjs.com/api/ai").replace(/\/api\/ai\/?$/, "");
        let amountUsd = 0;
        try {
          amountUsd = Number(JSON.parse(cbody || "{}").amountUsd) || 0;
        } catch {
          /* bad json */
        }
        const baseUrl = env.SITE_URL || `http://localhost:${configPort()}`;
        fetch(base + "/api/credits/checkout", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.VOLT_AI_TOKEN }, body: JSON.stringify({ amountUsd, baseUrl }) })
          .then((r) => r.json())
          .then((j) => res.end(JSON.stringify(j)))
          .catch(() => res.end(JSON.stringify({ ok: false, error: "gateway unreachable" })));
      });
      return;
    }
    // --- active theme's CSS, so the in-config editor renders pages themed ---
    // affirm a domain resolves (existence, not ownership) — for the SITE_URL field
    if (req.method === "GET" && p === "/setup/dns-check") {
      res.setHeader("Content-Type", "application/json");
      const host = String(u.searchParams.get("host") || "").trim().toLowerCase();
      if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return res.end(JSON.stringify({ ok: false, error: "not a domain" }));
      dns.lookup(host, (err, address) => res.end(JSON.stringify(err ? { ok: false, error: err.code || "no DNS record" } : { ok: true, ip: address })));
      return;
    }
    // MIR onboarding — register a sandbox partner (public, no auth). The wizard stores the
    // returned apiKey + challenge token in .env on Apply; the running app then serves the
    // challenge and can record events.
    if (req.method === "POST" && p === "/setup/mir-register") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        res.setHeader("Content-Type", "application/json");
        const done = (o) => res.end(JSON.stringify(o));
        try {
          const { env = {} } = JSON.parse(body || "{}");
          const cfg = { ...readEnvFile(), ...env };
          const base = String(cfg.MIR_BASE_URL || "https://mirregistry.org/v1").replace(/\/+$/, "");
          const email = cfg.MIR_EMAIL || cfg.ADMIN_EMAIL || "";
          if (!email) return done({ ok: false, error: "an email is required to register with MIR" });
          // Stable per-app slug = the domain (MIR is gated on a public SITE_URL). It's the
          // idempotency guard: a redeploy or a re-run resolves to the SAME partner instead of
          // fragmenting the app's customers across new partner rows. (An app is a partner; a
          // deployment is not.) A taken slug → 409 = already registered (the key's in .env).
          const host = String(cfg.SITE_URL || "").replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
          const slug = host.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          const r = await fetch(base + "/partners/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: cfg.SITE_NAME || "My Volt site", acceptTerms: true, website: cfg.SITE_URL || "", email, ...(slug ? { slug } : {}) }) });
          const data = await r.json().catch(() => ({}));
          if (r.status === 409) return done({ ok: false, error: "already registered for this domain — your MIR_API_KEY should already be in .env" });
          if (!r.ok) return done({ ok: false, error: data.error || data.message || "MIR HTTP " + r.status });
          done({ ok: true, partnerId: data.partnerId, apiKey: data.apiKey, challenge: (data.domainChallenge || {}).token, environment: data.environment, status: data.status });
        } catch (e) {
          done({ ok: false, error: String((e && e.message) || e) });
        }
      });
      return;
    }
    // MIR promote — verify the deployed domain (MIR fetches /.well-known/mir-challenge) and
    // swap the sandbox key for a production key. Auth: the sandbox key.
    if (req.method === "POST" && p === "/setup/mir-promote") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        res.setHeader("Content-Type", "application/json");
        const done = (o) => res.end(JSON.stringify(o));
        try {
          const { env = {} } = JSON.parse(body || "{}");
          const cfg = { ...readEnvFile(), ...env };
          const base = String(cfg.MIR_BASE_URL || "https://mirregistry.org/v1").replace(/\/+$/, "");
          const key = cfg.MIR_API_KEY || "";
          const url = cfg.SITE_URL || "";
          if (!key) return done({ ok: false, error: "register first — no sandbox key yet" });
          if (!url) return done({ ok: false, error: "set a public SITE_URL first" });
          const r = await fetch(base + "/partners/promote", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key }, body: JSON.stringify({ url }) });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) return done({ ok: false, error: data.error || data.message || "MIR HTTP " + r.status });
          done({ ok: true, apiKey: data.apiKey, environment: data.environment, status: data.status, domain: data.domain, alreadyVerified: data.alreadyVerified });
        } catch (e) {
          done({ ok: false, error: String((e && e.message) || e) });
        }
      });
      return;
    }
    // download chosen fonts' woff2 (self-hosted, from fontsource/jsDelivr) into public/fonts/
    if (req.method === "POST" && p === "/setup/fonts") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        res.setHeader("Content-Type", "application/json");
        const done = (o) => res.end(JSON.stringify(o));
        try {
          const { slugs = [] } = JSON.parse(body || "{}");
          const weights = [400, 700];
          const fontsDir = path.join(__dirname, "public", "fonts");
          const downloaded = [];
          for (const slug of slugs) {
            if (!/^[a-z0-9-]+$/.test(String(slug))) continue; // guard the URL/path
            const dir = path.join(fontsDir, slug);
            fs.mkdirSync(dir, { recursive: true });
            for (const w of weights) {
              const file = path.join(dir, w + ".woff2");
              if (fs.existsSync(file)) continue; // already have it
              const r = await fetch(`https://cdn.jsdelivr.net/fontsource/fonts/${slug}@latest/latin-${w}-normal.woff2`);
              if (!r.ok) continue; // weight unavailable — skip (font-display:swap falls back)
              fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
            }
            downloaded.push(slug);
          }
          done({ ok: true, downloaded });
        } catch (e) {
          done({ ok: false, error: String((e && e.message) || e) });
        }
      });
      return;
    }
    if (req.method === "GET" && p === "/setup/schemes") {
      res.setHeader("Content-Type", "application/json");
      (async () => {
        try {
          const { SCHEMES } = await imp(path.join(".volt", "addons", "pages", "files", "lib", "pages.js"));
          res.end(JSON.stringify({ schemes: (SCHEMES || []).map((s) => ({ id: s.id, label: s.label, brand: s.light.brand, bg: s.light.bg })) }));
        } catch {
          res.end(JSON.stringify({ schemes: [] }));
        }
      })();
      return;
    }
    if (req.method === "GET" && p === "/setup/theme-css") {
      res.setHeader("Content-Type", "text/css; charset=utf-8");
      (async () => {
        const theme = (readEnvFile().THEME || "").trim();
        const load = async (rel) => {
          try {
            return (await imp(rel)).css || "";
          } catch {
            return null;
          }
        };
        let css = null;
        if (theme) css = await load(path.join(".volt", "themes", theme, "index.js"));
        if (css == null && fs.existsSync(path.join(__dirname, "pages", "_theme.js"))) css = await load(path.join("pages", "_theme.js"));
        if (css == null && theme) {
          try {
            css = (await import(`volt-theme-${theme}`)).css || "";
          } catch {
            css = null;
          }
        }
        res.end(css || "");
      })();
      return;
    }
    // --- media library: list / upload / delete files in public/media (served at
    // /media/<name>). Shell-gated (config only). ---
    if (req.method === "GET" && p === "/setup/media") {
      res.setHeader("Content-Type", "application/json");
      const dir = path.join(__dirname, "public", "media");
      let items = [];
      try {
        items = fs
          .readdirSync(dir)
          .filter((f) => !f.startsWith("."))
          .map((f) => ({ name: f, url: "/media/" + f, size: fs.statSync(path.join(dir, f)).size }))
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch {
        /* no media dir yet */
      }
      return res.end(JSON.stringify({ items }));
    }
    if (req.method === "POST" && p === "/setup/media/upload") {
      res.setHeader("Content-Type", "application/json");
      const name = (u.searchParams.get("name") || "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 120);
      if (!name || !/\.[A-Za-z0-9]+$/.test(name)) return res.end(JSON.stringify({ ok: false, error: "bad filename" }));
      const dir = path.join(__dirname, "public", "media");
      fs.mkdirSync(dir, { recursive: true });
      const chunks = [];
      let size = 0;
      let tooBig = false;
      req.on("data", (c) => {
        if (tooBig) return;
        size += c.length;
        if (size > 100 * 1024 * 1024) tooBig = true;
        else chunks.push(c);
      });
      req.on("end", () => {
        if (tooBig) {
          res.statusCode = 413;
          return res.end(JSON.stringify({ ok: false, error: "file too large (max 100MB)" }));
        }
        try {
          fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks));
          res.end(JSON.stringify({ ok: true, url: "/media/" + name, name }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }
    if (req.method === "POST" && p === "/setup/media/delete") {
      let mbody = "";
      req.on("data", (c) => (mbody += c));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        try {
          const { name } = JSON.parse(mbody || "{}");
          if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name || "")) throw new Error("bad name");
          const f = path.join(__dirname, "public", "media", name);
          if (fs.existsSync(f)) fs.unlinkSync(f);
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }
    // --- content manager: list / read / write / delete pages + posts ---
    if (req.method === "GET" && p === "/setup/content") {
      const list = (type) => {
        const dir = path.join(__dirname, type === "post" ? "posts" : "pages");
        if (!fs.existsSync(dir)) return [];
        return fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
          .map((f) => {
            const slug = f.replace(/\.md$/, "");
            const title = (fs.readFileSync(path.join(dir, f), "utf8").match(/^title:\s*(.+)$/m) || [])[1];
            return { type, slug, title: (title || slug).trim() };
          });
      };
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ pages: list("page"), posts: list("post") }));
    }
    if (req.method === "GET" && p === "/setup/content/raw") {
      const type = u.searchParams.get("type") === "post" ? "posts" : "pages";
      const slug = u.searchParams.get("slug") || "";
      res.setHeader("Content-Type", "application/json");
      if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return res.end(JSON.stringify({ ok: false, error: "invalid slug" }));
      const file = path.join(__dirname, type, slug + ".md");
      return res.end(JSON.stringify({ ok: true, body: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "" }));
    }
    if (req.method === "POST" && (p === "/setup/content/save" || p === "/setup/content/delete")) {
      let cbody = "";
      req.on("data", (c) => (cbody += c));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        try {
          const { type, slug, body } = JSON.parse(cbody || "{}");
          if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug || "")) throw new Error("slug: lowercase letters, numbers, hyphens");
          const dir = path.join(__dirname, type === "post" ? "posts" : "pages");
          const file = path.join(dir, slug + ".md");
          if (p === "/setup/content/delete") {
            if (fs.existsSync(file)) fs.unlinkSync(file);
            return res.end(JSON.stringify({ ok: true }));
          }
          fs.mkdirSync(dir, { recursive: true });
          // RTEPro's media picker inlines "Choose File" uploads as base64 data URLs.
          // Extract them to public/media/<hash>.<ext> and rewrite the src, so pages
          // stay lean and the uploads land in the media library.
          const mediaDir = path.join(__dirname, "public", "media");
          const extFor = (mime) =>
            ({ "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg", "video/mp4": "mp4", "video/webm": "webm", "video/ogg": "ogv", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav" }[mime.toLowerCase()] || (mime.split("/")[1] || "bin").replace(/[^a-z0-9]+/gi, "").slice(0, 8) || "bin");
          const finalBody = String(body ?? "").replace(/(<(?:img|video|audio|source)\b[^>]*?\ssrc=")data:([\w.+-]+\/[\w.+-]+);base64,([^"]+)(")/gi, (m, pre, mime, b64, post) => {
            try {
              const buf = Buffer.from(b64, "base64");
              const name = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16) + "." + extFor(mime);
              fs.mkdirSync(mediaDir, { recursive: true });
              const dest = path.join(mediaDir, name);
              if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
              return pre + "/media/" + name + post;
            } catch {
              return m;
            }
          });
          fs.writeFileSync(file, finalBody);
          res.end(JSON.stringify({ ok: true, file: (type === "post" ? "posts/" : "pages/") + slug + ".md" }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }
    // "Customize": copy a bundled theme into pages/_theme.js so it can be edited.
    if (req.method === "POST" && p === "/setup/eject-theme") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        try {
          const { theme } = JSON.parse(body || "{}");
          const src = path.join(THEMES_DIR, String(theme || ""), "index.js");
          if (!theme || !/^[a-z0-9-]+$/i.test(theme) || !fs.existsSync(src)) return res.end(JSON.stringify({ ok: false, error: "unknown theme" }));
          const dest = path.join(__dirname, "pages", "_theme.js");
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(src, dest);
          res.end(JSON.stringify({ ok: true, path: "pages/_theme.js" }));
        } catch (e) {
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }
    if (req.method === "POST" && p === "/setup/test-db") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        const keys = ["DB_DRIVER", "MONGODB_URI", "MONGODB_DATABASE", "DATABASE_URL"];
        const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
        try {
          const { env = {} } = JSON.parse(body);
          for (const k of keys) {
            if (env[k]) process.env[k] = env[k];
            else delete process.env[k];
          }
          ensureDriverInstalled(process.env.DB_DRIVER); // install the driver first, so the test can connect
          const store = await (await addonMod("db")).createStore();
          await store.collection("__voltcheck").all();
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, driver: store.name }));
        } catch (e) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: e.message }));
        } finally {
          for (const k of keys) {
            if (saved[k] == null) delete process.env[k];
            else process.env[k] = saved[k];
          }
        }
      });
      return;
    }
    // verify SMTP creds (form values merged over the saved .env) — auth check via
    // nodemailer if available, else a TCP reachability check.
    if (req.method === "POST" && p === "/setup/test-smtp") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        res.setHeader("Content-Type", "application/json");
        const done = (o) => res.end(JSON.stringify(o));
        try {
          const { env = {} } = JSON.parse(body || "{}");
          const cfg = { ...readEnvFile(), ...env };
          const url = cfg.SMTP_URL;
          const host = cfg.SMTP_HOST;
          if (!url && !host) return done({ ok: false, error: "no SMTP config (set SMTP_URL or SMTP_HOST)" });
          let nodemailer;
          try {
            nodemailer = (await import("nodemailer")).default;
          } catch {
            /* not installed */
          }
          if (nodemailer) {
            const transport = url
              ? nodemailer.createTransport(url)
              : nodemailer.createTransport({ host, port: Number(cfg.SMTP_PORT) || 587, secure: /^(1|true|yes|on)$/i.test(cfg.SMTP_SECURE || "") || Number(cfg.SMTP_PORT) === 465, auth: cfg.SMTP_USER ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS } : undefined });
            await transport.verify();
            return done({ ok: true, detail: "connection + auth OK" });
          }
          const net = await import("node:net");
          let h = host;
          let prt = Number(cfg.SMTP_PORT) || 587;
          if (url) {
            const u = new URL(url.replace(/^smtps?:\/\//, "http://"));
            h = u.hostname;
            prt = Number(u.port) || (url.startsWith("smtps") ? 465 : 587);
          }
          await new Promise((resolve, reject) => {
            const s = net.connect(prt, h, () => {
              s.end();
              resolve();
            });
            s.setTimeout(5000, () => {
              s.destroy();
              reject(new Error("timeout"));
            });
            s.on("error", reject);
          });
          done({ ok: true, detail: `${h}:${prt} reachable — enable the mailer add-on for a full auth test` });
        } catch (e) {
          done({ ok: false, error: e.message });
        }
      });
      return;
    }
    // verify the AI provider key (or gateway token) with a 1-token live call.
    if (req.method === "POST" && p === "/setup/test-ai") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        res.setHeader("Content-Type", "application/json");
        const done = (o) => res.end(JSON.stringify(o));
        try {
          const { env = {} } = JSON.parse(body || "{}");
          const cfg = { ...readEnvFile(), ...env };
          const provider = cfg.AI_PROVIDER || "anthropic";
          const key = { anthropic: cfg.ANTHROPIC_API_KEY, openai: cfg.OPENAI_API_KEY, gemini: cfg.GEMINI_API_KEY }[provider];
          let url, headers, payload, label;
          if (key) {
            label = provider + " key";
            if (provider === "anthropic") {
              url = "https://api.anthropic.com/v1/messages";
              headers = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
              payload = { model: cfg.AI_MODEL || "claude-haiku-4-5", max_tokens: 1, messages: [{ role: "user", content: "hi" }] };
            } else if (provider === "openai") {
              url = "https://api.openai.com/v1/chat/completions";
              headers = { authorization: "Bearer " + key, "content-type": "application/json" };
              payload = { model: cfg.AI_MODEL || "gpt-4o-mini", max_tokens: 1, messages: [{ role: "user", content: "hi" }] };
            } else {
              url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
              headers = { "content-type": "application/json" };
              payload = { contents: [{ parts: [{ text: "hi" }] }] };
            }
          } else if (cfg.VOLT_AI_TOKEN) {
            label = "hosted gateway";
            url = cfg.VOLT_AI_GATEWAY || "https://voltjs.com/api/ai";
            headers = { authorization: "Bearer " + cfg.VOLT_AI_TOKEN, "content-type": "application/json" };
            payload = { model: cfg.AI_MODEL || "claude-haiku-4-5", max_tokens: 1, messages: [{ role: "user", content: "hi" }] };
          } else {
            return done({ ok: false, error: "no AI key or VOLT_AI_TOKEN set" });
          }
          const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
          if (r.ok) return done({ ok: true, detail: `${label} works` });
          done({ ok: false, error: `${r.status}: ${(await r.text()).slice(0, 120)}` });
        } catch (e) {
          done({ ok: false, error: e.message });
        }
      });
      return;
    }
    if (req.method === "POST" && p === "/setup/apply") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const { env } = JSON.parse(body);
          if (typeof env !== "string") throw new Error("missing env");

          // 1) write .env, preserving any custom keys the form doesn't manage
          let finalEnv = env;
          if (fs.existsSync(ENV_PATH)) {
            const managed = new Set([...env.matchAll(/^\s*([A-Za-z0-9_]+)\s*=/gm)].map((m) => m[1]));
            const extra = readEnvFileLines().filter((line) => {
              const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
              return m && !managed.has(m[1]);
            });
            if (extra.length) finalEnv = env.replace(/\n*$/, "\n") + extra.join("\n") + "\n";
          }
          fs.writeFileSync(ENV_PATH, finalEnv);

          // 2) declare any needed packages in package.json
          const added = neededPackages(env);
          if (added.length) {
            const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
            pkg.dependencies = pkg.dependencies || {};
            for (const name of added) pkg.dependencies[name] = PKG_VERSIONS[name] || "latest";
            fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n");
          }

          const envPort = Number((env.match(/^\s*PORT\s*=\s*(\d+)/m) || [])[1]);
          const newPort = process.env.PORT ? Number(process.env.PORT) : envPort || DEFAULT_PORT;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, port: newPort, installing: added }));

          // 3) install (if needed), then hand off to the app
          res.on("finish", () => {
            const handoff = () => {
              server.close(() => {
                loadEnv();
                startApp();
              });
              server.closeIdleConnections?.();
            };
            if (added.length) {
              console.log(`[volt] installing ${added.join(", ")}…`);
              const npm = spawn("npm", ["install"], { cwd: __dirname, stdio: "inherit", shell: process.platform === "win32" });
              npm.on("error", () => handoff());
              npm.on("close", () => {
                console.log("[volt] saved .env — starting the app…");
                handoff();
              });
            } else {
              console.log("[volt] saved .env — starting the app…");
              handoff();
            }
          });
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  server.on("error", (e) => { if (e.code === "EADDRINUSE") { console.error(`\n[volt] Config UI port ${PORT} is in use (is the app already running?). Set CONFIG_PORT in .env or pass --port <n>.\n`); process.exit(1); } throw e; });
  server.listen(PORT, "127.0.0.1", () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\nVolt setup at ${url}`);
    console.log("  Configure your app; it starts automatically on Apply. (reopen later: npm run dev -- --edit)");
    const ssh = process.env.SSH_CONNECTION;
    if (ssh) {
      const host = ssh.split(" ")[2];
      const user = process.env.USER || process.env.USERNAME || "you";
      console.log("  Remote box — the server is up here; bridge it from your LOCAL machine:");
      console.log(`    ssh -N -L 127.0.0.1:${PORT}:localhost:${PORT} ${user}@${host}`);
      console.log(`  …then open ${url} on your machine (the tunnel points it here).`);
    }
    console.log("");
    if (openBrowser(url)) console.log("  (opening your browser…)\n");
  });
}

function readEnvFileLines() {
  return fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8").split("\n") : [];
}

// --- Studio: an ephemeral, localhost-only data browser (— la Prisma Studio).
// Not a route in the running app — it only exists while you run `--studio`, on
// loopback, and disappears on Ctrl-C. Shell/SSH access is the auth. ---
const HIDDEN_COLLECTIONS = new Set(["auth_tokens", "auth_sessions", "__voltcheck"]);
async function startStudio() {
  loadEnv();
  if (!enabledFrom(process.env).has("db")) {
    console.error("Studio needs the db add-on. Enable it: npm run dev -- --edit");
    process.exit(1);
  }
  let store;
  try {
    store = await (await addonMod("db")).createStore();
  } catch (e) {
    console.error("Studio: couldn't connect the store — " + e.message);
    process.exit(1);
  }
  const PORT = configPort();
  const visible = (n) => n && !HIDDEN_COLLECTIONS.has(n);
  const assets = {
    "/volt.js": ["text/javascript; charset=utf-8", fs.readFileSync(path.join(__dirname, "public", "volt.js"))],
    "/logo.webp": ["image/webp", fs.readFileSync(path.join(__dirname, "public", "logo.webp"))],
    "/favicon.webp": ["image/webp", fs.readFileSync(path.join(__dirname, "public", "favicon.webp"))],
    "/db-admin-ui.js": ["text/javascript; charset=utf-8", fs.readFileSync(path.join(ADDONS_DIR, "db", "files", "public", "db-admin-ui.js"))],
  };
  const studioHtml = fs.readFileSync(path.join(__dirname, "setup", "studio.html"));
  const json = (res, code, obj) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
  };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://localhost");
    const p = u.pathname;
    try {
      if (req.method === "GET" && p === "/") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.end(studioHtml);
      }
      if (req.method === "GET" && assets[p]) {
        res.setHeader("Content-Type", assets[p][0]);
        return res.end(assets[p][1]);
      }
      if (req.method === "GET" && p === "/admin/db/collections") {
        const all = (await store.collections()) || [];
        return json(res, 200, { driver: store.name, collections: all.filter(visible) });
      }
      if (req.method === "GET" && p === "/admin/db/collection") {
        const name = u.searchParams.get("name") || "";
        if (!visible(name)) return json(res, 403, { ok: false, error: "hidden" });
        const docs = (await store.collection(name).all()).slice(0, 500);
        return json(res, 200, { ok: true, name, docs });
      }
      if (req.method === "DELETE" && p === "/admin/db/doc") {
        const name = u.searchParams.get("name") || "";
        const id = u.searchParams.get("id") || "";
        if (!visible(name)) return json(res, 403, { ok: false, error: "hidden" });
        if (!id) return json(res, 400, { ok: false, error: "missing id" });
        await store.collection(name).delete(id);
        return json(res, 200, { ok: true });
      }
      res.statusCode = 404;
      res.end("not found");
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
    }
  });

  server.on("error", (e) => { if (e.code === "EADDRINUSE") { console.error(`\n[volt] Config UI port ${PORT} is in use (is the app already running?). Set CONFIG_PORT in .env or pass --port <n>.\n`); process.exit(1); } throw e; });
  server.listen(PORT, "127.0.0.1", () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\nVolt Studio at ${url}   (${store.name})`);
    console.log("  Browse your data. localhost-only, disposable — Ctrl-C when done.");
    const ssh = process.env.SSH_CONNECTION;
    if (ssh) {
      const host = ssh.split(" ")[2];
      const user = process.env.USER || process.env.USERNAME || "you";
      console.log("  Remote box — from your LOCAL machine:");
      console.log(`    ssh -N -L 127.0.0.1:${PORT}:localhost:${PORT} ${user}@${host}`);
      console.log(`  …then open ${url}.`);
    }
    console.log("");
    openBrowser(url);
  });
}

// --- `--logs`: a disposable, localhost-only log viewer (its own port, like
// --studio). Tails pm2 stdout/stderr; with mir-sentinel installed, an Analytics
// tab parses Apache/nginx access logs (ACCESS_LOG). Shell access is the auth;
// for a remote box, SSH-tunnel the port. ---
async function startLogs() {
  loadEnv();
  const PORT = configPort();
  const name = (() => {
    try {
      return JSON.parse(fs.readFileSync(PKG_PATH, "utf8")).name || "app";
    } catch {
      return "app";
    }
  })();
  const logsDir = path.join(os.homedir(), ".pm2", "logs");
  // Sources: pm2 stdout/stderr work out of the box; ACCESS_LOG adds an Apache/nginx
  // log; users add more (other apps/servers/mounted or tunneled paths) via
  // .volt/logs.json, editable here in the viewer. Re-read per request so additions
  // show live. For a remote box, ship its log here or SSH-tunnel + run --logs there.
  const LOGS_JSON = path.join(__dirname, ".volt", "logs.json");
  const readExtra = () => {
    try {
      const a = JSON.parse(fs.readFileSync(LOGS_JSON, "utf8"));
      return Array.isArray(a) ? a.filter((x) => x && x.label && x.file) : [];
    } catch {
      return [];
    }
  };
  const sources = () => {
    const s = { app: path.join(logsDir, `${name}-out.log`), error: path.join(logsDir, `${name}-error.log`) };
    if (process.env.ACCESS_LOG) s.access = process.env.ACCESS_LOG;
    for (const x of readExtra()) s[x.label] = x.file;
    return s;
  };
  const tail = (f, n) => (f && fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).slice(-n) : []);
  let parseLine = null;
  try {
    parseLine = (await import("mir-sentinel")).parseLine;
  } catch {
    /* analytics optional */
  }
  const top = (arr, key) => {
    const m = {};
    for (const x of arr) if (x && x[key]) m[x[key]] = (m[x[key]] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
  };
  const assets = {
    "/": ["text/html; charset=utf-8", fs.readFileSync(path.join(__dirname, "setup", "logs.html"))],
    "/logs.js": ["text/javascript; charset=utf-8", fs.readFileSync(path.join(__dirname, "setup", "logs.js"))],
  };
  const json = (res, o) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(o));
  };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    const p = u.pathname;
    if (assets[p]) {
      res.setHeader("Content-Type", assets[p][0]);
      return res.end(assets[p][1]);
    }
    if (p === "/api/sources") return json(res, { sources: Object.keys(sources()), extra: readExtra(), analytics: !!parseLine });
    if (p === "/api/tail") {
      const f = sources()[u.searchParams.get("source")];
      return f ? json(res, { ok: true, lines: tail(f, Math.min(2000, Number(u.searchParams.get("lines")) || 300)) }) : json(res, { ok: false });
    }
    if (p === "/api/analytics") {
      if (!parseLine) return json(res, { ok: false, error: "npm i mir-sentinel for analytics" });
      const f = sources()[u.searchParams.get("source")];
      if (!f) return json(res, { ok: false });
      const parsed = tail(f, 5000).map((l) => parseLine(l));
      return json(res, { ok: true, total: parsed.length, paths: top(parsed, "path"), statuses: top(parsed, "status"), ips: top(parsed, "ip"), bots: parsed.filter((x) => x && x.isBot).length, attacks: parsed.filter((x) => x && x.isAttack).length });
    }
    // add/remove a source ("add servers") — written to .volt/logs.json
    if (req.method === "POST" && (p === "/api/source" || p === "/api/source/remove")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const { label, file } = JSON.parse(body || "{}");
          if (!/^[a-z0-9][a-z0-9 _-]*$/i.test(label || "")) throw new Error("label: letters, numbers, spaces, - _");
          let list = readExtra().filter((x) => x.label !== label);
          if (p === "/api/source") list.push({ label, file: String(file || "") });
          fs.mkdirSync(path.dirname(LOGS_JSON), { recursive: true });
          fs.writeFileSync(LOGS_JSON, JSON.stringify(list, null, 2));
          json(res, { ok: true });
        } catch (e) {
          res.statusCode = 400;
          json(res, { ok: false, error: e.message });
        }
      });
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.error(`\n[volt] Logs port ${PORT} is in use — set CONFIG_PORT in .env or pass --port <n>.`);
      process.exit(1);
    }
    throw e;
  });
  server.listen(PORT, "127.0.0.1", () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\nVolt logs at ${url}   (${parseLine ? "analytics on" : "raw tail — npm i mir-sentinel for analytics"})`);
    console.log("  localhost only; for a remote box: ssh -L " + PORT + ":localhost:" + PORT + " you@server");
    openBrowser(url);
  });
}

// --- gate: studio / logs / setup (first run, --edit) / the app ---
const editMode = process.argv.includes("--edit") || process.argv.includes("-e");
// In production / on a PaaS there's no interactive wizard: config comes from the
// platform's env vars (a Dockerfile sets NODE_ENV=production). Only fall back to
// the first-run wizard when nothing is configured and we're not in production.
const configured = fs.existsSync(ENV_PATH) || process.env.VOLT_ADDONS != null || process.env.NODE_ENV === "production";
if (process.argv.includes("--studio")) {
  startStudio();
} else if (process.argv.includes("--logs")) {
  startLogs();
} else if (editMode || !configured) {
  startSetup();
} else {
  loadEnv();
  startApp();
}
