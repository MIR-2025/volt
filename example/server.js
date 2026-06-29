// server.js â dev server with a built-in first-run setup wizard.
//
// First run (no .env) or `node server.js --edit` (-e) opens a disposable, local
// config page: tick add-ons, fill settings, Apply. Apply writes .env (a
// VOLT_ADDONS list + settings) and adds any needed packages to package.json,
// runs npm install, then starts the app â which wires whatever .env enables.
// Add-on code is bundled under .volt/addons; nothing is copied into your code.
//
// No build step, no env-file flag: .env is auto-loaded below.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { Server as SocketServer } from "socket.io";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, ".env");
const PKG_PATH = path.join(__dirname, "package.json");
const ADDONS_DIR = path.join(__dirname, ".volt", "addons"); // bundled add-on sources
const DEFAULT_PORT = 26629; // create-volt stamps this with the project's date-port

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
  return cliPort() || Number(process.env.CONFIG_PORT) || Number(env.CONFIG_PORT) || Number(process.env.PORT) || Number(env.PORT) || DEFAULT_PORT;
}
const PKG_VERSIONS = { mongodb: "^6.21.0", mysql2: "^3.22.5", pg: "^8.22.0", nodemailer: "^6.10.1", marked: "^18.0.5", busboy: "^1.6.0", "@aws-sdk/client-s3": "^3.1075.0" };
const LIB_FILE = { db: "store.js", mailer: "mailer.js", auth: "auth.js", realtime: "realtime.js", pages: "pages.js", posts: "posts.js", media: "media.js" };

// --- tiny .env loader (no dependency); never overrides an existing env var ---
function readEnvFile() {
  const out = {};
  if (!fs.existsSync(ENV_PATH)) return out;
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2];
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
// a third-party add-on â a local .volt/addons/<name>/index.js or an installed
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
    child.on("error", () => {}); // launcher missing â emits async, don't crash
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
  if (enabled.has("db")) store = await (await addonMod("db")).createStore();
  if (enabled.has("mailer")) mailer = await (await addonMod("mailer")).createMailer();
  if (enabled.has("auth") && store && mailer) app.use((await addonMod("auth")).authRouter({ store, mailer }));

  // expose which add-ons are on, and serve each enabled add-on's frontend assets
  app.get("/__volt/addons", (_req, res) => res.json([...enabled]));
  for (const n of enabled) {
    const pub = path.join(ADDONS_DIR, n, "files", "public");
    if (fs.existsSync(pub)) app.use(express.static(pub));
  }

  app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "views", "index.html")));

  // media uploads (POST /api/media, auth-gated; local files served at /media)
  if (enabled.has("media") && store) {
    const requireAuth = (await addonMod("auth")).requireAuth(store);
    app.use(await (await addonMod("media")).mediaRouter({ requireAuth, dir: path.join(__dirname, "media") }));
  }

  // markdown pages (/<slug> â pages/<slug>.md) â mounted last, so app routes win
  // blog posts (/blog, /blog/<slug>, /category, /tag, /feed.xml) — before pages so /blog wins; renders in the same theme.
  if (enabled.has("posts")) app.use(await (await addonMod("posts")).postsRouter({ dir: path.join(__dirname, "posts"), themeDir: path.join(__dirname, "pages") }));
  if (enabled.has("pages")) app.use(await (await addonMod("pages")).pagesRouter({ dir: path.join(__dirname, "pages") }));

  const server = http.createServer(app);
  const io = new SocketServer(server);
  if (enabled.has("realtime") && store) (await addonMod("realtime")).attachRealtime(io, { store });

  // third-party add-ons â register(ctx). When auth is on, requireAuth/sessionFromReq
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
      console.warn(`[volt] add-on "${name}" not found or missing a register() export â skipped`);
    }
  }

  let timer = null;
  const onChange = (file) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`[volt] change: ${file ?? "?"} â reload`);
      io.emit("volt:reload");
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
  server.listen(PORT, () => console.log(`â¡ Volt â http://localhost:${PORT}${on.length ? "  (add-ons: " + on.join(", ") + ")" : ""}`));
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
  console.log(`[volt] installing ${pkg} for the connection testâ¦`);
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
    if (req.method === "GET" && p === "/setup/state") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ available: availableAddons(), current: readEnvFile(), defaultPort: DEFAULT_PORT }));
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
              console.log(`[volt] installing ${added.join(", ")}â¦`);
              const npm = spawn("npm", ["install"], { cwd: __dirname, stdio: "inherit", shell: process.platform === "win32" });
              npm.on("error", () => handoff());
              npm.on("close", () => {
                console.log("[volt] saved .env â starting the appâ¦");
                handoff();
              });
            } else {
              console.log("[volt] saved .env â starting the appâ¦");
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
    console.log(`\nâ¡ Volt setup â ${url}`);
    console.log("  Configure your app; it starts automatically on Apply. (reopen later: npm run dev -- --edit)");
    const ssh = process.env.SSH_CONNECTION;
    if (ssh) {
      const host = ssh.split(" ")[2];
      const user = process.env.USER || process.env.USERNAME || "you";
      console.log("  Remote box â the server is up here; bridge it from your LOCAL machine:");
      console.log(`    ssh -N -L 127.0.0.1:${PORT}:localhost:${PORT} ${user}@${host}`);
      console.log(`  â¦then open ${url} on your machine (the tunnel points it here).`);
    }
    console.log("");
    if (openBrowser(url)) console.log("  (opening your browserâ¦)\n");
  });
}

function readEnvFileLines() {
  return fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8").split("\n") : [];
}

// --- Studio: an ephemeral, localhost-only data browser (Ã  la Prisma Studio).
// Not a route in the running app â it only exists while you run `--studio`, on
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
    console.error("Studio: couldn't connect the store â " + e.message);
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
    console.log(`\nâ¡ Volt Studio â ${url}   (${store.name})`);
    console.log("  Browse your data. localhost-only, disposable â Ctrl-C when done.");
    const ssh = process.env.SSH_CONNECTION;
    if (ssh) {
      const host = ssh.split(" ")[2];
      const user = process.env.USER || process.env.USERNAME || "you";
      console.log("  Remote box â from your LOCAL machine:");
      console.log(`    ssh -N -L 127.0.0.1:${PORT}:localhost:${PORT} ${user}@${host}`);
      console.log(`  â¦then open ${url}.`);
    }
    console.log("");
    openBrowser(url);
  });
}

// --- gate: studio / setup (first run, --edit) / the app ---
const editMode = process.argv.includes("--edit") || process.argv.includes("-e");
// In production / on a PaaS there's no interactive wizard: config comes from the
// platform's env vars (a Dockerfile sets NODE_ENV=production). Only fall back to
// the first-run wizard when nothing is configured and we're not in production.
const configured = fs.existsSync(ENV_PATH) || process.env.VOLT_ADDONS != null || process.env.NODE_ENV === "production";
if (process.argv.includes("--studio")) {
  startStudio();
} else if (editMode || !configured) {
  startSetup();
} else {
  loadEnv();
  startApp();
}
