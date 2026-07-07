// store.js — a tiny document store with swappable backends. Pick one with the
// DB_DRIVER env var (default: memory). Every backend exposes the same API:
//
//   const store = await createStore();
//   const col = store.collection("things");
//   await col.put(id, doc);   // upsert (doc gets an `id`)
//   await col.get(id);        // → doc | null
//   await col.all();          // → doc[]
//   await col.find({ k: v }, { limit, offset, sort, dir }); // filter + paginate
//   await col.delete(id);
//   await store.index("things", "k"); // index a field so find()/sort on it stops scanning

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createMemoryStore } from "./stores/memory.js";
import { createMongoStore } from "./stores/mongo.js";
import { createSqlStore } from "./stores/sql.js";
import { createSqliteStore } from "./stores/sqlite.js";

export async function createStore() {
  // SQLite is the default: persistent + zero-server. (Was memory; memory doesn't survive
  // a restart, so it was a footgun as a default.)
  const driver = (process.env.DB_DRIVER || "sqlite").toLowerCase();
  const isDefault = !process.env.DB_DRIVER;

  let store;
  switch (driver) {
    case "memory":
      store = createMemoryStore();
      break;
    case "sqlite": {
      const file = process.env.SQLITE_FILE || path.join(".volt", "data.db");
      try {
        store = await createSqliteStore({ file });
      } catch (e) {
        if (!isDefault) throw e; // explicit DB_DRIVER=sqlite → surface the error
        console.warn(`[db] ${e.message}`);
        console.warn(`[db] falling back to in-memory — data will NOT persist across restarts.`);
        store = createMemoryStore();
      }
      break;
    }
    case "mongodb":
    case "mongo":
      store = await createMongoStore({ uri: process.env.MONGODB_URI, dbName: process.env.MONGODB_DATABASE });
      break;
    case "mysql":
      store = await createSqlStore({ dialect: "mysql", uri: process.env.DATABASE_URL });
      break;
    case "postgres":
    case "postgresql":
    case "pg":
      store = await createSqlStore({ dialect: "postgres", uri: process.env.DATABASE_URL });
      break;
    default:
      throw new Error(`Unknown DB_DRIVER "${driver}" (use sqlite | memory | mongodb | mysql | postgres)`);
  }

  await store.init();
  return store;
}

// Seed data — general fixtures, not migration-specific. Each `data/<name>.json` is an array
// of documents; it's loaded into the `<name>` collection ON FIRST BOOT ONLY (i.e. when that
// collection is empty), so seeds ship with the app (committed) while the store holds runtime
// data. A doc's `id` field is used as the key if present, else one is generated. Re-seed by
// clearing the collection. (This is what a WordPress import — or a hand-written fixture —
// drops into `data/` to have it appear in the app.)
export async function seed(store, dir) {
  if (!store || !fs.existsSync(dir)) return [];
  const seeded = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue; // "_"-prefixed = reserved (e.g. _seed.json manifest)
    const name = file.slice(0, -5); // collection name = filename without .json
    let docs;
    try {
      docs = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    } catch {
      continue; // skip unreadable / non-JSON
    }
    if (!Array.isArray(docs) || !docs.length) continue;
    const col = store.collection(name);
    if ((await col.all({ limit: 1 })).length) continue; // already has data → leave it alone
    let n = 0;
    for (const doc of docs) {
      if (!doc || typeof doc !== "object") continue;
      const id = doc.id != null ? String(doc.id) : crypto.randomUUID();
      await col.put(id, doc);
      n++;
    }
    if (n) seeded.push({ collection: name, count: n });
  }
  return seeded;
}
