// Memory store — the default db driver's document API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../packages/create-volt/addons/db/files/lib/stores/memory.js";

test("put / get / all round-trip", async () => {
  const store = createMemoryStore();
  const c = store.collection("notes");
  await c.put("a", { id: "a", text: "hello" });
  await c.put("b", { id: "b", text: "world" });
  assert.deepEqual(await c.get("a"), { id: "a", text: "hello" });
  assert.equal((await c.all()).length, 2);
});

test("get of missing key returns null/undefined", async () => {
  const store = createMemoryStore();
  const got = await store.collection("x").get("nope");
  assert.ok(got == null);
});

test("find filters by fields", async () => {
  const store = createMemoryStore();
  const c = store.collection("notes");
  await c.put("1", { id: "1", owner: "a@x", text: "one" });
  await c.put("2", { id: "2", owner: "b@x", text: "two" });
  await c.put("3", { id: "3", owner: "a@x", text: "three" });
  const mine = await c.find({ owner: "a@x" });
  assert.equal(mine.length, 2);
  assert.deepEqual(mine.map((d) => d.id).sort(), ["1", "3"]);
});

test("delete removes a document", async () => {
  const store = createMemoryStore();
  const c = store.collection("notes");
  await c.put("a", { id: "a" });
  await c.delete("a");
  assert.ok((await c.get("a")) == null);
  assert.equal((await c.all()).length, 0);
});

test("collections are isolated by name", async () => {
  const store = createMemoryStore();
  await store.collection("one").put("k", { id: "k", n: 1 });
  await store.collection("two").put("k", { id: "k", n: 2 });
  assert.equal((await store.collection("one").get("k")).n, 1);
  assert.equal((await store.collection("two").get("k")).n, 2);
});
