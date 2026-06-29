// mongo.js — MongoDB adapter. Lazy-loads the `mongodb` driver so the app only
// needs it when DB_DRIVER=mongodb. Connection string per instructions.md:
//   MONGODB_URI=mongodb://user:<password>@host:port/{dbname}?authSource=admin...

export async function createMongoStore({ uri, dbName }) {
  let MongoClient;
  try {
    ({ MongoClient } = await import("mongodb"));
  } catch {
    throw new Error("DB_DRIVER=mongodb but the 'mongodb' package isn't installed. Run: npm install mongodb");
  }
  if (!uri) throw new Error("DB_DRIVER=mongodb requires MONGODB_URI");

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName || undefined);
  const tokens = db.collection("login_tokens");
  const sessions = db.collection("sessions");
  const messages = db.collection("messages");

  return {
    name: "mongodb",
    async init() {
      await tokens.createIndex({ token: 1 }, { unique: true });
      await sessions.createIndex({ id: 1 }, { unique: true });
      await messages.createIndex({ createdAt: 1 });
    },

    async putToken(t) {
      await tokens.insertOne({ ...t, used: false });
    },
    async getToken(token) {
      return await tokens.findOne({ token }, { projection: { _id: 0 } });
    },
    async useToken(token) {
      await tokens.updateOne({ token }, { $set: { used: true } });
    },

    async putSession(s) {
      await sessions.insertOne(s);
    },
    async getSession(id) {
      const s = await sessions.findOne({ id }, { projection: { _id: 0 } });
      if (!s) return null;
      if (s.expiresAt < Date.now()) {
        await sessions.deleteOne({ id });
        return null;
      }
      return s;
    },
    async delSession(id) {
      await sessions.deleteOne({ id });
    },

    async addMessage(m) {
      await messages.insertOne({ ...m });
      return m;
    },
    async listMessages(limit = 100) {
      const rows = await messages
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: 1 })
        .limit(limit)
        .toArray();
      return rows;
    },
  };
}
