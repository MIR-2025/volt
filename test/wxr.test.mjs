// WXR importer — parse a WordPress export and convert to markdown pages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWXR, toMarkdown, slugify, runImport, fetchWP } from "../packages/create-volt/lib/import-wxr.js";

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

test("fetchWP maps REST posts+pages, paginates, decodes title + terms", async () => {
  const fetchImpl = async (url) => {
    const isPosts = url.includes("/posts");
    const isPage2 = url.includes("page=2");
    const headers = { get: (h) => (h === "X-WP-TotalPages" ? (isPosts ? "2" : "1") : null) };
    let body = [];
    if (isPosts && !isPage2)
      body = [{ slug: "hello", status: "publish", date: "2024-01-01T10:00:00", title: { rendered: "Hello &amp; Hi" }, content: { rendered: "<p>hi</p>" }, _embedded: { "wp:term": [[{ taxonomy: "category", name: "News" }], [{ taxonomy: "post_tag", name: "intro" }]] } }];
    else if (isPosts && isPage2) body = [{ slug: "second", status: "publish", title: { rendered: "Second" }, content: { rendered: "<p>2</p>" } }];
    else if (!isPosts) body = [{ slug: "about", status: "publish", title: { rendered: "About" }, content: { rendered: "<p>about</p>" } }];
    return { ok: true, status: 200, headers, json: async () => body };
  };
  const items = await fetchWP("https://x.com/", { fetchImpl });
  assert.equal(items.length, 3); // hello + second (2 post pages) + about (page)
  const hello = items.find((i) => i.slug === "hello");
  assert.equal(hello.title, "Hello & Hi");
  assert.equal(hello.type, "post");
  assert.deepEqual(hello.tags, ["intro"]);
  assert.deepEqual(hello.categories, ["News"]);
  assert.equal(items.find((i) => i.slug === "about").type, "page");
});

test("slugify + slug de-duplication", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
  const xml = `<item><title>Dup</title><wp:post_type>page</wp:post_type><wp:status>publish</wp:status></item><item><title>Dup</title><wp:post_type>page</wp:post_type><wp:status>publish</wp:status></item>`;
  assert.deepEqual(runImport(xml).imported.map((i) => i.slug), ["dup", "dup-2"]);
});
