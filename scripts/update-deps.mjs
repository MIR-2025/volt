#!/usr/bin/env node
// update-deps.mjs — keep create-volt's pinned dependency *floors* current.
//
// For each package create-volt installs into scaffolded apps, this finds the
// latest release WITHIN THE CURRENT MAJOR (so it never silently pulls a breaking
// major like Express 5) and rewrites the pins in the templates:
//   • PKG_VERSIONS maps in templates/{default,starter}/server.js
//   • dependencies / optionalDependencies in every template package.json
//
// Repo-only tooling — scaffolded apps are untouched. To intentionally cross a
// major, bump the number in MAJOR below by hand.
//
//   node scripts/update-deps.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAJOR = { express: 4, "socket.io": 4, mongodb: 6, mysql2: 3, pg: 8, nodemailer: 6, marked: 18 };

const cmp = (a, b) => {
  const A = a.split(".").map(Number);
  const B = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0);
  return 0;
};
async function latestInMajor(name, major) {
  const res = await fetch(`https://registry.npmjs.org/${name}`);
  if (!res.ok) throw new Error(`registry ${name}: ${res.status}`);
  const versions = Object.keys((await res.json()).versions || {});
  const inMajor = versions.filter((v) => /^\d+\.\d+\.\d+$/.test(v) && Number(v.split(".")[0]) === major);
  if (!inMajor.length) throw new Error(`no ${major}.x release for ${name}`);
  return inMajor.sort(cmp).pop();
}

const want = {};
for (const [name, major] of Object.entries(MAJOR)) want[name] = await latestInMajor(name, major);

const changes = [];
const edit = (rel, transform) => {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return;
  const before = fs.readFileSync(abs, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(abs, after);
    changes.push(rel);
  }
};

// 1) PKG_VERSIONS maps (server-side packages added on demand) in template server.js
const pkgVersionsLine = `const PKG_VERSIONS = { ${["mongodb", "mysql2", "pg", "nodemailer", "marked"].map((n) => `${n}: "^${want[n]}"`).join(", ")} };`;
for (const t of ["default", "starter"]) {
  edit(`packages/create-volt/templates/${t}/server.js`, (s) => s.replace(/const PKG_VERSIONS = \{[^}]*\};/, pkgVersionsLine));
}

// 2) deps / optionalDeps in every template package.json
for (const t of ["default", "starter", "guestbook"]) {
  edit(`packages/create-volt/templates/${t}/package.json`, (s) => {
    const pkg = JSON.parse(s);
    for (const field of ["dependencies", "optionalDependencies"]) {
      if (!pkg[field]) continue;
      for (const name of Object.keys(pkg[field])) if (want[name]) pkg[field][name] = `^${want[name]}`;
    }
    return JSON.stringify(pkg, null, 2) + "\n";
  });
}

console.log("Latest within current major:");
for (const [n, v] of Object.entries(want)) console.log(`  ${n.padEnd(10)} ^${v}`);
console.log(changes.length ? `\nUpdated ${changes.length} file(s):\n  ${changes.join("\n  ")}` : "\nAlready current.");
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changes.length ? "true" : "false"}\n`);
