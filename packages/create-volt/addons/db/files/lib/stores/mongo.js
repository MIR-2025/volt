// mongo.js — MongoDB document store. Lazy-loads the `mongodb` driver, so it's
// only needed when DB_DRIVER=mongodb. Each collection maps to a Mongo
// collection; the document id is stored as `_id`. find/all support pagination
// ({ limit, offset, sort, dir }) natively via the cursor.

export async function createMongoStore({ uri, dbName }) {
  let MongoClient;
  try {
    ({ MongoClient } = await import("mongodb"));
  } catch {
    throw new Error("DB_DRIVER=mongodb but 'mongodb' isn't installed. Run: npm install mongodb");
  }
  if (!uri) throw new Error("DB_DRIVER=mongodb requires MONGODB_URI");

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName || undefined);
  const strip = ({ _id, ...rest }) => rest;

  const collection = (n) => {
    const c = db.collection(n);
    // build a cursor with optional sort / offset / limit pushed to Mongo
    const cursor = (q = {}, opts = {}) => {
      let cur = c.find(q);
      if (opts.sort) cur = cur.sort({ [opts.sort]: opts.dir === "desc" ? -1 : 1 });
      const off = Math.max(0, Number(opts.offset) || 0);
      if (off) cur = cur.skip(off);
      if (opts.limit != null) cur = cur.limit(Math.max(0, Number(opts.limit) || 0));
      return cur;
    };
    return {
      async put(id, doc) {
        await c.replaceOne({ _id: id }, { _id: id, ...doc, id }, { upsert: true });
        return { ...doc, id };
      },
      async get(id) {
        const d = await c.findOne({ _id: id });
        return d ? strip(d) : null;
      },
      async all(opts = {}) {
        return (await cursor({}, opts).toArray()).map(strip);
      },
      async find(query = {}, opts = {}) {
        return (await cursor(query, opts).toArray()).map(strip);
      },
      async delete(id) {
        await c.deleteOne({ _id: id });
      },
    };
  };

  return {
    name: "mongodb",
    async init() {},
    collection,
    async collections() {
      return (await db.listCollections().toArray()).map((c) => c.name);
    },
    // Native btree index on a field — makes find()/sort on it O(log n). Idempotent
    // (createIndex is a no-op if the same index already exists). opts.dir "desc" → -1.
    async index(coll, field, opts = {}) {
      if (!/^[A-Za-z_][\w.]*$/.test(String(field))) throw new Error(`invalid index field: ${field}`);
      await db.collection(coll).createIndex({ [field]: opts.dir === "desc" ? -1 : 1 });
    },
  };
}
