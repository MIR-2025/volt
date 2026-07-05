import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// blog/docs/business are "default + content"; they must reuse default's server.js,
// wizard, and runtime verbatim, or they silently miss bug fixes (e.g. the hot-reload
// watcher, the media manager, the readonly boolean-attr fix).
const T = "packages/create-volt/templates";
const read = (p) => fs.readFileSync(path.join(T, p), "utf8");
for (const tpl of ["blog", "docs", "business"]) {
  test(`${tpl} server.js matches default (no drift)`, () => {
    assert.equal(read(`${tpl}/server.js`), read("default/server.js"));
  });
  test(`${tpl} setup wizard matches default (no drift)`, () => {
    assert.equal(read(`${tpl}/setup/setup.js`), read("default/setup/setup.js"));
  });
  test(`${tpl} volt.js runtime matches default (no drift)`, () => {
    assert.equal(read(`${tpl}/public/volt.js`), read("default/public/volt.js"));
  });
}
