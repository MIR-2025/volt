// server.js — dev server with a built-in first-run setup wizard.
//
// First run (no .env) or `node server.js --edit` (-e) opens a disposable, local
// config page; click Apply and it writes .env, loads it, and starts the app
// in-process — then the setup page is gone. Normal runs just start the app.
//
// No build step, no env-file flag: .env is auto-loaded below.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { Server as SocketServer } from "socket.io";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, ".env");
const DEFAULT_PORT = 26628; // create-volt stamps this with the project's date-port

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

// Which add-ons are present? (detected by their files, so the wizard only asks
// for settings that actually apply.)
function presentAddons() {
  const has = (f) => fs.existsSync(path.join(__dirname, f));
  return { db: has("lib/store.js"), auth: has("lib/auth.js"), mailer: has("lib/mailer.js"), realtime: has("lib/realtime.js") };
}

// Open the default browser at `url` — but only when there's a desktop to open
// it on. Headless / remote (no DISPLAY) just keeps the printed link. Opt out
// with VOLT_NO_OPEN=1 or --no-open.
function openBrowser(url) {
  if (process.env.VOLT_NO_OPEN || process.argv.includes("--no-open")) return false;
  const plat = process.platform;
  if (plat === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return false;
  const cmd = plat === "darwin" ? "open" : plat === "win32" ? "cmd" : "xdg-open";
  const args = plat === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {}); // launcher missing (e.g. no xdg-open) emits async — don't crash
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// --- the actual app ---
function startApp() {
  const PORT = Number(process.env.PORT) || DEFAULT_PORT;
  const app = express();
  app.use(express.static(path.join(__dirname, "public")));
  app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "views", "index.html")));

  const server = http.createServer(app);
  const io = new SocketServer(server);

  // hot reload: watch views/ + public/, debounce, broadcast a reload
  let timer = null;
  const onChange = (file) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`[volt] change: ${file ?? "?"} → reload`);
      io.emit("volt:reload");
    }, 80);
  };
  const watchRecursive = (dir) => {
    try {
      fs.watch(dir, { recursive: true }, (_e, f) => onChange(f));
      return;
    } catch {
      /* fall back to per-directory watchers */
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
  for (const d of ["views", "public"]) watchRecursive(path.join(__dirname, d));

  server.listen(PORT, () => console.log(`⚡ Volt → http://localhost:${PORT}`));
}

// --- the disposable setup wizard (localhost only) ---
function startSetup() {
  const PORT = Number(process.env.PORT) || DEFAULT_PORT;
  const assets = {
    "/setup.js": ["text/javascript; charset=utf-8", fs.readFileSync(path.join(__dirname, "setup", "setup.js"))],
    "/volt.js": ["text/javascript; charset=utf-8", fs.readFileSync(path.join(__dirname, "public", "volt.js"))],
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
      return res.end(JSON.stringify({ present: presentAddons(), current: readEnvFile(), defaultPort: DEFAULT_PORT }));
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
          const { createStore } = await import(pathToFileURL(path.join(__dirname, "lib", "store.js")).href);
          const store = await createStore();
          await store.collection("__voltcheck").all(); // actually touch the connection
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
          fs.writeFileSync(ENV_PATH, env);
          // The app binds process.env.PORT if it's already set (loadEnv won't
          // override it), else the .env PORT, else the default — redirect there.
          const envPort = Number((env.match(/^\s*PORT\s*=\s*(\d+)/m) || [])[1]);
          const newPort = process.env.PORT ? Number(process.env.PORT) : envPort || DEFAULT_PORT;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, port: newPort }));
          console.log("[volt] saved .env — starting the app…");
          res.on("finish", () => {
            server.close(() => {
              loadEnv();
              startApp();
            });
            server.closeIdleConnections?.(); // drop the keep-alive socket so close() fires now
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

  // localhost-only: an unauthenticated write endpoint shouldn't be on the network
  server.listen(PORT, "127.0.0.1", () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n⚡ Volt setup → ${url}`);
    console.log("  Configure your app; it starts automatically on Apply. (reopen later: npm run dev -- --edit)");
    const ssh = process.env.SSH_CONNECTION; // "clientIP clientPort serverIP serverPort"
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

// --- gate: setup on first run / --edit, otherwise the app ---
const editMode = process.argv.includes("--edit") || process.argv.includes("-e");
if (editMode || !fs.existsSync(ENV_PATH)) {
  startSetup();
} else {
  loadEnv();
  startApp();
}
