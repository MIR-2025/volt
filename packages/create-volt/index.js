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

${bold("Options")}
  --skip-install   Don't run the package manager install step
  --force          Scaffold into an existing non-empty directory
  -h, --help       Show this help
  -v, --version    Show the create-volt version

${bold("Example")}
  npm create volt@latest my-app
  cd my-app && npm run dev
`;

// --- arg parsing ---
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("-")));
const positionals = argv.filter((a) => !a.startsWith("-"));

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
const templateDir = path.join(__dirname, "template");

// --- target directory checks ---
if (fs.existsSync(targetDir)) {
  const existing = fs.readdirSync(targetDir).filter((f) => f !== ".git");
  if (existing.length && !force) {
    die(`Directory ${green(projectName)} already exists and is not empty.\n  Pass ${cyan("--force")} to scaffold into it anyway.`);
  }
} else {
  fs.mkdirSync(targetDir, { recursive: true });
}

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

const created = [
  "public/volt.js   — the Volt library (no build step)",
  "public/app.js    — your app (Counter + Todos demo)",
  "views/index.html — the HTML shell",
  "server.js        — dev server with hot reload",
];
console.log(green("✔") + " Files created:");
for (const line of created) console.log("  " + dim(line));
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

// --- next steps ---
const runCmd = pm === "npm" ? "npm run dev" : `${pm} dev`;
const installCmd = pm === "yarn" ? "yarn" : `${pm} install`;
console.log(`\n${green("✔")} ${bold("Done!")} Next steps:\n`);
console.log(`  ${cyan("cd")} ${projectName}`);
if (!installed) console.log(`  ${cyan(installCmd)}`);
console.log(`  ${cyan(runCmd)}`);
console.log(`\nThen open ${cyan("http://localhost:26628")} and edit ${bold("public/app.js")}.\n`);
