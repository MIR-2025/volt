// import-wp-db — read WordPress content from MySQL (connection injected).
import { test } from "node:test";
import assert from "node:assert/strict";
import { rowsToItems, validatePrefix, fetchWPFromDB, runImportFromDB } from "../packages/create-volt/lib/import-wp-db.js";

test("validatePrefix accepts safe identifiers, rejects injection", () => {
  assert.equal(validatePrefix("wp_"), "wp_");
  assert.equal(validatePrefix("blog2_"), "blog2_");
  for (const bad of ["wp_; DROP TABLE x", "wp`", "wp posts", "wp-", "wp_'"]) assert.throws(() => validatePrefix(bad));
});

test("rowsToItems joins terms to their post", () => {
  const items = rowsToItems(
    [{ ID: 1, post_title: "Hello", post_name: "hello", post_content: "<p>hi</p>", post_status: "publish", post_type: "post", post_date: "2024-01-01 10:00:00" }],
    [{ object_id: 1, taxonomy: "post_tag", name: "intro" }, { object_id: 1, taxonomy: "category", name: "News" }],
  );
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].tags, ["intro"]);
  assert.deepEqual(items[0].categories, ["News"]);
  assert.equal(items[0].slug, "hello");
});

test("fetchWPFromDB applies the prefix + maps rows (injected connection)", async () => {
  const seen = [];
  const connect = async () => ({
    query: async (sql) => {
      seen.push(sql);
      return sql.includes("posts") && !sql.includes("term_relationships")
        ? [{ ID: 1, post_title: "About", post_name: "about", post_content: "<p>x</p>", post_status: "publish", post_type: "page", post_date: "2024-02-02 00:00:00" }]
        : [{ object_id: 1, taxonomy: "category", name: "Info" }];
    },
    end: async () => {},
  });
  const items = await fetchWPFromDB("mysql://x", { connect, prefix: "blog_" });
  assert.equal(items.length, 1);
  assert.equal(items[0].type, "page");
  assert.deepEqual(items[0].categories, ["Info"]);
  assert.ok(seen.some((s) => s.includes("`blog_posts`")));
});

test("runImportFromDB produces markdown pages", async () => {
  const connect = async () => ({
    query: async (sql) => (sql.includes("term_relationships") ? [] : [{ ID: 1, post_title: "Hi", post_name: "hi", post_content: "<p>yo</p>", post_status: "publish", post_type: "post", post_date: "" }]),
    end: async () => {},
  });
  const { imported } = await runImportFromDB("mysql://x", { connect });
  assert.equal(imported.length, 1);
  assert.match(imported[0].markdown, /title: Hi/);
  assert.equal(imported[0].filename, "hi.md");
});
