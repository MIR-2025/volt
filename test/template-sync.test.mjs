import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// blog/docs are "default + content"; they must reuse default's server.js + wizard
// verbatim, or they silently miss bug fixes (e.g. the hot-reload watcher).
const T = "packages/create-volt/templates";
const read = (p) => fs.readFileSync(path.join(T, p), "utf8");
for (const tpl of ["blog", "docs"]) {
  test(`${tpl} server.js matches default (no drift)`, () => {
    assert.equal(read(`${tpl}/server.js`), read("default/server.js"));
  });
  test(`${tpl} setup wizard matches default (no drift)`, () => {
    assert.equal(read(`${tpl}/setup/setup.js`), read("default/setup/setup.js"));
  });
}
