// index.js (volt-addon-admin) — a secure, web-based admin for the LIVE site, so an
// owner who can't SSH in can still manage content + media (the WordPress convenience,
// without WordPress's attack surface).
//
// Fail-closed: mounts only when ADMIN_PATH + ADMIN_EMAIL are set. Login is a
// magic link, hardened well past the usual:
//   • one-time nonce        — single-use, expiring, 256-bit
//   • same-browser binding  — a random "challenge" cookie is planted in the browser
//                             that REQUESTED the link; clicking the link must present
//                             it. A different browser/device has no such cookie → denied.
//   • device fingerprint    — user-agent + accept-language + accept-encoding is hashed
//                             at request time and re-checked on click (defence in depth).
// Sessions are signed (HMAC), stateless cookies. Needs the `mailer` add-on to send links.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const NONCE_TTL = 15 * 60 * 1000; // 15 min
const SESSION_TTL = 12 * 60 * 60 * 1000; // 12 h
const RL_MAX = 5; // link requests
const RL_WINDOW = 15 * 60 * 1000; // per 15 min per IP

const b64 = (b) => Buffer.from(b).toString("base64url");
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const rand = () => crypto.randomBytes(32).toString("hex");
const eq = (a, b) => {
  const A = Buffer.from(String(a)),
    B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fingerprint = (req) => sha([req.headers["user-agent"] || "", req.headers["accept-language"] || "", req.headers["accept-encoding"] || ""].join("|"));
function parseCookies(header = "") {
  const out = {};
  for (const part of String(header).split(";")) {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function register({ app, express, mailer, env, log }) {
  const raw = String(env.ADMIN_PATH || "").trim().replace(/^\/+|\/+$/g, "");
  const adminEmail = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!raw) return log("ADMIN_PATH not set — web admin disabled (fail-closed).");
  if (!adminEmail) return log("ADMIN_EMAIL not set — web admin disabled (fail-closed).");
  if (!mailer) return log("web admin needs the mailer add-on (to send magic links) — disabled.");
  const base = "/" + raw;
  const secret = String(env.ADMIN_SECRET || "").trim() || rand();
  if (!String(env.ADMIN_SECRET || "").trim()) log("ADMIN_SECRET not set — using an ephemeral key (sessions reset on restart). Set ADMIN_SECRET to persist.");

  const nonces = new Map(); // nonce -> { chalHash, fp, exp, used }
  const rl = new Map(); // ip -> { n, reset }
  const sweep = () => {
    const t = Date.now();
    for (const [k, v] of nonces) if (v.exp < t) nonces.delete(k);
  };

  const secureAttr = (req) => (req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "");
  const CHAL = "volt_admin_chal";
  const SESS = "volt_admin";
  const sign = (email) => {
    const p = b64(JSON.stringify({ email, exp: Date.now() + SESSION_TTL }));
    return p + "." + b64(crypto.createHmac("sha256", secret).update(p).digest());
  };
  const sessionOf = (req) => {
    const c = parseCookies(req.headers.cookie)[SESS];
    if (!c || c.indexOf(".") < 0) return null;
    const [p, sig] = c.split(".");
    if (!eq(sig, b64(crypto.createHmac("sha256", secret).update(p).digest()))) return null;
    try {
      const d = JSON.parse(Buffer.from(p, "base64url").toString());
      return d.exp > Date.now() ? d : null;
    } catch {
      return null;
    }
  };

  // ── login form (unauthenticated) ────────────────────────────────────────
  app.get(base, (req, res) => {
    const s = sessionOf(req);
    res.type("html").send(s ? adminPage(base, s.email) : loginPage(base));
  });

  // ── request a link: rate-limited, plants the challenge cookie, emails only
  //    if the address is the configured admin (no account enumeration) ──────
  app.post(base + "/request", express.json(), async (req, res) => {
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const now = Date.now();
    const r = rl.get(ip) || { n: 0, reset: now + RL_WINDOW };
    if (r.reset < now) {
      r.n = 0;
      r.reset = now + RL_WINDOW;
    }
    if (++r.n > RL_MAX) {
      rl.set(ip, r);
      return res.status(429).json({ ok: false, error: "Too many requests — try again later." });
    }
    rl.set(ip, r);

    const chal = rand();
    // Always plant a challenge cookie (identical response whether or not the email
    // matched) so an observer can't tell if the address is the admin.
    res.setHeader("Set-Cookie", `${CHAL}=${chal}; HttpOnly; SameSite=Lax; Path=${base}; Max-Age=${NONCE_TTL / 1000}${secureAttr(req)}`);

    const email = String(req.body?.email || "").trim().toLowerCase();
    if (email === adminEmail) {
      sweep();
      const nonce = rand();
      nonces.set(nonce, { chalHash: sha(chal), fp: fingerprint(req), exp: now + NONCE_TTL, used: false });
      const link = `${req.protocol}://${req.get("host")}${base}/verify?nonce=${nonce}`;
      try {
        await mailer.send({
          to: adminEmail,
          subject: "Your admin sign-in link",
          text: `Sign in to the admin: ${link}\n\nOpen it in THIS browser. Single use, expires in 15 minutes. If you didn't request this, ignore it.`,
          html: `<p>Sign in to the admin: <a href="${link}">${link}</a></p><p>Open it in <b>this</b> browser. Single use, expires in 15 minutes.</p>`,
        });
      } catch (e) {
        log("failed to send admin link:", e.message);
      }
    }
    res.json({ ok: true }); // same response regardless
  });

  // ── click target (same browser): validate, then show a confirm button. GET
  //    never consumes the nonce (email-scanner prefetch can't burn the link). ─
  app.get(base + "/verify", (req, res) => {
    const rec = nonces.get(String(req.query.nonce || ""));
    const bad = (msg) => res.status(400).type("html").send(notePage(base, msg));
    if (!rec || rec.used || rec.exp < Date.now()) return bad("This link is invalid, used, or expired. Request a new one.");
    const chal = parseCookies(req.headers.cookie)[CHAL];
    if (!chal || !eq(sha(chal), rec.chalHash)) return bad("Open the link in the same browser you requested it from.");
    if (!eq(fingerprint(req), rec.fp)) return bad("This device doesn't match the one that requested the link.");
    res.type("html").send(confirmPage(base, String(req.query.nonce)));
  });

  // ── confirm (POST, same browser): consume the nonce, issue the session ────
  app.post(base + "/confirm", express.json(), (req, res) => {
    const rec = nonces.get(String(req.body?.nonce || ""));
    if (!rec || rec.used || rec.exp < Date.now()) return res.status(400).json({ ok: false, error: "Invalid or expired link." });
    const chal = parseCookies(req.headers.cookie)[CHAL];
    if (!chal || !eq(sha(chal), rec.chalHash)) return res.status(400).json({ ok: false, error: "Open the link in the same browser you requested it from." });
    if (!eq(fingerprint(req), rec.fp)) return res.status(400).json({ ok: false, error: "Device fingerprint mismatch." });
    rec.used = true;
    res.setHeader("Set-Cookie", [
      `${SESS}=${sign(adminEmail)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}${secureAttr(req)}`,
      `${CHAL}=; HttpOnly; Path=${base}; Max-Age=0`,
    ]);
    res.json({ ok: true, redirect: base });
  });

  app.post(base + "/logout", (req, res) => {
    res.setHeader("Set-Cookie", `${SESS}=; HttpOnly; Path=/; Max-Age=0`);
    res.json({ ok: true });
  });

  // ── authed media management (live) ───────────────────────────────────────
  const guard = (req, res, next) => (sessionOf(req) ? next() : res.status(401).json({ ok: false, error: "Sign in first." }));
  const mediaDir = path.join(process.cwd(), "public", "media");
  app.get(base + "/api/media", guard, (_req, res) => {
    let items = [];
    try {
      items = fs
        .readdirSync(mediaDir)
        .filter((f) => !f.startsWith("."))
        .map((f) => ({ name: f, url: "/media/" + f, size: fs.statSync(path.join(mediaDir, f)).size }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      /* none yet */
    }
    res.json({ items });
  });
  app.post(base + "/api/media/upload", guard, (req, res) => {
    const name = String(req.query.name || "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 120);
    if (!name || !/\.[A-Za-z0-9]+$/.test(name)) return res.status(400).json({ ok: false, error: "bad filename" });
    fs.mkdirSync(mediaDir, { recursive: true });
    const chunks = [];
    let size = 0,
      tooBig = false;
    req.on("data", (c) => {
      if (tooBig) return;
      size += c.length;
      if (size > 100 * 1024 * 1024) tooBig = true;
      else chunks.push(c);
    });
    req.on("end", () => {
      if (tooBig) return res.status(413).json({ ok: false, error: "file too large (max 100MB)" });
      try {
        fs.writeFileSync(path.join(mediaDir, name), Buffer.concat(chunks));
        res.json({ ok: true, url: "/media/" + name, name });
      } catch (e) {
        res.status(400).json({ ok: false, error: e.message });
      }
    });
  });
  app.post(base + "/api/media/delete", guard, express.json(), (req, res) => {
    const name = String(req.body?.name || "");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return res.status(400).json({ ok: false, error: "bad name" });
    try {
      const f = path.join(mediaDir, name);
      if (fs.existsSync(f)) fs.unlinkSync(f);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  log(`web admin at ${base} — magic-link (nonce + same-browser + fingerprint), for ${adminEmail}`);
}

// ── pages (self-contained, Bootstrap from CDN) ─────────────────────────────
const shell = (title, body) => `<!doctype html><html lang="en" data-bs-theme="dark"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>${esc(title)}</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" /></head>
<body class="bg-body"><main class="container py-5" style="max-width:900px">${body}</main></body></html>`;

const loginPage = (base) =>
  shell(
    "Admin sign-in",
    `<div class="card mx-auto" style="max-width:440px"><div class="card-body p-4">
  <h1 class="h5 mb-3">Admin sign-in</h1>
  <p class="text-secondary small">Enter the admin email. We'll send a one-time link — open it in <b>this</b> browser.</p>
  <form id="f"><input id="e" type="email" class="form-control mb-2" placeholder="you@example.com" autocomplete="email" required />
  <button class="btn btn-primary w-100">Email me a link</button></form>
  <p id="s" class="small mt-3 mb-0 text-secondary"></p></div></div>
<script>const f=document.getElementById("f"),s=document.getElementById("s");
f.onsubmit=async(ev)=>{ev.preventDefault();s.textContent="Sending…";
try{await fetch(${JSON.stringify(base + "/request")},{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:document.getElementById("e").value})});
s.textContent="If that's the admin address, a link is on its way. Open it in this browser.";}catch{s.textContent="Network error.";}};</script>`
  );

const confirmPage = (base, nonce) =>
  shell(
    "Confirm sign-in",
    `<div class="card mx-auto text-center" style="max-width:440px"><div class="card-body p-4">
  <h1 class="h5 mb-3">Confirm sign-in</h1>
  <p class="text-secondary small">Same browser confirmed. Click to finish.</p>
  <button id="b" class="btn btn-primary w-100">Confirm</button>
  <p id="s" class="small mt-3 mb-0 text-secondary"></p></div></div>
<script>const b=document.getElementById("b"),s=document.getElementById("s");
b.onclick=async()=>{b.disabled=true;s.textContent="Signing in…";
try{const r=await fetch(${JSON.stringify(base + "/confirm")},{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nonce:${JSON.stringify(nonce)}})});
const d=await r.json();if(d.ok){location.href=d.redirect;}else{s.textContent=d.error||"Failed.";b.disabled=false;}}catch{s.textContent="Network error.";b.disabled=false;}};</script>`
  );

const notePage = (base, msg) =>
  shell("Admin", `<div class="card mx-auto text-center" style="max-width:440px"><div class="card-body p-4"><h1 class="h6 mb-2">Sign-in</h1><p class="text-secondary">${esc(msg)}</p><a class="btn btn-outline-secondary btn-sm" href="${base}">Back to sign-in</a></div></div>`);

const adminPage = (base, email) =>
  shell(
    "Admin",
    `<div class="d-flex justify-content-between align-items-center mb-4">
  <h1 class="h5 mb-0">Site admin</h1>
  <div class="small text-secondary">${esc(email)} · <a href="#" id="lo">sign out</a></div></div>
<div class="card"><div class="card-header">Media library</div><div class="card-body">
  <input id="up" type="file" class="form-control mb-2" accept="image/*,video/*" multiple />
  <p class="small text-secondary">Uploads go to <code>public/media/</code>, served at <code>/media/&lt;name&gt;</code>.</p>
  <div id="grid" class="row row-cols-2 row-cols-md-4 g-3"></div></div></div>
<p class="small text-secondary mt-3">Content editing mounts here next — this is the secure shell.</p>
<script>
const B=${JSON.stringify(base)},grid=document.getElementById("grid");
const kb=n=>n<1024?n+" B":n<1048576?Math.round(n/1024)+" KB":(n/1048576).toFixed(1)+" MB";
const isImg=n=>/\\.(png|jpe?g|gif|webp|svg|avif)$/i.test(n),isVid=n=>/\\.(mp4|webm|mov|ogg)$/i.test(n);
async function load(){const d=await (await fetch(B+"/api/media")).json();grid.innerHTML="";(d.items||[]).forEach(m=>{
const col=document.createElement("div");col.className="col";
col.innerHTML='<div class="card h-100"><div class="ratio ratio-4x3 bg-dark rounded-top overflow-hidden">'+
(isImg(m.name)?'<img src="'+m.url+'" class="object-fit-cover">':isVid(m.name)?'<video src="'+m.url+'" muted class="object-fit-cover"></video>':'<div class="d-flex align-items-center justify-content-center text-secondary small">'+m.name.split(".").pop()+'</div>')+
'</div><div class="card-body p-2"><div class="small text-truncate" title="'+m.name+'">'+m.name+'</div><div class="small text-secondary mb-2">'+kb(m.size)+'</div>'+
'<div class="btn-group btn-group-sm w-100"><button class="btn btn-outline-secondary cp">Copy URL</button><button class="btn btn-outline-danger del">✕</button></div></div></div>';
col.querySelector(".cp").onclick=()=>navigator.clipboard&&navigator.clipboard.writeText(location.origin+m.url);
col.querySelector(".del").onclick=async()=>{if(confirm("Delete "+m.name+"?")){await fetch(B+"/api/media/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:m.name})});load();}};
grid.appendChild(col);});}
document.getElementById("up").onchange=async e=>{for(const f of e.target.files){await fetch(B+"/api/media/upload?name="+encodeURIComponent(f.name),{method:"POST",body:f});}e.target.value="";load();};
document.getElementById("lo").onclick=async ev=>{ev.preventDefault();await fetch(B+"/logout",{method:"POST"});location.href=B;};
load();
</script>`
  );
