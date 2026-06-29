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
  npx create-volt@latest config              # open the app's setup wizard (edit add-ons + settings)
  npx create-volt@latest studio              # browse your data — ephemeral, localhost (like Prisma Studio)

${bold("Options")}
  --template <name>  Template: default | starter | guestbook  (default: default)
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
let outArg = null;
let userArg = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--port") portArg = argv[++i];
  else if (a.startsWith("--port=")) portArg = a.slice("--port=".length);
  else if (a === "--template") templateArg = argv[++i];
  else if (a.startsWith("--template=")) templateArg = a.slice("--template=".length);
  else if (a === "--out") outArg = argv[++i];
  else if (a.startsWith("--out=")) outArg = a.slice("--out=".length);
  else if (a === "--user") userArg = argv[++i];
  else if (a.startsWith("--user=")) userArg = a.slice("--user=".length);
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

// --- `config` subcommand: open the app's setup wizard to edit add-ons/settings.
// One implementation — delegates to the in-app wizard via `server.js --edit`. ---
if (positionals[0] === "config") {
  const cwd = process.cwd();
  if (!fs.existsSync(path.join(cwd, "server.js"))) {
    die(`No ${cyan("server.js")} here — run ${cyan("create-volt config")} from inside a Volt app.`);
  }
  if (portArg) process.env.PORT = String(Number(portArg) || "");
  const res = spawnSync(process.execPath, ["server.js", "--edit"], {
    cwd,
    stdio: "inherit",
    env: flags.has("--no-open") ? { ...process.env, VOLT_NO_OPEN: "1" } : process.env,
  });
  process.exit(res.status ?? 0);
}

// Write imported markdown pages to disk and print a summary (shared by both importers).
function emitImported(imported, stats, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  let written = 0;
  let skippedExisting = 0;
  for (const d of imported) {
    const dest = path.join(outDir, d.filename);
    if (fs.existsSync(dest) && !flags.has("--force")) {
      skippedExisting++;
      continue;
    }
    fs.writeFileSync(dest, d.markdown);
    written++;
    console.log("  " + dim(path.relative(process.cwd(), dest)));
  }
  const types = Object.entries(stats.byType).map(([t, n]) => `${n} ${t}`).join(", ");
  console.log(`\n${cyan(`✓ Imported ${written}`)} page(s) → ${outDir}`);
  console.log(dim(`  source: ${stats.total} items (${types}); skipped ${stats.draftsSkipped} draft(s), ${stats.otherTypeSkipped} non-page/post item(s)${skippedExisting ? `, ${skippedExisting} already-present (use --force)` : ""}.`));
  console.log(dim("  Enable the pages add-on to serve them: npm run dev -- --edit"));
}

// --- `import-wxr` subcommand: import an offline WordPress export (WXR file) ---
if (positionals[0] === "import-wxr") {
  const xmlPath = positionals[1];
  if (!xmlPath) die(`Usage: ${cyan("create-volt import-wxr <export.xml>")} [--out pages] [--drafts] [--force]`);
  if (!fs.existsSync(xmlPath)) die(`No such file: ${cyan(xmlPath)}`);
  const { runImport } = await import("./lib/import-wxr.js");
  const { imported, stats } = runImport(fs.readFileSync(xmlPath, "utf8"), { drafts: flags.has("--drafts") });
  emitImported(imported, stats, path.resolve(outArg || "pages"));
  process.exit(0);
}

// --- `import-wp` subcommand: pull a live WordPress site over the REST API ---
if (positionals[0] === "import-wp") {
  const site = positionals[1];
  if (!site || !/^https?:\/\//i.test(site)) die(`Usage: ${cyan("create-volt import-wp <https://site.com>")} [--out pages] [--drafts] [--user U]\n  Credentials (for drafts/private): set ${cyan("WP_APP_PASSWORD")} (an Application Password) and ${cyan("WP_USER")} or --user.`);
  const user = userArg || process.env.WP_USER;
  const appPassword = process.env.WP_APP_PASSWORD;
  if ((user || appPassword) && !/^https:\/\//i.test(site)) die("Refusing to send credentials over a non-HTTPS URL.");
  const { runImportFromWP } = await import("./lib/import-wxr.js");
  console.log(dim(`Fetching ${site} via the WordPress REST API…${appPassword ? " (authenticated)" : ""}`));
  let result;
  try {
    result = await runImportFromWP(site, { user, appPassword, drafts: flags.has("--drafts") });
  } catch (e) {
    die(`${e.message}\n  If the REST API is disabled, export a WXR file and use ${cyan("create-volt import-wxr <export.xml>")}.`);
  }
  emitImported(result.imported, result.stats, path.resolve(outArg || "pages"));
  process.exit(0);
}

// --- `studio` subcommand: ephemeral, localhost-only data browser (server.js --studio) ---
if (positionals[0] === "studio") {
  const cwd = process.cwd();
  if (!fs.existsSync(path.join(cwd, "server.js"))) {
    die(`No ${cyan("server.js")} here — run ${cyan("create-volt studio")} from inside a Volt app.`);
  }
  if (portArg) process.env.PORT = String(Number(portArg) || "");
  const res = spawnSync(process.execPath, ["server.js", "--studio"], {
    cwd,
    stdio: "inherit",
    env: flags.has("--no-open") ? { ...process.env, VOLT_NO_OPEN: "1" } : process.env,
  });
  process.exit(res.status ?? 0);
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
// some templates ship a default .env as "env" (a real .env is stripped from npm)
const shippedEnv = path.join(targetDir, "env");
if (fs.existsSync(shippedEnv)) {
  fs.renameSync(shippedEnv, path.join(targetDir, ".env"));
}
// ship "dockerignore" → ".dockerignore" (same npm-safety dance)
const shippedDockerignore = path.join(targetDir, "dockerignore");
if (fs.existsSync(shippedDockerignore)) {
  fs.renameSync(shippedDockerignore, path.join(targetDir, ".dockerignore"));
}

// Bundle the add-on sources so the app's setup wizard can enable them later
// (only for templates that ship the wizard, i.e. have a setup/ dir).
if (fs.existsSync(path.join(targetDir, "setup"))) {
  fs.cpSync(path.join(__dirname, "addons"), path.join(targetDir, ".volt", "addons"), { recursive: true });
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
