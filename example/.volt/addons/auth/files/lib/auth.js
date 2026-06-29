// auth.js — passwordless magic-link login (no passwords), per the house auth
// convention: submit email → one-time token + UA stored, link emailed →
// opening the link shows a confirm page (same browser) → confirm starts a
// session cookie. Tokens are single-use and expire. Needs the `db` and
// `mailer` add-ons (store.collection + mailer.send).

import crypto from "node:crypto";
import express from "express";

const TOKEN_TTL = 15 * 60 * 1000; // 15 minutes
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_COOKIE = "volt_sid";

const token = () => crypto.randomBytes(32).toString("hex");
const normalize = (e) => String(e || "").trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i !== -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function sessionFromReq(store, req) {
  const sid = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!sid) return null;
  const s = await store.collection("auth_sessions").get(sid);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    await store.collection("auth_sessions").delete(sid);
    return null;
  }
  return s;
}

export function requireAuth(store) {
  return async (req, res, next) => {
    const session = await sessionFromReq(store, req);
    if (!session) return res.status(401).json({ ok: false, error: "Sign in first." });
    req.user = session;
    next();
  };
}

const confirmPage = (tok) => `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Confirm login</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
<style>body{background:#0f1115;color:#e7e9ee}.card-x{background:#161a22;border:1px solid #232a36;border-radius:14px}.accent{color:#ffd24a}</style>
</head><body><main class="container py-5" style="max-width:480px">
<div class="card-x p-4 text-center">
  <h1 class="h5 mb-3"><span class="accent">Confirm login</span></h1>
  <p class="text-muted">Open in the same browser you requested the link from.</p>
  <button id="b" class="btn btn-primary w-100">Confirm login</button>
  <p id="s" class="mt-3 mb-0 small text-muted"></p>
</div></main><script>
const t=${JSON.stringify(tok)},b=document.getElementById("b"),s=document.getElementById("s");
b.onclick=async()=>{b.disabled=true;s.textContent="Confirming…";
try{const r=await fetch("/api/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})});
const d=await r.json();if(d.ok){location.href="/";}else{s.textContent=d.error||"Failed.";b.disabled=false;}}
catch{s.textContent="Network error.";b.disabled=false;}};
</script></body></html>`;

export function authRouter({ store, mailer }) {
  const tokens = store.collection("auth_tokens");
  const sessions = store.collection("auth_sessions");
  const router = express.Router();
  router.use(express.json());

  router.post("/api/login", async (req, res) => {
    const email = normalize(req.body?.email);
    if (!validEmail(email)) return res.status(400).json({ ok: false, error: "Enter a valid email." });
    const tok = token();
    await tokens.put(tok, { email, ua: req.headers["user-agent"] || "", expiresAt: Date.now() + TOKEN_TTL, used: false });
    const link = `${req.protocol}://${req.get("host")}/verify?token=${tok}`;
    await mailer.send({
      to: email,
      subject: "Your login link",
      text: `Sign in: ${link}\n\nExpires shortly, single use.`,
      html: `<p>Sign in: <a href="${link}">${link}</a></p>`,
    });
    res.json({ ok: true, dev: mailer.name === "console" });
  });

  router.get("/verify", (req, res) => res.type("html").send(confirmPage(String(req.query.token || ""))));

  router.post("/api/confirm", async (req, res) => {
    const rec = await tokens.get(String(req.body?.token || ""));
    if (!rec) return res.status(400).json({ ok: false, error: "Invalid link." });
    if (rec.used) return res.status(400).json({ ok: false, error: "Link already used." });
    if (rec.expiresAt < Date.now()) return res.status(400).json({ ok: false, error: "Link expired." });
    const ua = req.headers["user-agent"] || "";
    if (rec.ua && ua && rec.ua !== ua) return res.status(400).json({ ok: false, error: "Open the link in the same browser." });

    await tokens.put(rec.id, { ...rec, used: true });
    const sid = token();
    await sessions.put(sid, { email: rec.email, expiresAt: Date.now() + SESSION_TTL });
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}`,
    );
    res.json({ ok: true, email: rec.email });
  });

  router.post("/api/logout", async (req, res) => {
    const session = await sessionFromReq(store, req);
    if (session) await sessions.delete(session.id);
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
    res.json({ ok: true });
  });

  router.get("/api/me", async (req, res) => {
    const session = await sessionFromReq(store, req);
    res.json({ email: session?.email || null });
  });

  return router;
}
