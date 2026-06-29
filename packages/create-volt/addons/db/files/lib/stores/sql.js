// sql.js — MySQL / Postgres document store. Documents are kept as JSON in one
// `documents(coll, id, data)` table, so any collection works without a schema.
// Lazy-loads mysql2 or pg and normalizes the two dialect differences:
//   • placeholders:  MySQL `?`            Postgres `$1, $2, …`
//   • upsert:        ON DUPLICATE KEY     ON CONFLICT … DO UPDATE
//
// find() filters in JS (reads the collection, then matches) — fine for an
// example; add real indexes/queries if a collection grows large.

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

  const ph = dialect === "mysql" ? () => "?" : (i) => `$${i}`;
  const upsert =
    dialect === "mysql"
      ? `INSERT INTO documents (coll, id, data) VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}) ON DUPLICATE KEY UPDATE data = VALUES(data)`
      : `INSERT INTO documents (coll, id, data) VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}) ON CONFLICT (coll, id) DO UPDATE SET data = EXCLUDED.data`;

  const parse = (rows) => rows.map((r) => JSON.parse(r.data));
  const match = (doc, query) => Object.entries(query).every(([k, v]) => doc[k] === v);

  const store = {
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
        async all() {
          return parse(await run(`SELECT data FROM documents WHERE coll = ${ph(1)}`, [n]));
        },
        async find(query = {}) {
          return (await this.all()).filter((d) => match(d, query));
        },
        async delete(id) {
          await run(`DELETE FROM documents WHERE coll = ${ph(1)} AND id = ${ph(2)}`, [n, id]);
        },
      };
    },
  };
  return store;
}
