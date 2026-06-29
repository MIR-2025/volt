#!/usr/bin/env node
// create-volt — scaffold a new Volt app, à la create-react-app.
//
//   npm create volt@latest my-app
//   npx create-volt my-app
//   npm create volt@latest my-app -- --skip-install
//
// Cross-platform: pure node: APIs, path.join everywhere, recursive fs.cpSync,
// and the install step shells out to whichever package manager invoked it.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require("./package.json");

// --- tiny ANSI helpers (no deps; degrade to plain text when not a TTY) ---
const tty = process.stdout.isTTY;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c(1), dim = c(2), cyan = c(36), green = c(32), red = c(31), yellow = c(33);

function die(msg) {
  console.error(`\n${red("✖")} ${msg}\n`);
  process.exit(1);
}

const HELP = `
${bold("⚡ create-volt")} — scaffold a new Volt app

${bold("Usage")}
  npm create volt@latest <project-directory> [options]
  npx create-volt <project-directory> [options]
  npx create-volt@latest update              # refresh public/volt.js in an existing app
  npx create-volt@latest config              # disposable page: add db/auth/realtime/mailer + write .env

${bold("Options")}
  --template <name>  Starter template: default | guestbook  (default: default)
  --port <number>    Dev port for the app (default: derived from today's date)
  --skip-install   Don't run the package manager install step
  --no-git         Don't initialize a git repository
  --start          After scaffolding, run the dev server (opens the setup page)
  --no-open        Don't auto-open the browser on start
  --dry-run        Show what would be created without writing anything
  --force          Scaffold into an existing non-empty directory
  -h, --help       Show this help
  -v, --version    Show the create-volt version

${bold("Example")}
  npm create volt@latest my-app
  cd my-app && npm run dev
`;

// --- arg parsing (supports `--port <n>` and `--port=<n>`) ---
const argv = process.argv.slice(2);
const flags = new Set();
const positionals = [];
let portArg = null;
let templateArg = null;
let hostArg = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--port") portArg = argv[++i];
  else if (a.startsWith("--port=")) portArg = a.slice("--port=".length);
  else if (a === "--template") templateArg = argv[++i];
  else if (a.startsWith("--template=")) templateArg = a.slice("--template=".length);
  else if (a === "--host") hostArg = argv[++i];
  else if (a.startsWith("--host=")) hostArg = a.slice("--host=".length);
  else if (a.startsWith("-")) flags.add(a);
  else positionals.push(a);
}

if (flags.has("-h") || flags.has("--help")) {
  console.log(HELP);
  process.exit(0);
}
if (flags.has("-v") || flags.has("--version")) {
  console.log(pkg.version);
  process.exit(0);
}

const skipInstall = flags.has("--skip-install");
const force = flags.has("--force");
const dryRun = flags.has("--dry-run");
const noGit = flags.has("--no-git");

// The `add` command was replaced by `config` — catch old muscle memory.
if (positionals[0] === "add") {
  die(`${cyan("add")} was replaced by ${cyan("create-volt config")} — run that to add integrations.`);
}

// --- `update` subcommand: refresh public/volt.js in the current app to the
// version bundled with this create-volt (so `npx create-volt@latest update`
// pulls the latest library). Only touches the library file — never the user's
// app.js, server.js, or port. ---
if (positionals[0] === "update") {
  const target = path.join(process.cwd(), "public", "volt.js");
  if (!fs.existsSync(target)) {
    die(`No ${cyan("public/volt.js")} here — run ${cyan("create-volt update")} from inside a Volt app.`);
  }
  const latest = fs.readFileSync(path.join(__dirname, "templates", "default", "public", "volt.js"), "utf8");
  const current = fs.readFileSync(target, "utf8");
  if (current === latest) {
    console.log(`\n${green("✔")} ${bold("public/volt.js")} is already current (create-volt ${pkg.version}).\n`);
    process.exit(0);
  }
  if (dryRun) {
    console.log(`\n${yellow("!")} An update is available for ${bold("public/volt.js")} (create-volt ${pkg.version}).`);
    console.log(`  Re-run without ${cyan("--dry-run")} to apply.\n`);
    process.exit(0);
  }
  fs.writeFileSync(target, latest);
  console.log(`\n${green("✔")} Updated ${bold("public/volt.js")} to the version in create-volt ${pkg.version}.`);
  console.log(`  Review the change with ${cyan("git diff public/volt.js")}.\n`);
  process.exit(0);
}

// --- `config` subcommand: a disposable local page to configure add-ons and
// write a .env. Dependency-free (node:http); the page is built with Volt. ---
if (positionals[0] === "config") {
  const cwd = process.cwd();
  const addonsDir = path.join(__dirname, "addons");
  const addonList = fs
    .readdirSync(addonsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const m = JSON.parse(fs.readFileSync(path.join(addonsDir, e.name, "meta.json"), "utf8"));
      return {
        name: e.name,
        description: m.description,
        install: m.install || [],
        dependsOn: m.dependsOn || [],
        wiring: m.wiring,
        installed: fs.existsSync(path.join(cwd, m.sentinel)),
      };
    });
  const assets = {
    "/config-app.js": ["text/javascript; charset=utf-8", fs.readFileSync(path.join(__dirname, "config", "config-app.js"))],
    "/volt.js": ["text/javascript; charset=utf-8", fs.readFileSync(path.join(__dirname, "templates", "default", "public", "volt.js"))],
  };
  const indexHtml = fs.readFileSync(path.join(__dirname, "config", "index.html"));
  // localhost by default — shell/SSH access is the auth. --host exposes it on the
  // network, and only then do we mint a random key to gate it.
  const host = hostArg || "127.0.0.1";
  const exposed = host !== "127.0.0.1" && host !== "localhost";
  const key = exposed ? crypto.randomBytes(12).toString("hex") : null;

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    const p = u.pathname;
    if (req.method === "GET" && p === "/") {
      if (key && u.searchParams.get("key") !== key) {
        res.statusCode = 403;
        return res.end("Forbidden — open the ?key=… link printed in the terminal.");
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(indexHtml);
    }
    if (req.method === "GET" && assets[p]) {
      res.setHeader("Content-Type", assets[p][0]);
      return res.end(assets[p][1]);
    }
    if (req.method === "GET" && p === "/addons.json") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(addonList));
    }
    if (req.method === "GET" && p === "/current.json") {
      const current = {};
      const envPath = path.join(cwd, ".env");
      if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
          const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
          if (m) current[m[1]] = m[2];
        }
      }
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(current));
    }
    if (req.method === "POST" && p === "/apply") {
      if (key && req.headers["x-config-key"] !== key) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ ok: false, error: "bad or missing key" }));
      }
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const { addons = [], env } = JSON.parse(body);
          const valid = new Set(addonList.map((a) => a.name));
          const depsOf = Object.fromEntries(addonList.map((a) => [a.name, a.dependsOn]));
          // expand selection to include required dependencies (deps before dependents)
          const want = [];
          const seen = new Set();
          const visit = (n) => {
            if (!valid.has(n) || seen.has(n)) return;
            seen.add(n);
            for (const d of depsOf[n] || []) visit(d);
            want.push(n);
          };
          for (const n of addons) visit(n);

          const copied = [];
          const skipped = [];
          for (const n of want) {
            const filesDir = path.join(addonsDir, n, "files");
            for (const f of listTemplateFiles(filesDir)) {
              const dest = path.join(cwd, f);
              if (fs.existsSync(dest)) {
                skipped.push(f);
                continue;
              }
              fs.mkdirSync(path.dirname(dest), { recursive: true });
              fs.copyFileSync(path.join(filesDir, f), dest);
              copied.push(f);
            }
          }
          if (typeof env === "string") {
            // preserve any custom keys already in .env that this form doesn't manage
            const envPath = path.join(cwd, ".env");
            let finalEnv = env;
            if (fs.existsSync(envPath)) {
              const managed = new Set([...env.matchAll(/^\s*([A-Za-z0-9_]+)\s*=/gm)].map((m) => m[1]));
              const extra = fs
                .readFileSync(envPath, "utf8")
                .split("\n")
                .filter((line) => {
                  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
                  return m && !managed.has(m[1]);
                });
              if (extra.length) finalEnv = env.replace(/\n*$/, "\n") + extra.join("\n") + "\n";
            }
            fs.writeFileSync(envPath, finalEnv);
          }
          console.log(`${green("✔")} applied [${want.join(", ")}] — ${copied.length} file(s) copied, .env written`);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, copied, skipped, applied: want }));
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

  const wanted = portArg ? Number(portArg) : 0;
  server.listen(Number.isInteger(wanted) && wanted > 0 ? wanted : 0, host, () => {
    const port = server.address().port;
    const q = key ? `/?key=${key}` : "/";
    console.log(`\n${bold("⚡ create-volt config")} — add-ons for ${dim(cwd)}\n`);
    if (exposed) {
      const lan = [];
      for (const iface of Object.values(os.networkInterfaces())) {
        for (const a of iface || []) if (a.family === "IPv4" && !a.internal) lan.push(a.address);
      }
      console.log("  Open (key-gated, reachable on your network):");
      for (const ip of lan) console.log("    " + cyan(`http://${ip}:${port}${q}`));
      console.log("    " + cyan(`http://localhost:${port}${q}`) + dim("   (this box)"));
    } else {
      const url = `http://localhost:${port}${q}`;
      console.log("  Open: " + cyan(url));
      const ssh = process.env.SSH_CONNECTION; // "clientIP clientPort serverIP serverPort"
      const user = process.env.USER || process.env.USERNAME || "you";
      const sshHost = ssh ? ssh.split(" ")[2] : os.hostname();
      console.log(`  ${dim(ssh ? "Remote box — the server is up here; from your LOCAL machine run:" : "Remote box? from your local machine run:")}`);
      console.log("    " + dim(`ssh -N -L 127.0.0.1:${port}:localhost:${port} ${user}@${sshHost}`));
      console.log(`  ${dim(`…then open ${url} on your machine — shell access is the auth.`)}`);
      console.log(`  ${dim("(LAN access instead: --host 0.0.0.0 — adds a key)")}`);
    }
    console.log(`\n  ${dim("Applies add-ons + writes .env here · Ctrl-C when done (disposable).")}\n`);
  });
  await new Promise(() => {}); // keep the server up; never fall through to scaffolding
}

// Resolve the dev port: --port wins, else derive it from today's date as
// two-digit-year + month (no leading zero) + two-digit-day (house convention),
// so apps scaffolded on different days don't collide on the same port.
function datePort(d) {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1);
  const dd = String(d.getDate()).padStart(2, "0");
  return Number(`${yy}${mm}${dd}`);
}
let port;
if (portArg != null) {
  port = Number(portArg);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    die(`Invalid --port "${portArg}" — use a whole number between 1 and 65535.`);
  }
} else {
  port = datePort(new Date());
  if (port > 65535) {
    die(`The date-derived port (${port}) is above 65535 — pass --port <1-65535>.`);
  }
}

const rawName = positionals[0];
if (!rawName) die(`Please specify a project directory:\n    ${cyan("npm create volt@latest")} ${green("<project-directory>")}`);

// Validate: a single path segment, npm-name-ish, no traversal.
const projectName = rawName.replace(/\/+$/, "");
if (projectName.includes("..") || /[<>:"|?*\x00-\x1f]/.test(projectName)) {
  die(`Invalid project name: ${green(rawName)}`);
}
if (!/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(path.basename(projectName))) {
  die(`"${path.basename(projectName)}" is not a valid npm package name. Use lowercase letters, digits and dashes.`);
}

const targetDir = path.resolve(process.cwd(), projectName);
const appName = path.basename(targetDir);

// Resolve the starter template (default | guestbook | …).
const templatesDir = path.join(__dirname, "templates");
const templateName = templateArg || "default";
const templateDir = path.join(templatesDir, templateName);
if (!fs.existsSync(templateDir) || !fs.statSync(templateDir).isDirectory()) {
  const available = fs
    .readdirSync(templatesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .join(", ");
  die(`Unknown template "${templateName}". Available: ${available}.`);
}

// List every file in the template, relative to its root (for dry-run preview).
function listTemplateFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTemplateFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

// --- target directory checks ---
if (fs.existsSync(targetDir)) {
  const existing = fs.readdirSync(targetDir).filter((f) => f !== ".git");
  if (existing.length && !force) {
    die(`Directory ${green(projectName)} already exists and is not empty.\n  Pass ${cyan("--force")} to scaffold into it anyway.`);
  }
}

// --- dry run: print the plan and exit without writing anything ---
if (dryRun) {
  console.log(`\n${bold("⚡ Dry run")} — would create a ${cyan(templateName)} Volt app in ${cyan(targetDir)}\n`);
  console.log("Would write:");
  for (const f of listTemplateFiles(templateDir).sort()) {
    // the shipped "gitignore" is renamed to ".gitignore" on scaffold
    console.log("  " + dim(f === "gitignore" ? ".gitignore" : f));
  }
  console.log("");
  console.log(dim(`Would ${skipInstall ? "skip dependency install" : "install dependencies"}.`));
  console.log(dim(`Would ${noGit ? "skip git init" : "initialize a git repository with an initial commit"}.`));
  console.log(dim(`Would set the dev port to ${port}.`));
  console.log(`\n${green("✔")} Dry run complete — nothing was written.\n`);
  process.exit(0);
}

if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

console.log(`\n${bold("⚡ Creating a new Volt app in")} ${cyan(targetDir)}\n`);

// --- copy the template tree (recursive, cross-platform) ---
fs.cpSync(templateDir, targetDir, { recursive: true });

// npm strips a real ".gitignore" from published packages, so the template ships
// it as "gitignore" — rename it back in the generated project.
const shippedGitignore = path.join(targetDir, "gitignore");
if (fs.existsSync(shippedGitignore)) {
  fs.renameSync(shippedGitignore, path.join(targetDir, ".gitignore"));
}

// --- stamp the project name into package.json ---
const appPkgPath = path.join(targetDir, "package.json");
const appPkg = JSON.parse(fs.readFileSync(appPkgPath, "utf8"));
appPkg.name = appName;
fs.writeFileSync(appPkgPath, JSON.stringify(appPkg, null, 2) + "\n");

// --- stamp the chosen dev port into server.js + README ---
const serverPath = path.join(targetDir, "server.js");
let serverSrc = fs.readFileSync(serverPath, "utf8");
serverSrc = serverSrc.replace(/(const DEFAULT_PORT\s*=\s*)\d+/, `$1${port}`); // default template
serverSrc = serverSrc.replace(/(Number\(process\.env\.PORT\)\s*\|\|\s*)\d+/, `$1${port}`); // other templates
fs.writeFileSync(serverPath, serverSrc);
const appReadme = path.join(targetDir, "README.md");
if (fs.existsSync(appReadme)) {
  fs.writeFileSync(appReadme, fs.readFileSync(appReadme, "utf8").replace(/localhost:\d+/g, `localhost:${port}`));
}

console.log(green("✔") + ` Created a ${cyan(templateName)} app — files:`);
for (const f of listTemplateFiles(templateDir).sort()) {
  console.log("  " + dim(f === "gitignore" ? ".gitignore" : f));
}
console.log("");

// --- detect the package manager that invoked us (npm / pnpm / yarn / bun) ---
function detectPM() {
  const ua = process.env.npm_config_user_agent || "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  return "npm";
}
const pm = detectPM();

// --- install dependencies (unless skipped) ---
let installed = false;
if (!skipInstall) {
  console.log(`${bold("Installing dependencies with")} ${cyan(pm)}…\n`);
  const res = spawnSync(pm, ["install"], {
    cwd: targetDir,
    stdio: "inherit",
    shell: process.platform === "win32", // .cmd shims need a shell on Windows
  });
  if (res.status === 0) {
    installed = true;
  } else {
    console.log(`\n${yellow("!")} ${pm} install did not complete — you can run it yourself below.`);
  }
}

// --- initialize a git repository (unless skipped or already inside one) ---
if (!noGit) {
  const git = (gitArgs) =>
    spawnSync("git", gitArgs, {
      cwd: targetDir,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
  const gitAvailable = git(["--version"]).status === 0;
  const insideRepo = gitAvailable && git(["rev-parse", "--is-inside-work-tree"]).status === 0;
  if (gitAvailable && !insideRepo) {
    const initOk = git(["init", "-b", "main"]).status === 0 || git(["init"]).status === 0;
    if (initOk) {
      git(["add", "-A"]);
      const committed = git(["commit", "-m", "Initial commit from create-volt"]).status === 0;
      console.log(
        green("✔") +
          (committed
            ? " Initialized a git repository (1 commit)\n"
            : " Initialized a git repository (commit skipped — set git user.name/email)\n"),
      );
    }
  }
}

// --- next steps ---
const runCmd = pm === "npm" ? "npm run dev" : `${pm} dev`;
const installCmd = pm === "yarn" ? "yarn" : `${pm} install`;
console.log(`\n${green("✔")} ${bold("Done!")} Next steps:\n`);
console.log(`  ${cyan("cd")} ${projectName}`);
if (!installed) console.log(`  ${cyan(installCmd)}`);
console.log(`  ${cyan(runCmd)}`);
console.log(`\nFirst run opens a quick ${bold("setup")} page at ${cyan("http://localhost:" + port)}, then your app starts.\n`);

if (flags.has("--start")) {
  if (!installed) {
    console.log(dim(`(--start needs dependencies — run ${installCmd}, then ${runCmd}.)\n`));
  } else {
    console.log(`${bold("Starting…")}\n`);
    spawnSync(pm, ["run", "dev"], {
      cwd: targetDir,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: flags.has("--no-open") ? { ...process.env, VOLT_NO_OPEN: "1" } : process.env,
    });
  }
}
