// worker.js — the build/publish orchestrator. Two modes:
//
//   volt-publish <projectDir> --site <id> --out <SITES_ROOT>
//       boots the Volt project (node server.js on an ephemeral port), crawls it,
//       writes the static tree, shuts the site back down.
//
//   volt-publish --url http://127.0.0.1:PORT --site <id> --out <SITES_ROOT>
//       crawls an already-running instance (used in CI / tests / when it's up).
//
// Images are pushed to volt-image-host when IMAGE_HOST_URL + IMAGE_HOST_TOKEN are
// set; otherwise they're written into the static bundle. Core Volt is untouched.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { crawl } from "./lib/crawl.js";
import { publishStatic } from "./lib/publish.js";

const env = process.env;
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const site = flag("--site");
const out = flag("--out") || env.SITES_ROOT;
const url = flag("--url");
// projectDir is the leading positional (volt-publish <dir> --site … ), else --project
const projectDir = args[0] && !args[0].startsWith("--") ? args[0] : flag("--project");
const bootPort = Number(flag("--boot-port") || env.BOOT_PORT || 28080);

function die(msg) { console.error("volt-publish: " + msg); process.exit(1); }
if (!site || !/^[a-z0-9][a-z0-9-]{0,62}$/i.test(site)) die("--site <id> required (a-z0-9-)");
if (!out) die("--out <SITES_ROOT> required (or set SITES_ROOT)");
if (!url && !projectDir) die("give a <projectDir> to boot, or --url <runningInstance>");

// image-host client — pushes an image, returns its CDN url (or throws)
function imageClient() {
  const base = env.IMAGE_HOST_URL, token = env.IMAGE_HOST_TOKEN;
  if (!base || !token) return null;
  return {
    async push(_p, buf, contentType) {
      const res = await fetch(`${base.replace(/\/+$/, "")}/sites/${site}/images`, {
        method: "POST",
        headers: { "Content-Type": contentType || "application/octet-stream", Authorization: `Bearer ${token}` },
        body: buf,
      });
      if (!res.ok) throw new Error(`image-host ${res.status}`);
      return (await res.json()).url;
    },
  };
}

async function waitReady(base, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(base); if (r.status) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  let child = null;
  let baseUrl = url;

  if (!baseUrl) {
    const dir = path.resolve(projectDir);
    if (!fs.existsSync(path.join(dir, "server.js"))) die(`no server.js in ${dir}`);
    baseUrl = `http://127.0.0.1:${bootPort}`;
    console.log(`booting ${dir} on :${bootPort} …`);
    child = spawn("node", ["server.js"], { cwd: dir, env: { ...env, PORT: String(bootPort), NODE_ENV: "production" }, stdio: "ignore" });
    child.on("error", (e) => die(`could not boot site: ${e.message}`));
    if (!(await waitReady(baseUrl))) { child.kill("SIGTERM"); die("site did not come up in time"); }
  }

  try {
    const captured = await crawl(baseUrl, { log: (m) => console.log("  " + m) });
    if (!captured.pages.size) die("crawled 0 pages — is the site serving content?");
    const outDir = path.join(path.resolve(out), site);
    const r = await publishStatic(captured, outDir, { images: imageClient(), log: (m) => console.log("  " + m) });
    console.log(`published ${site} → ${outDir}`);
    console.log(`  ${r.pages} page(s), ${r.assets} local asset(s), ${r.imagesPushed} image(s) → Spaces`);
  } finally {
    if (child) child.kill("SIGTERM");
  }
}

main().catch((e) => die(e.message));
