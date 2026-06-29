// import-wp-db.js — import WordPress content by reading its MySQL/MariaDB
// database directly. The niche path for when the REST API is disabled but you
// have DB access (e.g. on the server or over an SSH tunnel). Reuses the WXR
// converter (transform → markdown). mysql2 is loaded lazily so create-volt stays
// dependency-free; the DB connection is injectable for testing.
import { transform } from "./import-wxr.js";

// Table prefix goes into table names (which can't be parameterized), so it must
// be a safe SQL identifier — this is the one injection vector. Validate hard.
export function validatePrefix(p) {
  if (!/^[A-Za-z0-9_]+$/.test(p)) throw new Error(`Invalid --prefix "${p}" — only letters, numbers, and underscore are allowed.`);
  return p;
}

// Shape DB rows (posts + flat term rows) into the common item shape.
export function rowsToItems(posts, terms) {
  const byPost = new Map();
  for (const t of terms || []) {
    const m = byPost.get(t.object_id) || { categories: [], tags: [] };
    (t.taxonomy === "post_tag" ? m.tags : m.categories).push(t.name);
    byPost.set(t.object_id, m);
  }
  return (posts || []).map((p) => {
    const t = byPost.get(p.ID) || { categories: [], tags: [] };
    return {
      type: p.post_type || "post",
      title: p.post_title || p.post_name || "Untitled",
      slug: p.post_name || "",
      status: p.post_status || "publish",
      date: p.post_date ? String(p.post_date).replace("T", " ").replace(/\.\d+$/, "") : "",
      content: p.post_content || "",
      categories: t.categories,
      tags: t.tags,
    };
  });
}

async function defaultConnect(dbUrl) {
  let mysql;
  try {
    mysql = await import("mysql2/promise");
  } catch {
    throw new Error("mysql2 is required for import-wp-db — install it: npm i mysql2");
  }
  const c = await mysql.createConnection(dbUrl);
  return {
    query: async (sql) => {
      const [rows] = await c.query(sql);
      return rows;
    },
    end: () => c.end(),
  };
}

// Read posts + pages (and their terms) from a WordPress database.
export async function fetchWPFromDB(dbUrl, { prefix = "wp_", drafts = false, connect = defaultConnect } = {}) {
  validatePrefix(prefix);
  const statuses = (drafts ? ["publish", "draft", "pending", "private", "future"] : ["publish"]).map((s) => `'${s}'`).join(","); // fixed allowlist, safe
  const conn = await connect(dbUrl);
  try {
    const posts = await conn.query(
      `SELECT ID, post_title, post_name, post_content, post_status, post_type, post_date FROM \`${prefix}posts\` WHERE post_type IN ('post','page') AND post_status IN (${statuses})`,
    );
    const terms = await conn.query(
      `SELECT tr.object_id AS object_id, tt.taxonomy AS taxonomy, t.name AS name FROM \`${prefix}term_relationships\` tr` +
        ` JOIN \`${prefix}term_taxonomy\` tt ON tr.term_taxonomy_id = tt.term_taxonomy_id` +
        ` JOIN \`${prefix}terms\` t ON tt.term_id = t.term_id WHERE tt.taxonomy IN ('category','post_tag')`,
    );
    return rowsToItems(posts, terms);
  } finally {
    await conn.end?.();
  }
}

export async function runImportFromDB(dbUrl, opts = {}) {
  return transform(await fetchWPFromDB(dbUrl, opts), opts);
}
