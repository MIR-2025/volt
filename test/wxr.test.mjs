// WXR importer — parse a WordPress export and convert to markdown pages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWXR, toMarkdown, slugify, runImport } from "../packages/create-volt/lib/import-wxr.js";

const SAMPLE = `<?xml version="1.0"?><rss><channel>
<item><title>Hello &amp; World</title><wp:post_type>post</wp:post_type><wp:post_name>hello-world</wp:post_name><wp:status>publish</wp:status><wp:post_date>2024-01-02 10:00:00</wp:post_date><category domain="post_tag" nicename="news">News</category><content:encoded><![CDATA[<!-- wp:paragraph --><p>Hi <strong>there</strong>.</p><!-- /wp:paragraph -->]]></content:encoded></item>
<item><title>About</title><wp:post_type>page</wp:post_type><wp:post_name>about</wp:post_name><wp:status>publish</wp:status><content:encoded><![CDATA[<p>About us</p>]]></content:encoded></item>
<item><title>Draft Post</title><wp:post_type>post</wp:post_type><wp:post_name>draft-post</wp:post_name><wp:status>draft</wp:status><content:encoded><![CDATA[<p>wip</p>]]></content:encoded></item>
<item><title>image.png</title><wp:post_type>attachment</wp:post_type><wp:status>inherit</wp:status></item>
</channel></rss>`;

test("parseWXR extracts items + decodes fields + CDATA", () => {
  const items = parseWXR(SAMPLE);
  assert.equal(items.length, 4);
  const post = items[0];
  assert.equal(post.title, "Hello & World");
  assert.equal(post.type, "post");
  assert.equal(post.slug, "hello-world");
  assert.deepEqual(post.tags, ["News"]);
  assert.match(post.content, /<strong>there<\/strong>/);
});

test("toMarkdown writes front-matter + strips Gutenberg block comments", () => {
  const md = toMarkdown(parseWXR(SAMPLE)[0]);
  assert.match(md, /^---\ntitle: Hello & World/);
  assert.match(md, /tags: News/);
  assert.ok(!md.includes("wp:paragraph"));
  assert.match(md, /<p>Hi <strong>there<\/strong>\.<\/p>/);
});

test("runImport keeps published page+post, skips drafts + attachments", () => {
  const { imported, stats } = runImport(SAMPLE);
  assert.equal(imported.length, 2);
  assert.deepEqual(imported.map((i) => i.slug).sort(), ["about", "hello-world"]);
  assert.equal(stats.draftsSkipped, 1);
  assert.equal(stats.otherTypeSkipped, 1);
});

test("runImport --drafts includes drafts", () => {
  assert.equal(runImport(SAMPLE, { drafts: true }).imported.length, 3);
});

test("slugify + slug de-duplication", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
  const xml = `<item><title>Dup</title><wp:post_type>page</wp:post_type><wp:status>publish</wp:status></item><item><title>Dup</title><wp:post_type>page</wp:post_type><wp:status>publish</wp:status></item>`;
  assert.deepEqual(runImport(xml).imported.map((i) => i.slug), ["dup", "dup-2"]);
});
