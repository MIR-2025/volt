// store.js — pick a storage backend from the environment. Defaults to the
// in-memory store so the app runs with zero setup; point DB_DRIVER at a real
// database (mongodb | mysql | postgres) for persistence.
//
//   DB_DRIVER=memory                       (default)
//   DB_DRIVER=mongodb  MONGODB_URI=...  [MONGODB_DATABASE=...]
//   DB_DRIVER=mysql    DATABASE_URL=mysql://user:pass@host:3306/db
//   DB_DRIVER=postgres DATABASE_URL=postgres://user:pass@host:5432/db

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
      store = await createMongoStore({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DATABASE,
      });
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
