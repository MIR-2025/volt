#!/usr/bin/env node
// release.mjs — cut a create-volt release. Auto-bumps the version (no hand
// editing), commits, tags, and pushes. The pushed tag triggers the GitHub
// Actions workflow that publishes to npm via Trusted Publishing (OIDC).
//
//   npm run release            # patch bump (default)
//   npm run release -- minor   # minor bump
//   npm run release -- major   # major bump

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bump = (process.argv[2] || "patch").toLowerCase();
if (!["patch", "minor", "major"].includes(bump)) {
  console.error(`Usage: npm run release -- [patch|minor|major]  (got "${bump}")`);
  process.exit(1);
}

const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

// Refuse to release from a dirty tree, so a release is exactly one commit.
if (git(["status", "--porcelain"])) {
  console.error("✖ Working tree is not clean — commit or stash changes first.");
  process.exit(1);
}

const pkgPath = path.join(root, "packages", "create-volt", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const [maj, min, pat] = pkg.version.split(".").map(Number);
const next =
  bump === "major" ? `${maj + 1}.0.0`
  : bump === "minor" ? `${maj}.${min + 1}.0`
  : `${maj}.${min}.${pat + 1}`;

pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const tag = `v${next}`;
git(["add", pkgPath]);
git(["commit", "-m", `release: create-volt ${tag}`]);
git(["tag", tag]);
git(["push", "--follow-tags"]);

console.log(`\n✅ Released ${tag} (${bump}) — pushed commit + tag.`);
console.log("   GitHub Actions will publish create-volt via Trusted Publishing.");
console.log("   Watch: https://github.com/MIR-2025/volt/actions\n");
