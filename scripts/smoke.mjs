#!/usr/bin/env node
// smoke.mjs — end-to-end gate: scaffold a real app on the CURRENT pinned deps,
// install, boot it, and hit the key surfaces. Used by CI and by the dependency
// auto-updater so a version bump that breaks a scaffolded app never ships.
//
//   node scripts/smoke.mjs
//
// Exit 0 = the scaffolded app installs, boots, and serves; non-zero otherwise.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(root, "packages", "create-volt", "index.js");
const PORT = 27123;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "volt-smoke-"));
const app = path.join(tmp, "app");
let server;
const cleanup = () => {
  try {
    server?.kill("SIGKILL");
  } catch {}
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
};

function step(msg) {
  process.stdout.write(`• ${msg}\n`);
}

async function get(p) {
  const res = await fetch(`http://127.0.0.1:${PORT}${p}`);
  return res.status;
}

async function main() {
  step(`scaffold → ${app}`);
  execFileSync("node", [CLI, app, "--port", String(PORT), "--skip-install", "--no-git"], { stdio: "inherit" });

  // enable a representative slice: db(memory) + mailer + auth + realtime + pages
  fs.writeFileSync(path.join(app, ".env"), `VOLT_ADDONS=db,mailer,auth,realtime,pages\nDB_DRIVER=memory\nPORT=${PORT}\n`);

  // mirror the wizard: pages needs `marked` in package.json, at the pinned floor
  const serverSrc = fs.readFileSync(path.join(app, "server.js"), "utf8");
  const markedVer = (serverSrc.match(/marked:\s*"([^"]+)"/) || [])[1] || "latest";
  const pkgPath = path.join(app, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.dependencies = { ...pkg.dependencies, marked: markedVer };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  step(`npm install (real — exercises the pinned versions; marked ${markedVer})`);
  execFileSync("npm", ["install"], { cwd: app, stdio: "inherit" });

  step("boot server.js");
  let exited = null;
  server = spawn("node", ["server.js"], { cwd: app, stdio: "inherit", env: { ...process.env, VOLT_NO_OPEN: "1" } });
  server.on("exit", (code) => (exited = code));

  // wait for the port to answer (fail fast if the process dies)
  let up = false;
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    if (exited !== null) throw new Error(`server exited early (code ${exited}) — boot crashed`);
    try {
      await get("/");
      up = true;
      break;
    } catch {}
  }
  if (!up) throw new Error("server never came up");

  const checks = [
    ["/", 200],
    ["/__volt/addons", 200],
    ["/welcome", 200], // pages add-on auto-seed
    ["/api/me", 200], // auth router mounted (returns signed-out state)
  ];
  for (const [p, want] of checks) {
    const got = await get(p);
    step(`GET ${p} → ${got} (want ${want})`);
    if (got !== want) throw new Error(`smoke check failed: ${p} → ${got}, expected ${want}`);
  }

  // add-ons actually enabled?
  const addons = await (await fetch(`http://127.0.0.1:${PORT}/__volt/addons`)).json();
  for (const a of ["db", "mailer", "auth", "realtime", "pages"]) {
    if (!addons.includes(a)) throw new Error(`add-on not wired: ${a}`);
  }
  step(`add-ons wired: ${addons.join(", ")}`);
  console.log("\n✓ smoke passed");
}

main()
  .then(() => {
    cleanup();
    process.exit(0);
  })
  .catch((e) => {
    console.error(`\n✗ smoke FAILED: ${e.message}`);
    cleanup();
    process.exit(1);
  });
