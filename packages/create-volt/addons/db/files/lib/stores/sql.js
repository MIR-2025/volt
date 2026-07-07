// sql.js — MySQL / Postgres document store. Documents are kept as JSON in one
// `documents(coll, id, data)` table, so any collection works without a schema.
// Lazy-loads mysql2 or pg and normalizes the dialect differences:
//   • placeholders:  MySQL `?`            Postgres `$1, $2, …`
//   • upsert:        ON DUPLICATE KEY     ON CONFLICT … DO UPDATE
//   • json extract:  JSON_EXTRACT(...)    (data::jsonb)->>'k'
//   • limit/offset:  LIMIT off, count     LIMIT count OFFSET off
//
// find(query, opts) pushes equality filters DOWN into SQL (JSON extraction in the
// database, not read-all-then-filter-in-JS) and supports { limit, offset, sort, dir }.
// The `data` column stays TEXT (no migration); the JSON functions work on it directly.
// For heavy collections, add a JSONB/generated column + index on the hot keys.

export async function createSqlStore({ dialect, uri }) {
  if (!uri) throw new Error(`DB_DRIVER=${dialect} requires a connection string (DATABASE_URL)`);

  let run; // (sql, params) => rows[]
  if (dialect === "mysql") {
    let mysql;
    try {
      mysql = (await import("mysql2/promise")).default;
    } catch {
      throw new Error("DB_DRIVER=mysql but 'mysql2' isn't installed. Run: npm install mysql2");
    }
    const pool = mysql.createPool(uri);
    run = async (sql, params = []) => (await pool.query(sql, params))[0];
  } else {
    let pg;
    try {
      pg = await import("pg");
    } catch {
      throw new Error("DB_DRIVER=postgres but 'pg' isn't installed. Run: npm install pg");
    }
    const pool = new pg.default.Pool({ connectionString: uri });
    run = async (sql, params = []) => (await pool.query(sql, params)).rows;
  }

  const mysql = dialect === "mysql";
  const ph = mysql ? () => "?" : (i) => `$${i}`;
  const upsert = mysql
    ? `INSERT INTO documents (coll, id, data) VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}) ON DUPLICATE KEY UPDATE data = VALUES(data)`
    : `INSERT INTO documents (coll, id, data) VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}) ON CONFLICT (coll, id) DO UPDATE SET data = EXCLUDED.data`;
  const parse = (rows) => rows.map((r) => JSON.parse(r.data));

  // A field name goes into a JSON path literal (can't be a bound param), so validate it
  // hard to keep it injection-proof. Then extract that field's value as text.
  const ident = (k) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error(`unsafe field name in query: ${JSON.stringify(k)}`);
    return k;
  };
  const jsonGet = mysql ? (k) => `JSON_UNQUOTE(JSON_EXTRACT(data, '$.${ident(k)}'))` : (k) => `(data::jsonb)->>'${ident(k)}'`;
  const int = (v, d = 0) => Math.max(0, Number.isFinite(+v) ? Math.trunc(+v) : d);
  const paginate = (opts) => {
    if (opts.limit == null && opts.offset == null) return "";
    const off = int(opts.offset);
    if (mysql) return ` LIMIT ${off}, ${opts.limit == null ? "18446744073709551615" : int(opts.limit)}`; // MySQL: OFFSET needs a count
    return `${opts.limit == null ? "" : ` LIMIT ${int(opts.limit)}`}${off ? ` OFFSET ${off}` : ""}`;
  };
  const build = (n, query = {}, opts = {}) => {
    const where = [`coll = ${ph(1)}`];
    const params = [n];
    let i = 2;
    for (const [k, v] of Object.entries(query)) {
      where.push(`${jsonGet(k)} = ${ph(i++)}`);
      params.push(v == null ? null : String(v)); // JSON ->> returns text; compare as text
    }
    let sql = `SELECT data FROM documents WHERE ${where.join(" AND ")}`;
    if (opts.sort) sql += ` ORDER BY ${jsonGet(opts.sort)} ${opts.dir === "desc" ? "DESC" : "ASC"}`;
    sql += paginate(opts);
    return [sql, params];
  };

  return {
    name: dialect,
    async init() {
      await run(
        `CREATE TABLE IF NOT EXISTS documents (
           coll VARCHAR(64) NOT NULL,
           id   VARCHAR(128) NOT NULL,
           data TEXT NOT NULL,
           PRIMARY KEY (coll, id)
         )`,
      );
    },
    async collections() {
      return (await run(`SELECT DISTINCT coll FROM documents`)).map((r) => r.coll);
    },
    // Index a JSON field so find()/sort on it uses an index instead of scanning. The index
    // leads with `coll` (composite), so one index serves that field across every collection.
    //   MySQL/MariaDB: a VIRTUAL generated column on the extracted value + a (coll, col) index
    //   Postgres:      a composite functional index (coll, (data::jsonb)->>'field')
    // Best-effort: re-indexing, or an old server without the syntax, is a harmless no-op —
    // queries still work (just scan) if the index can't be created.
    async index(coll, field) {
      ident(field);
      const bt = "`"; // MySQL identifier quoting (kept out of the template literal)
      const stmts = mysql
        ? [
            `ALTER TABLE documents ADD COLUMN ${bt}_ix_${field}${bt} VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data, '$.${field}'))) VIRTUAL`,
            `CREATE INDEX ${bt}ix_${field}${bt} ON documents (coll, ${bt}_ix_${field}${bt})`,
          ]
        : [`CREATE INDEX IF NOT EXISTS "ix_documents_${field}" ON documents (coll, ((data::jsonb)->>'${field}'))`];
      for (const sql of stmts) {
        try {
          await run(sql);
        } catch {
          /* already exists / unsupported — fine, queries still work unindexed */
        }
      }
    },
    collection(n) {
      return {
        async put(id, doc) {
          const saved = { ...doc, id };
          await run(upsert, [n, id, JSON.stringify(saved)]);
          return saved;
        },
        async get(id) {
          const rows = await run(`SELECT data FROM documents WHERE coll = ${ph(1)} AND id = ${ph(2)}`, [n, id]);
          return rows[0] ? JSON.parse(rows[0].data) : null;
        },
        async all(opts = {}) {
          const [sql, params] = build(n, {}, opts);
          return parse(await run(sql, params));
        },
        async find(query = {}, opts = {}) {
          const [sql, params] = build(n, query, opts);
          return parse(await run(sql, params));
        },
        async delete(id) {
          await run(`DELETE FROM documents WHERE coll = ${ph(1)} AND id = ${ph(2)}`, [n, id]);
        },
      };
    },
  };
}
