// mongo.js — MongoDB document store. Lazy-loads the `mongodb` driver, so it's
// only needed when DB_DRIVER=mongodb. Each collection maps to a Mongo
// collection; the document id is stored as `_id`.

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
    return {
      async put(id, doc) {
        await c.replaceOne({ _id: id }, { _id: id, ...doc, id }, { upsert: true });
        return { ...doc, id };
      },
      async get(id) {
        const d = await c.findOne({ _id: id });
        return d ? strip(d) : null;
      },
      async all() {
        return (await c.find().toArray()).map(strip);
      },
      async find(query = {}) {
        return (await c.find(query).toArray()).map(strip);
      },
      async delete(id) {
        await c.deleteOne({ _id: id });
      },
    };
  };

  return { name: "mongodb", async init() {}, collection };
}
