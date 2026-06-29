// media add-on — pure helpers (mime allowlist + key generation).
import { test } from "node:test";
import assert from "node:assert/strict";
import { extFor, isAllowed, genKey } from "../packages/create-volt/addons/media/files/lib/media.js";

test("allowed types map to extensions (images + pdf)", () => {
  assert.equal(extFor("image/jpeg"), "jpg");
  assert.equal(extFor("image/png"), "png");
  assert.equal(extFor("image/webp"), "webp");
  assert.equal(extFor("application/pdf"), "pdf");
  assert.ok(isAllowed("image/gif"));
  assert.ok(isAllowed("application/pdf"));
});

test("disallowed types rejected (incl. svg + non-allowed)", () => {
  for (const m of ["image/svg+xml", "text/html", "application/octet-stream", "text/plain", ""]) {
    assert.ok(!isAllowed(m), m);
    assert.equal(extFor(m), null);
  }
});

test("genKey is random, safe, and carries the right extension", () => {
  const k1 = genKey("image/png");
  const k2 = genKey("image/png");
  assert.match(k1, /^[a-f0-9]{20}\.png$/);
  assert.notEqual(k1, k2); // random
});
