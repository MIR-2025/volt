// sqlite.js — file-backed document store on Node's BUILT-IN node:sqlite (zero dependency,
// needs Node 22.5+). Same model as the other SQL drivers: one documents(coll, id, data)
// table with JSON in `data`. Persistent (survives restarts) with NO server to run — the
// sensible default for a single-box site. find() pushes equality filters down via
// json_extract(); index() creates real expression indexes; WAL mode for web concurrency.
import fs from "node:fs";
import path from "node:path";

export async function createSqliteStore({ file }) {
  // node:sqlite is experimental → it emits an ExperimentalWarning on load; swallow just that
  // one (keep every other warning intact).
  const orig = process.emitWarning;
  process.emitWarning = (w, ...a) => {
    const t = a[0] && typeof a[0] === "object" ? a[0].type : a[0];
    if (t === "ExperimentalWarning" && /SQLite/i.test(String(w))) return;
    return orig.call(process, w, ...a);
  };
  let db;
  try {
    let DatabaseSync;
    try {
      ({ DatabaseSync } = await import("node:sqlite"));
    } catch {
      throw new Error("DB_DRIVER=sqlite needs Node's built-in node:sqlite (Node 22.5+). Upgrade Node, or set DB_DRIVER=memory.");
    }
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    db = new DatabaseSync(file);
    db.exec(`CREATE TABLE IF NOT EXISTS documents (coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (coll, id))`);
    db.exec(`PRAGMA journal_mode = WAL`); // one writer + many readers, good for a web server
  } finally {
    process.emitWarning = orig;
  }

  const ident = (k) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error(`unsafe field name in query: ${JSON.stringify(k)}`);
    return k;
  };
  const jpath = (k) => `json_extract(data, '$.${ident(k)}')`;
  const bindable = (v) => (typeof v === "boolean" ? (v ? 1 : 0) : v); // node:sqlite has no bool type
  const int = (v, d = 0) => Math.max(0, Number.isFinite(+v) ? Math.trunc(+v) : d);
  const parse = (rows) => rows.map((r) => JSON.parse(r.data));

  const build = (n, query = {}, opts = {}) => {
    const where = ["coll = ?"];
    const params = [n];
    for (const [k, v] of Object.entries(query)) {
      where.push(`${jpath(k)} = ?`);
      params.push(bindable(v));
    }
    let sql = `SELECT data FROM documents WHERE ${where.join(" AND ")}`;
    if (opts.sort) sql += ` ORDER BY ${jpath(opts.sort)} ${opts.dir === "desc" ? "DESC" : "ASC"}`;
    if (opts.limit != null || opts.offset != null) sql += ` LIMIT ${opts.limit == null ? -1 : int(opts.limit)} OFFSET ${int(opts.offset)}`; // LIMIT -1 = no limit
    return [sql, params];
  };

  return {
    name: "sqlite",
    async init() {},
    async collections() {
      return db.prepare(`SELECT DISTINCT coll FROM documents`).all().map((r) => r.coll);
    },
    // Real SQLite expression index on the extracted field (composite with coll).
    async index(coll, field) {
      ident(field);
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS "ix_documents_${field}" ON documents (coll, ${jpath(field)})`);
      } catch {
        /* already exists / unsupported — queries still work unindexed */
      }
    },
    collection(n) {
      return {
        async put(id, doc) {
          const saved = { ...doc, id };
          db.prepare(`INSERT INTO documents (coll, id, data) VALUES (?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET data = excluded.data`).run(n, id, JSON.stringify(saved));
          return saved;
        },
        async get(id) {
          const r = db.prepare(`SELECT data FROM documents WHERE coll = ? AND id = ?`).get(n, id);
          return r ? JSON.parse(r.data) : null;
        },
        async all(opts = {}) {
          const [sql, params] = build(n, {}, opts);
          return parse(db.prepare(sql).all(...params));
        },
        async find(query = {}, opts = {}) {
          const [sql, params] = build(n, query, opts);
          return parse(db.prepare(sql).all(...params));
        },
        async delete(id) {
          db.prepare(`DELETE FROM documents WHERE coll = ? AND id = ?`).run(n, id);
        },
      };
    },
  };
}
