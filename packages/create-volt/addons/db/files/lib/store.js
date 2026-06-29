// store.js — a tiny document store with swappable backends. Pick one with the
// DB_DRIVER env var (default: memory). Every backend exposes the same API:
//
//   const store = await createStore();
//   const col = store.collection("things");
//   await col.put(id, doc);   // upsert (doc gets an `id`)
//   await col.get(id);        // → doc | null
//   await col.all();          // → doc[]
//   await col.find({ k: v }); // → doc[]  (simple equality match)
//   await col.delete(id);

import { createMemoryStore } from "./stores/memory.js";
import { createMongoStore } from "./stores/mongo.js";
import { createSqlStore } from "./stores/sql.js";

export async function createStore() {
  const driver = (process.env.DB_DRIVER || "memory").toLowerCase();

  let store;
  switch (driver) {
    case "memory":
      store = createMemoryStore();
      break;
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
      throw new Error(`Unknown DB_DRIVER "${driver}" (use memory | mongodb | mysql | postgres)`);
  }

  await store.init();
  return store;
}
