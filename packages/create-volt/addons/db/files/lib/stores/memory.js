// memory.js — in-memory document store. Zero-dependency dev fallback; data is
// lost on restart. Same collection API as the Mongo / SQL adapters.

export function createMemoryStore() {
  const cols = new Map(); // name -> Map(id -> doc)
  const col = (n) => {
    if (!cols.has(n)) cols.set(n, new Map());
    return cols.get(n);
  };
  const match = (doc, query) => Object.entries(query).every(([k, v]) => doc[k] === v);

  const collection = (n) => ({
    async put(id, doc) {
      const saved = { ...doc, id };
      col(n).set(id, saved);
      return saved;
    },
    async get(id) {
      return col(n).get(id) ?? null;
    },
    async all() {
      return [...col(n).values()];
    },
    async find(query = {}) {
      return [...col(n).values()].filter((d) => match(d, query));
    },
    async delete(id) {
      col(n).delete(id);
    },
  });

  return { name: "memory", async init() {}, collection, async collections() { return [...cols.keys()]; } };
}
