// memory.js — in-memory document store. Zero-dependency dev fallback; data is
// lost on restart. Same collection API as the Mongo / SQL adapters, including
// find/all pagination: { limit, offset, sort, dir }.

export function createMemoryStore() {
  const cols = new Map(); // name -> Map(id -> doc)
  const col = (n) => {
    if (!cols.has(n)) cols.set(n, new Map());
    return cols.get(n);
  };
  const match = (doc, query) => Object.entries(query).every(([k, v]) => doc[k] === v);
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const page = (rows, opts = {}) => {
    let out = rows;
    if (opts.sort) {
      const d = opts.dir === "desc" ? -1 : 1;
      out = [...out].sort((a, b) => cmp(a?.[opts.sort], b?.[opts.sort]) * d);
    }
    const off = Math.max(0, Number(opts.offset) || 0);
    if (off) out = out.slice(off);
    if (opts.limit != null) out = out.slice(0, Math.max(0, Number(opts.limit) || 0));
    return out;
  };

  const collection = (n) => ({
    async put(id, doc) {
      const saved = { ...doc, id };
      col(n).set(id, saved);
      return saved;
    },
    async get(id) {
      return col(n).get(id) ?? null;
    },
    async all(opts = {}) {
      return page([...col(n).values()], opts);
    },
    async find(query = {}, opts = {}) {
      return page([...col(n).values()].filter((d) => match(d, query)), opts);
    },
    async delete(id) {
      col(n).delete(id);
    },
  });

  return {
    name: "memory",
    async init() {},
    collection,
    async collections() {
      return [...cols.keys()];
    },
    async index() {}, // in-memory: every read is already a scan — nothing to index
  };
}
