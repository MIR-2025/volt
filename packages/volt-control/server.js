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
import crypto from "node:crypto";
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
const SITE_ORIGIN = env.SITE_ORIGIN || BASE_URL.replace(/\/api\/?$/, ""); // the public site (host.voltjs.com)

const store = makeStore(DATA_DIR);
const resolveTxt = makeResolver(env);
const nowISO = () => new Date().toISOString();

// Send a magic-link email via SMTP (nodemailer, loaded lazily so the service runs
// without it in dev). Falls back to logging the link if SMTP isn't configured.
async function sendMagicLink(to, link) {
  if (!env.SMTP_HOST) { console.log(`[auth] (no SMTP) link for ${to}: ${link}`); return; }
  try {
    const { default: nodemailer } = await import("nodemailer");
    const t = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: /^(1|true|yes|on)$/i.test(env.SMTP_SECURE || ""),
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    await t.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to,
      subject: "Your Volt Hosting sign-in link",
      text: `Sign in to Volt Hosting:\n\n${link}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`,
      html: `<p>Sign in to Volt Hosting:</p><p><a href="${link}">${link}</a></p><p style="color:#888;font-size:13px">Expires in 15 minutes. If you didn't request this, ignore it.</p>`,
    });
    console.log(`[auth] emailed sign-in link to ${to}`);
  } catch (e) {
    console.warn(`[auth] email failed (${e.message}) — link for ${to}: ${link}`);
  }
}

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

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const confirmShell = (body) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm sign-in — Volt Hosting</title>` +
  `<style>body{font:16px/1.6 system-ui,-apple-system,sans-serif;max-width:440px;margin:12vh auto;padding:0 22px;color:#0f172a}` +
  `.btn{display:inline-block;background:#111;color:#fff;border:0;padding:.85rem 1.5rem;border-radius:10px;font-size:1rem;cursor:pointer;text-decoration:none}` +
  `.btn[disabled]{opacity:.5}.warn{background:#fef3c7;border:1px solid #f59e0b;padding:.7rem .9rem;border-radius:8px;font-size:.92rem;color:#92400e}` +
  `.ok{color:#15803d;font-size:.92rem}a{color:#2563eb}</style><body>${body}</body>`;
// The magic-link click lands here — it does NOT sign you in. It shows a device
// check + a "Continue" button; the session is only minted at /auth/confirm.
function confirmBody(user, lt, sameBrowser) {
  return (
    `<h1>Confirm sign-in</h1><p>Sign in to Volt Hosting as <b>${esc(user?.email || "")}</b>?</p>` +
    (sameBrowser
      ? `<p class="ok">✓ Same browser you requested the link from.</p>`
      : `<p class="warn">⚠ This link was requested in a different browser or device. For your security, open it in the browser you started the sign-in from.</p>`) +
    `<p style="margin-top:1.6rem"><button class="btn" id="go">Continue to login</button></p>` +
    `<p id="msg" style="color:#b91c1c;min-height:1.2em"></p>` +
    `<script>document.getElementById('go').onclick=async function(){this.disabled=true;` +
    `var r=await fetch('/api/auth/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:${JSON.stringify(lt)}})});` +
    `var d=await r.json();if(d.ok){location.href=d.redirect||'/dashboard';}else{document.getElementById('msg').textContent=d.error||'Could not sign in';this.disabled=false;}};</script>`
  );
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
  const dn = token(18); // device nonce — binds the link to THIS browser (enforced at /auth/confirm)
  store.put("logintokens", lt, { userId: user.id, exp: Date.now() + 15 * 60 * 1000, dn, ua: String(req.headers["user-agent"] || "").slice(0, 200) });
  const link = `${BASE_URL}/auth/verify?token=${lt}`;
  await sendMagicLink(e, link);
  json(res, 200, { ok: true, sent: true, devLink: env.NODE_ENV === "production" ? undefined : link }, {
    "Set-Cookie": `volt_dev=${dn}; HttpOnly; Path=/; SameSite=Lax; Max-Age=900${env.NODE_ENV === "production" ? "; Secure" : ""}`,
  });
});

on("GET", "/auth/verify", (req, res) => {
  // The magic-link click LANDS here but does not sign in — it renders a device
  // check + a "Continue to login" button. The session is minted at /auth/confirm.
  const lt = new URL(req.url, "http://x").searchParams.get("token");
  const rec = lt && store.get("logintokens", lt);
  const html = (body) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(confirmShell(body)); };
  if (!rec || rec.exp < Date.now()) return html(`<h1>Link expired</h1><p>This sign-in link is invalid or has expired. <a href="${SITE_ORIGIN}/signup">Request a new one</a>.</p>`);
  const user = store.get("users", rec.userId);
  const sameBrowser = !!cookies(req).volt_dev && cookies(req).volt_dev === rec.dn;
  html(confirmBody(user, lt, sameBrowser));
});

// The secondary step: only here is the session created, and only if the device
// nonce matches (same browser that requested the link) — enforced, not advisory.
on("POST", "/auth/confirm", async (req, res) => {
  const { token: lt } = await readBody(req);
  const rec = lt && store.get("logintokens", lt);
  if (!rec || rec.exp < Date.now()) return json(res, 400, { ok: false, error: "link expired — request a new one" });
  if (!cookies(req).volt_dev || cookies(req).volt_dev !== rec.dn) {
    return json(res, 403, { ok: false, error: "Open the link in the same browser you requested it from." });
  }
  store.del("logintokens", lt);
  const sid = token(24);
  store.put("sessions", sid, { userId: rec.userId, createdAt: nowISO(), ua: rec.ua });
  json(res, 200, { ok: true, redirect: `${SITE_ORIGIN}/dashboard` }, {
    "Set-Cookie": `volt_sess=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${env.NODE_ENV === "production" ? "; Secure" : ""}`,
  });
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
  // real Stripe Checkout when a secret key + a Pro price are configured
  if (env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID && plan === "pro") {
    try {
      const body = new URLSearchParams({
        mode: "subscription",
        "line_items[0][price]": env.STRIPE_PRICE_ID,
        "line_items[0][quantity]": "1",
        success_url: `${SITE_ORIGIN}/dashboard?upgraded=1`,
        cancel_url: `${SITE_ORIGIN}/pricing`,
        client_reference_id: user.id,
        customer_email: user.email,
      });
      const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const s = await r.json();
      if (s.url) return json(res, 200, { ok: true, checkoutUrl: s.url });
      return json(res, 502, { ok: false, error: (s.error && s.error.message) || "stripe error" });
    } catch (e) {
      return json(res, 502, { ok: false, error: "stripe: " + e.message });
    }
  }
  store.put("users", user.id, { plan }); // dev/self-host upgrade (no Stripe price configured)
  json(res, 200, { ok: true, plan, note: "dev upgrade — set STRIPE_PRICE_ID for real checkout" });
});

// Stripe webhook — verify the signature, then flip the plan on a completed checkout.
on("POST", "/webhooks/stripe", async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  const parts = Object.fromEntries(String(req.headers["stripe-signature"] || "").split(",").map((p) => p.split("=")));
  const expect = crypto.createHmac("sha256", env.STRIPE_WEBHOOK_SECRET || "x").update(`${parts.t}.${raw}`).digest("hex");
  const good = env.STRIPE_WEBHOOK_SECRET && parts.v1 && parts.v1.length === expect.length && crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expect));
  if (!good) return json(res, 400, { ok: false, error: "bad signature" });
  let evt;
  try { evt = JSON.parse(raw); } catch { return json(res, 400, { ok: false }); }
  if (evt.type === "checkout.session.completed") {
    const uid = evt.data?.object?.client_reference_id;
    if (uid && store.get("users", uid)) store.put("users", uid, { plan: "pro" });
  }
  json(res, 200, { received: true });
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
