// sql.js — shared SQL adapter for MySQL and Postgres. Lazy-loads the relevant
// driver (mysql2 or pg) and normalizes the two differences that matter:
//   • placeholders:  MySQL uses `?`,  Postgres uses `$1, $2, …`
//   • query call:    mysql2 returns [rows],  pg returns { rows }

export async function createSqlStore({ dialect, uri }) {
  if (!uri) throw new Error(`DB_DRIVER=${dialect} requires a connection string (DATABASE_URL)`);

  let run; // (sql, params) => Promise<rows[]>
  if (dialect === "mysql") {
    let mysql;
    try {
      mysql = (await import("mysql2/promise")).default;
    } catch {
      throw new Error("DB_DRIVER=mysql but 'mysql2' isn't installed. Run: npm install mysql2");
    }
    const pool = mysql.createPool(uri);
    run = async (sql, params = []) => {
      const [rows] = await pool.query(sql, params);
      return rows;
    };
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

  // Placeholder for the i-th (1-based) parameter.
  const ph = dialect === "mysql" ? () => "?" : (i) => `$${i}`;
  const BOOL = dialect === "mysql" ? "TINYINT(1)" : "BOOLEAN";

  return {
    name: dialect,

    async init() {
      await run(
        `CREATE TABLE IF NOT EXISTS login_tokens (
           token VARCHAR(128) PRIMARY KEY,
           email VARCHAR(320) NOT NULL,
           ua TEXT,
           expires_at BIGINT NOT NULL,
           used ${BOOL} NOT NULL DEFAULT 0
         )`,
      );
      await run(
        `CREATE TABLE IF NOT EXISTS sessions (
           id VARCHAR(128) PRIMARY KEY,
           email VARCHAR(320) NOT NULL,
           expires_at BIGINT NOT NULL
         )`,
      );
      await run(
        `CREATE TABLE IF NOT EXISTS messages (
           id VARCHAR(64) PRIMARY KEY,
           email VARCHAR(320) NOT NULL,
           body TEXT NOT NULL,
           created_at BIGINT NOT NULL
         )`,
      );
    },

    async putToken(t) {
      await run(
        `INSERT INTO login_tokens (token, email, ua, expires_at, used)
         VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, 0)`,
        [t.token, t.email, t.ua, t.expiresAt],
      );
    },
    async getToken(token) {
      const rows = await run(`SELECT token, email, ua, expires_at, used FROM login_tokens WHERE token = ${ph(1)}`, [token]);
      const r = rows[0];
      if (!r) return null;
      return { token: r.token, email: r.email, ua: r.ua, expiresAt: Number(r.expires_at), used: !!r.used };
    },
    async useToken(token) {
      await run(`UPDATE login_tokens SET used = 1 WHERE token = ${ph(1)}`, [token]);
    },

    async putSession(s) {
      await run(`INSERT INTO sessions (id, email, expires_at) VALUES (${ph(1)}, ${ph(2)}, ${ph(3)})`, [
        s.id,
        s.email,
        s.expiresAt,
      ]);
    },
    async getSession(id) {
      const rows = await run(`SELECT id, email, expires_at FROM sessions WHERE id = ${ph(1)}`, [id]);
      const r = rows[0];
      if (!r) return null;
      const s = { id: r.id, email: r.email, expiresAt: Number(r.expires_at) };
      if (s.expiresAt < Date.now()) {
        await this.delSession(id);
        return null;
      }
      return s;
    },
    async delSession(id) {
      await run(`DELETE FROM sessions WHERE id = ${ph(1)}`, [id]);
    },

    async addMessage(m) {
      await run(`INSERT INTO messages (id, email, body, created_at) VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)})`, [
        m.id,
        m.email,
        m.body,
        m.createdAt,
      ]);
      return m;
    },
    async listMessages(limit = 100) {
      const rows = await run(`SELECT id, email, body, created_at FROM messages ORDER BY created_at ASC LIMIT ${Number(limit)}`);
      return rows.map((r) => ({ id: r.id, email: r.email, body: r.body, createdAt: Number(r.created_at) }));
    },
  };
}
