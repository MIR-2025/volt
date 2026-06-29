// pages add-on — front-matter parsing + slug safety (path-traversal guard).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontMatter, isSafeSlug } from "../packages/create-volt/addons/pages/files/lib/pages.js";

test("parses front-matter and body", () => {
  const { meta, body } = parseFrontMatter("---\ntitle: About Us\n---\n\n# Hi\n");
  assert.equal(meta.title, "About Us");
  assert.equal(body.trim(), "# Hi");
});

test("no front-matter → empty meta, full body", () => {
  const { meta, body } = parseFrontMatter("# Just markdown\n");
  assert.deepEqual(meta, {});
  assert.equal(body, "# Just markdown\n");
});

test("safe slugs accepted", () => {
  for (const s of ["about", "pricing-2", "Contact", "a"]) assert.ok(isSafeSlug(s), s);
});

test("unsafe slugs rejected (traversal, dots, slashes)", () => {
  for (const s of ["../secret", "a/b", "a.md", ".env", "", "foo bar", "-leading"]) {
    assert.ok(!isSafeSlug(s), s);
  }
});
