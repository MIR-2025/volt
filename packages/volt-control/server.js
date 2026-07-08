// server.js — volt-control. The hosting control plane API. Zero-dep (node:http).
//
//   POST /auth/request {email}                 → magic link (logged; real: emailed)
//   GET  /auth/verify?token=…                   → sets a session cookie
//   POST /auth/logout                           → clears it
//   GET  /me                                    → account + plan + site count
//   POST /sites {name}                          → provision a site (dir + record)
//   GET  /sites                                 → your sites
//   GET  /sites/:id                             → site + domains + storage usage
//   POST /sites/:id/publish                     → run volt-publish for the site
//   POST /sites/:id/domains {domain}            → add a custom domain (→ TXT to add)
//   POST /sites/:id/domains/:domain/verify      → confirm TXT → write DOMAINS_MAP
//   POST /billing/upgrade {plan}                → Stripe checkout (stub) / dev upgrade
//
// Stubbed for MVP: email delivery (link is logged), Stripe (dev upgrade when no key).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { makeStore } from "./lib/store.js";
import { PLANS, planOf } from "./lib/plans.js";
import { token, slugify, uniqueSiteId } from "./lib/ids.js";
import { makeResolver, verifyTxt } from "./lib/domains.js";

const env = process.env;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const PORT = Number(env.PORT || 26709);
const DATA_DIR = path.resolve(env.DATA_DIR || "./data");
const SITES_ROOT = path.resolve(env.SITES_ROOT || "./sites");
const PROJECTS_ROOT = path.resolve(env.PROJECTS_ROOT || "./projects");
const DOMAINS_MAP = path.resolve(env.DOMAINS_MAP || "./domains.json");
const TENANT_DOMAIN = env.TENANT_DOMAIN || "vsites.app";
const PUBLISH_WORKER = env.PUBLISH_WORKER || path.join(HERE, "..", "volt-publish", "worker.js");
const BASE_URL = env.BASE_URL || `http://localhost:${PORT}`;

const store = makeStore(DATA_DIR);
const resolveTxt = makeResolver(env);
const nowISO = () => new Date().toISOString();

// ── helpers ──────────────────────────────────────────────────────────────────
const json = (res, code, obj, headers = {}) => {
  const b = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(b), ...headers });
  res.end(b);
};
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || "").split(";").map((s) => s.trim()).filter(Boolean).map((s) => { const i = s.indexOf("="); return [s.slice(0, i), decodeURIComponent(s.slice(i + 1))]; }));
async function readBody(req) { const ch = []; for await (const c of req) ch.push(c); if (!ch.length) return {}; try { return JSON.parse(Buffer.concat(ch).toString()); } catch { return {}; } }
const userOf = (req) => { const sid = cookies(req).volt_sess; const s = sid && store.get("sessions", sid); return s ? store.get("users", s.userId) : null; };
function ownedSite(req, id) { const user = userOf(req); if (!user) return { err: 401 }; const site = store.get("sites", id); if (!site || site.userId !== user.id) return { err: 404 }; return { user, site }; }
function writeDomainsMap() {
  const map = {};
  for (const d of store.all("domains")) if (d.status === "verified") map[d.domain] = d.siteId;
  fs.mkdirSync(path.dirname(DOMAINS_MAP), { recursive: true });
  fs.writeFileSync(DOMAINS_MAP, JSON.stringify(map, null, 2));
  return Object.keys(map).length;
}

// ── router ───────────────────────────────────────────────────────────────────
const routes = [];
const on = (m, p, h) => routes.push({ m, parts: p.split("/"), h });
function match(method, pathname) {
  const parts = pathname.split("/");
  for (const r of routes) {
    if (r.m !== method || r.parts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (r.parts[i].startsWith(":")) params[r.parts[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (r.parts[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { h: r.h, params };
  }
  return null;
}

// ── routes ───────────────────────────────────────────────────────────────────
on("GET", "/health", (_req, res) => json(res, 200, { ok: true, plans: Object.keys(PLANS), tenantDomain: TENANT_DOMAIN }));

on("POST", "/auth/request", async (req, res) => {
  const { email } = await readBody(req);
  const e = String(email || "").toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return json(res, 400, { ok: false, error: "valid email required" });
  let user = store.find("users", (u) => u.email === e)[0];
  if (!user) user = store.put("users", token(8), { email: e, plan: "free", createdAt: nowISO() });
  const lt = token(24);
  store.put("logintokens", lt, { userId: user.id, exp: Date.now() + 15 * 60 * 1000 });
  const link = `${BASE_URL}/auth/verify?token=${lt}`;
  console.log(`[auth] magic link for ${e}: ${link}`); // real: send via SMTP
  json(res, 200, { ok: true, sent: true, devLink: env.NODE_ENV === "production" ? undefined : link });
});

on("GET", "/auth/verify", (req, res) => {
  const lt = new URL(req.url, "http://x").searchParams.get("token");
  const rec = lt && store.get("logintokens", lt);
  if (!rec || rec.exp < Date.now()) return json(res, 400, { ok: false, error: "invalid or expired link" });
  store.del("logintokens", lt);
  const sid = token(24);
  store.put("sessions", sid, { userId: rec.userId, createdAt: nowISO() });
  json(res, 200, { ok: true, userId: rec.userId }, { "Set-Cookie": `volt_sess=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000` });
});

on("POST", "/auth/logout", (req, res) => {
  const sid = cookies(req).volt_sess;
  if (sid) store.del("sessions", sid);
  json(res, 200, { ok: true }, { "Set-Cookie": "volt_sess=; HttpOnly; Path=/; Max-Age=0" });
});

on("GET", "/me", (req, res) => {
  const user = userOf(req);
  if (!user) return json(res, 401, { ok: false, error: "sign in" });
  const sites = store.find("sites", (s) => s.userId === user.id);
  json(res, 200, { ok: true, user: { id: user.id, email: user.email, plan: user.plan }, plan: planOf(user), sites: sites.length });
});

on("POST", "/sites", async (req, res) => {
  const user = userOf(req);
  if (!user) return json(res, 401, { ok: false, error: "sign in" });
  const { name } = await readBody(req);
  if (!name || !String(name).trim()) return json(res, 400, { ok: false, error: "name required" });
  const plan = planOf(user);
  const mine = store.find("sites", (s) => s.userId === user.id);
  if (mine.length >= plan.sites) return json(res, 402, { ok: false, error: `plan limit reached: ${plan.sites} sites — upgrade for more` });
  const siteId = uniqueSiteId(slugify(name), (id) => !!store.get("sites", id));
  const dir = path.join(SITES_ROOT, siteId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html><meta charset="utf-8"><title>${siteId}</title><h1>${siteId} is live</h1><p>Publish your Volt project to replace this placeholder.</p>`);
  const site = store.put("sites", siteId, { userId: user.id, name: String(name), status: "active", createdAt: nowISO() });
  json(res, 201, { ok: true, siteId, url: `https://${siteId}.${TENANT_DOMAIN}`, site });
});

on("GET", "/sites", (req, res) => {
  const user = userOf(req);
  if (!user) return json(res, 401, { ok: false, error: "sign in" });
  json(res, 200, { ok: true, sites: store.find("sites", (s) => s.userId === user.id) });
});

on("GET", "/sites/:id", async (req, res, { id }) => {
  const { err, user, site } = ownedSite(req, id);
  if (err) return json(res, err, { ok: false, error: err === 401 ? "sign in" : "not found" });
  let usage = null;
  if (env.IMAGE_HOST_URL && env.IMAGE_HOST_TOKEN) {
    try {
      const r = await fetch(`${env.IMAGE_HOST_URL.replace(/\/+$/, "")}/usage/${site.id}`, { headers: { Authorization: `Bearer ${env.IMAGE_HOST_TOKEN}` } });
      if (r.ok) usage = await r.json();
    } catch { /* best effort */ }
  }
  json(res, 200, { ok: true, site, plan: planOf(user), domains: store.find("domains", (d) => d.siteId === site.id), usage });
});

on("POST", "/sites/:id/publish", (req, res, { id }) => {
  const { err, site } = ownedSite(req, id);
  if (err) return json(res, err, { ok: false });
  const projectDir = path.join(PROJECTS_ROOT, site.id);
  if (!fs.existsSync(path.join(projectDir, "server.js"))) return json(res, 400, { ok: false, error: `no Volt project at PROJECTS_ROOT/${site.id}` });
  const child = spawn("node", [PUBLISH_WORKER, projectDir, "--site", site.id, "--out", SITES_ROOT], { env: { ...env }, stdio: "ignore", detached: true });
  child.unref();
  store.put("sites", site.id, { lastPublishAt: nowISO() });
  json(res, 202, { ok: true, building: true, siteId: site.id });
});

on("POST", "/sites/:id/domains", async (req, res, { id }) => {
  const { err, user, site } = ownedSite(req, id);
  if (err) return json(res, err, { ok: false });
  const plan = planOf(user);
  if (plan.customDomains <= 0) return json(res, 402, { ok: false, error: "custom domains are a paid feature — upgrade" });
  const { domain } = await readBody(req);
  const d = String(domain || "").toLowerCase().trim();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) || d.length > 253) return json(res, 400, { ok: false, error: "invalid domain" });
  if (store.get("domains", d)) return json(res, 409, { ok: false, error: "domain already registered" });
  if (store.find("domains", (x) => x.siteId === site.id).length >= plan.customDomains) return json(res, 402, { ok: false, error: `plan limit: ${plan.customDomains} custom domains` });
  const tok = "volt-verify=" + token(16);
  store.put("domains", d, { domain: d, siteId: site.id, status: "pending", token: tok, createdAt: nowISO() });
  json(res, 201, { ok: true, domain: d, status: "pending", verify: { type: "TXT", host: `_volt-verify.${d}`, value: tok }, cname: { host: d, points: `cname.${TENANT_DOMAIN}` } });
});

on("POST", "/sites/:id/domains/:domain/verify", async (req, res, { id, domain }) => {
  const { err, site } = ownedSite(req, id);
  if (err) return json(res, err, { ok: false });
  const d = String(domain).toLowerCase();
  const rec = store.get("domains", d);
  if (!rec || rec.siteId !== site.id) return json(res, 404, { ok: false, error: "domain not found" });
  if (rec.status === "verified") return json(res, 200, { ok: true, verified: true, already: true });
  if (!(await verifyTxt(d, rec.token, resolveTxt))) return json(res, 422, { ok: false, verified: false, error: `TXT _volt-verify.${d} not found or wrong value` });
  store.put("domains", d, { status: "verified", verifiedAt: nowISO() });
  json(res, 200, { ok: true, verified: true, domainsMapEntries: writeDomainsMap() });
});

on("POST", "/billing/upgrade", async (req, res) => {
  const user = userOf(req);
  if (!user) return json(res, 401, { ok: false });
  const { plan } = await readBody(req);
  if (!PLANS[plan]) return json(res, 400, { ok: false, error: "unknown plan" });
  if (env.STRIPE_SECRET_KEY) return json(res, 501, { ok: false, error: "Stripe checkout not wired in this MVP — add a Checkout session + webhook" });
  store.put("users", user.id, { plan }); // dev/self-host upgrade (no Stripe configured)
  json(res, 200, { ok: true, plan, note: "dev upgrade — no Stripe configured" });
});

// ── serve ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    const m = match(req.method, req.url.split("?")[0]);
    if (!m) return json(res, 404, { ok: false, error: "not found" });
    await m.h(req, res, m.params);
  } catch (e) {
    if (!res.headersSent) json(res, 500, { ok: false, error: e.message });
    console.warn("control error:", e.message);
  }
});
server.listen(PORT, () => console.log(`volt-control on :${PORT} — data ${DATA_DIR}, sites → ${SITES_ROOT}, tenant *.${TENANT_DOMAIN}`));
