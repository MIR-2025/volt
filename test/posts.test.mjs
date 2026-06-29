import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readPosts } from "../packages/create-volt/addons/posts/files/lib/posts.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "posts-"));
fs.writeFileSync(path.join(dir, "2026-06-29-hello.md"), "---\ntitle: Hello\ncategory: Tech\ntags: a, b\n---\nbody");
fs.writeFileSync(path.join(dir, "2026-06-20-second.md"), "---\ntitle: Second\n---\nolder");
fs.writeFileSync(path.join(dir, "2026-06-25-draft.md"), "---\ntitle: Draft\ndraft: true\n---\nx");
fs.writeFileSync(path.join(dir, "notes.txt"), "ignore me");

test("reads posts, skips drafts + non-markdown, newest first", () => {
  const p = readPosts(dir);
  assert.equal(p.length, 2);
  assert.deepEqual(p.map((x) => x.slug), ["hello", "second"]);
});

test("derives date + slug from a YYYY-MM-DD- filename prefix", () => {
  const p = readPosts(dir);
  assert.equal(p[0].date, "2026-06-29");
  assert.equal(p[0].slug, "hello");
});

test("front-matter slug/date override the filename", () => {
  const f = path.join(dir, "draft2.md");
  fs.writeFileSync(f, "---\ntitle: X\nslug: custom\ndate: 2030-01-01\n---\nz");
  const p = readPosts(dir);
  assert.equal(p[0].slug, "custom"); // 2030 sorts newest
  assert.equal(p[0].date, "2030-01-01");
  fs.unlinkSync(f);
});

test("empty/missing dir → []", () => {
  assert.deepEqual(readPosts(path.join(dir, "nope")), []);
});
