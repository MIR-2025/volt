// memory.js — in-memory store. The zero-dependency dev fallback so the app
// runs out of the box; data is lost on restart. Same interface as the real
// MongoDB / MySQL / Postgres adapters.

export function createMemoryStore() {
  const tokens = new Map(); // token -> { token, email, ua, expiresAt, used }
  const sessions = new Map(); // id -> { id, email, expiresAt }
  const messages = []; // { id, email, body, createdAt }

  return {
    name: "memory",
    async init() {},

    async putToken(t) {
      tokens.set(t.token, { ...t, used: false });
    },
    async getToken(token) {
      return tokens.get(token) || null;
    },
    async useToken(token) {
      const t = tokens.get(token);
      if (t) t.used = true;
    },

    async putSession(s) {
      sessions.set(s.id, s);
    },
    async getSession(id) {
      const s = sessions.get(id);
      if (!s) return null;
      if (s.expiresAt < Date.now()) {
        sessions.delete(id);
        return null;
      }
      return s;
    },
    async delSession(id) {
      sessions.delete(id);
    },

    async addMessage(m) {
      messages.push(m);
      return m;
    },
    async listMessages(limit = 100) {
      return messages.slice(-limit);
    },
  };
}
