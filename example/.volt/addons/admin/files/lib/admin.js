// admin.js — opt-in, role-gated web admin (data browser) for the running app.
// This is the ONE deliberately-persistent privileged surface in Volt, for
// browser-only admins. Every route requires a session AND membership in the
// ADMIN_EMAILS allowlist. Internal collections (auth tokens/sessions) are hidden.
// Prefer `npm run dev -- --studio` (ephemeral) unless you truly need this.

import express from "express";

const HIDDEN = new Set(["auth_tokens", "auth_sessions", "__voltcheck"]);
const visible = (n) => n && !HIDDEN.has(n);

export function adminRouter({ store, requireAuth, adminEmails }) {
  const allow = new Set((adminEmails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean));
  const isAdmin = (email) => allow.has(String(email || "").toLowerCase());

  const r = express.Router();
  r.use(requireAuth); // must be signed in for anything under /admin/api

  // any signed-in user may ask whether *they* are an admin (drives the UI)
  r.get("/admin/api/me", (req, res) => res.json({ email: req.user.email, isAdmin: isAdmin(req.user.email) }));

  // everything below is admins-only
  r.use((req, res, next) => (isAdmin(req.user.email) ? next() : res.status(403).json({ ok: false, error: "Admins only." })));

  r.get("/admin/api/collections", async (_req, res) => {
    const all = (await store.collections()) || [];
    res.json({ driver: store.name, collections: all.filter(visible) });
  });
  r.get("/admin/api/collection", async (req, res) => {
    const name = String(req.query.name || "");
    if (!visible(name)) return res.status(403).json({ ok: false, error: "hidden" });
    res.json({ ok: true, name, docs: (await store.collection(name).all()).slice(0, 500) });
  });
  r.delete("/admin/api/doc", async (req, res) => {
    const name = String(req.query.name || "");
    const id = String(req.query.id || "");
    if (!visible(name)) return res.status(403).json({ ok: false, error: "hidden" });
    if (!id) return res.status(400).json({ ok: false, error: "missing id" });
    await store.collection(name).delete(id);
    res.json({ ok: true });
  });

  return r;
}
