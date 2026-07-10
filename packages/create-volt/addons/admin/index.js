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
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// md→html for loading markdown into the WYSIWYG editor (setHTML). marked is a
// pages/posts dep so it's present on any content site; lazy + guarded so a missing
// marked degrades to raw text instead of crashing the whole admin.
let _marked = null;
const md2html = async (md) => {
  if (!_marked) {
    try {
      _marked = (await import("marked")).marked;
    } catch {
      _marked = { parse: (s) => String(s) };
    }
  }
  return _marked.parse(String(md || ""));
};

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
// Client IP for the allowlist. Behind a reverse proxy this needs the proxy to set
// X-Real-IP / X-Forwarded-For from the real connection (and strip any client-supplied
// XFF), or it can be spoofed — see ADMIN_ALLOW_IPS in the docs.
const clientIp = (req) => String(req.headers["x-real-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket.remoteAddress || "").trim().replace(/^::ffff:/, "");
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
  const adminEmails = String(env.ADMIN_EMAIL || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean); // one or a comma-separated allowlist
  if (!raw) return log("ADMIN_PATH not set — web admin disabled (fail-closed).");
  if (!adminEmails.length) return log("ADMIN_EMAIL not set — web admin disabled (fail-closed).");
  if (!mailer) return log("web admin needs the mailer add-on (to send magic links) — disabled.");
  const base = "/" + raw;
  // Opt-in IP allowlist (ADMIN_ALLOW_IPS=comma,separated). Fail-closed with a plain
  // 404 so a blocked IP can't even tell the admin exists. Runs before every route.
  const allowIps = new Set(String(env.ADMIN_ALLOW_IPS || "").split(",").map((s) => s.trim()).filter(Boolean));
  if (allowIps.size) {
    app.use(base, (req, res, next) => {
      if (allowIps.has(clientIp(req))) return next();
      log(`blocked ${req.method} ${base} from ${clientIp(req)} (not in ADMIN_ALLOW_IPS)`);
      res.status(404).type("text/plain").send("Not found");
    });
  }
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
    const ip = clientIp(req);
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
    if (adminEmails.includes(email)) {
      sweep();
      const nonce = rand();
      nonces.set(nonce, { chalHash: sha(chal), fp: fingerprint(req), exp: now + NONCE_TTL, used: false, email });
      const link = `${req.protocol}://${req.get("host")}${base}/verify?nonce=${nonce}`;
      try {
        await mailer.send({
          to: email,
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
      `${SESS}=${sign(rec.email)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}${secureAttr(req)}`,
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

  // ── scoped server actions (a fixed whitelist of commands — NOT a shell) ──
  const ACTIONS = {
    update: ["npx", ["create-volt@latest", "update"]],
    pull: ["git", ["pull", "--ff-only"]],
  };
  app.post(base + "/api/action", guard, express.json(), (req, res) => {
    const name = String(req.body?.action || "");
    if (name === "restart") {
      res.json({ ok: true, restarting: true });
      log("restart requested via admin — exiting so the process manager (pm2/docker/systemd) relaunches");
      setTimeout(() => process.exit(0), 300);
      return;
    }
    const spec = ACTIONS[name]; // key lookup only — no user string ever reaches the shell
    if (!spec) return res.status(400).json({ ok: false, error: "unknown action" });
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.write(`$ ${spec[0]} ${spec[1].join(" ")}\n\n`);
    let child;
    try {
      child = spawn(spec[0], spec[1], { cwd: process.cwd(), shell: process.platform === "win32" });
    } catch (e) {
      return res.end(`\n[error] ${e.message}\n`);
    }
    child.stdout.on("data", (d) => res.write(d));
    child.stderr.on("data", (d) => res.write(d));
    child.on("error", (e) => res.end(`\n[error] ${e.message}\n`));
    child.on("close", (code) => res.end(`\n[exit ${code}]\n`));
  });

  // ── typography: fetch self-hosted fonts + set the live override (.volt/fonts.json) ──
  // No .env edit, no restart — the theme reads .volt/fonts.json per request, so a remote
  // owner (no shell) can retune fonts and see it on the next page load.
  const FONTS = [
    { slug: "inter", family: "Inter", cat: "Sans" }, { slug: "roboto", family: "Roboto", cat: "Sans" },
    { slug: "open-sans", family: "Open Sans", cat: "Sans" }, { slug: "work-sans", family: "Work Sans", cat: "Sans" },
    { slug: "nunito", family: "Nunito", cat: "Sans" }, { slug: "poppins", family: "Poppins", cat: "Display" },
    { slug: "montserrat", family: "Montserrat", cat: "Display" }, { slug: "merriweather", family: "Merriweather", cat: "Serif" },
    { slug: "lora", family: "Lora", cat: "Serif" }, { slug: "source-serif-4", family: "Source Serif 4", cat: "Serif" },
    { slug: "playfair-display", family: "Playfair Display", cat: "Serif" }, { slug: "jetbrains-mono", family: "JetBrains Mono", cat: "Mono" },
    { slug: "fira-code", family: "Fira Code", cat: "Mono" }, { slug: "ibm-plex-mono", family: "IBM Plex Mono", cat: "Mono" },
  ];
  app.get(base + "/api/fonts", guard, (_req, res) => {
    // Show the theme's EFFECTIVE fonts: the .env FONT_* base, overridden by a live
    // .volt/fonts.json (same precedence as the pages add-on's fontsCss). So the panel reflects
    // what the site actually uses — not just the live override, which is empty on a migrated app.
    const current = { heading: env.FONT_HEADING, subhead: env.FONT_SUBHEAD, body: env.FONT_BODY, mono: env.FONT_MONO };
    try {
      Object.assign(current, JSON.parse(fs.readFileSync(path.join(process.cwd(), ".volt", "fonts.json"), "utf8")));
    } catch {
      /* no live override */
    }
    for (const k of Object.keys(current)) if (!current[k]) delete current[k];
    res.json({ ok: true, fonts: FONTS, current });
  });
  app.post(base + "/api/fonts", guard, express.json(), async (req, res) => {
    try {
      const clean = {};
      const roles = req.body?.roles || {};
      for (const k of ["heading", "subhead", "body", "mono"]) {
        const v = String(roles[k] || "");
        if (v && FONTS.some((f) => f.slug === v)) clean[k] = v; // catalog whitelist guards the path/URL
      }
      const fontsDir = path.join(process.cwd(), "public", "fonts");
      for (const slug of [...new Set(Object.values(clean))]) {
        const dir = path.join(fontsDir, slug);
        fs.mkdirSync(dir, { recursive: true });
        for (const w of [400, 700]) {
          const file = path.join(dir, w + ".woff2");
          if (fs.existsSync(file)) continue;
          const r = await fetch(`https://cdn.jsdelivr.net/fontsource/fonts/${slug}@latest/latin-${w}-normal.woff2`);
          if (!r.ok) continue;
          fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
        }
      }
      fs.mkdirSync(path.join(process.cwd(), ".volt"), { recursive: true });
      fs.writeFileSync(path.join(process.cwd(), ".volt", "fonts.json"), JSON.stringify(clean, null, 2));
      res.json({ ok: true, applied: clean });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // ── home page: choose what "/" shows (WordPress "Reading" settings) ─────────
  // Writes HOMEPAGE to .env: posts (blog index) | <page-slug> (static front page) | "" (default
  // landing). Routing reads it at startup, so a change needs a Restart (the card says so).
  const envPath = path.join(process.cwd(), ".env");
  const readEnv = () => {
    try {
      return fs.readFileSync(envPath, "utf8");
    } catch {
      return "";
    }
  };
  const envValue = (env, key) => {
    const m = env.match(new RegExp(`^\\s*${key}\\s*=(.*)$`, "m"));
    return m ? m[1].trim() : "";
  };
  const listPages = () => {
    try {
      return fs
        .readdirSync(path.join(process.cwd(), "pages"))
        .filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "404.md")
        .map((f) => f.slice(0, -3))
        .sort();
    } catch {
      return [];
    }
  };
  const postsOn = () => envValue(readEnv(), "VOLT_ADDONS").split(",").map((s) => s.trim()).includes("posts");
  app.get(base + "/api/home", guard, (_req, res) => res.json({ ok: true, home: envValue(readEnv(), "HOMEPAGE"), pages: listPages(), posts: postsOn() }));
  app.post(base + "/api/home", guard, express.json(), (req, res) => {
    let val = String(req.body?.home || "").trim();
    if (val.toLowerCase() === "posts") {
      if (!postsOn()) return res.status(400).json({ ok: false, error: "the posts add-on isn't enabled" });
      val = "posts";
    } else if (val) {
      // a static front page — must be an existing page slug (whitelist guards the .env write)
      if (!/^[a-z0-9-]+$/i.test(val) || !listPages().includes(val)) return res.status(400).json({ ok: false, error: "no such page" });
    }
    let env = readEnv();
    const re = /^\s*HOMEPAGE\s*=.*$/m;
    if (val) env = re.test(env) ? env.replace(re, `HOMEPAGE=${val}`) : env.replace(/\n*$/, env ? "\n" : "") + `HOMEPAGE=${val}\n`;
    else env = env.replace(/^\s*HOMEPAGE\s*=.*$\n?/m, "");
    try {
      fs.writeFileSync(envPath, env);
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message });
    }
    res.json({ ok: true, home: val });
  });

  // ── rich editor asset: serve the base RTE (rte-rich-text-editor — no AI, no key) if installed ──
  // Fresh scaffolds get it via meta.json; existing sites pick it up on `create-volt update`.
  // If it isn't installed the client detects a missing window.RTE and falls back to a textarea.
  let rtePath = null;
  try {
    rtePath = require.resolve("rte-rich-text-editor");
  } catch {
    /* not installed → editor falls back to a plain markdown textarea */
  }
  app.get(base + "/rte.js", guard, (_req, res) =>
    rtePath
      ? res.type("application/javascript").sendFile(rtePath)
      : res.status(503).type("application/javascript").send("/* rte-rich-text-editor not installed — run: npm i rte-rich-text-editor */"),
  );

  // ── content: create / edit / delete pages + posts (the WordPress "edit my site" core) ──
  // Writes pages/<slug>.md · posts/<slug>.md; changes are live on the next page load (no restart).
  const cdir = (type) => path.join(process.cwd(), type === "posts" ? "posts" : "pages");
  const safeSlug = (s) => /^[a-z0-9][a-z0-9-]*$/i.test(String(s || ""));
  app.get(base + "/api/content", guard, (_req, res) => {
    const list = (type) => {
      try {
        return fs
          .readdirSync(cdir(type))
          .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
          .map((f) => {
            const slug = f.replace(/\.md$/, "");
            const title = (fs.readFileSync(path.join(cdir(type), f), "utf8").match(/^title:\s*(.+)$/m) || [])[1];
            return { slug, title: (title || slug).trim() };
          })
          .sort((a, b) => a.slug.localeCompare(b.slug));
      } catch {
        return [];
      }
    };
    res.json({ ok: true, pages: list("pages"), posts: list("posts") });
  });
  app.get(base + "/api/content/raw", guard, async (req, res) => {
    const type = req.query.type === "posts" ? "posts" : "pages";
    const slug = String(req.query.slug || "");
    if (!safeSlug(slug)) return res.status(400).json({ ok: false, error: "invalid slug" });
    const file = path.join(cdir(type), slug + ".md");
    const src = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/); // split front-matter from body
    const front = m ? m[1] : "";
    const body = m ? src.slice(m[0].length) : src;
    // body (raw markdown) for the textarea fallback; html (rendered) for the WYSIWYG setHTML
    res.json({ ok: true, front, body, html: await md2html(body) });
  });
  app.post(base + "/api/content/save", guard, express.json({ limit: "25mb" }), (req, res) => {
    const type = req.body?.type === "posts" ? "posts" : "pages";
    const slug = String(req.body?.slug || "");
    if (!safeSlug(slug)) return res.status(400).json({ ok: false, error: "slug: lowercase letters, numbers, hyphens" });
    const dir = cdir(type);
    fs.mkdirSync(dir, { recursive: true });
    // extract inline base64 media (pasted / data: URLs) to public/media so pages stay lean —
    // both HTML <img src="data:…"> (setHTML round-trip) and markdown ![](data:…) (getMarkdown)
    const mediaDir = path.join(process.cwd(), "public", "media");
    const extFor = (mime) =>
      ({ "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg", "video/mp4": "mp4", "video/webm": "webm", "audio/mpeg": "mp3" })[mime.toLowerCase()] || (mime.split("/")[1] || "bin").replace(/[^a-z0-9]+/gi, "").slice(0, 8) || "bin";
    const saveMedia = (mime, b64) => {
      const buf = Buffer.from(b64, "base64");
      const name = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16) + "." + extFor(mime);
      fs.mkdirSync(mediaDir, { recursive: true });
      const dest = path.join(mediaDir, name);
      if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
      return "/media/" + name;
    };
    let body = String(req.body?.body ?? "");
    body = body.replace(/(<(?:img|video|audio|source)\b[^>]*?\ssrc=")data:([\w.+-]+\/[\w.+-]+);base64,([^"]+)(")/gi, (m, pre, mime, b64, post) => {
      try { return pre + saveMedia(mime, b64) + post; } catch { return m; }
    });
    body = body.replace(/(!\[[^\]]*\]\()data:([\w.+-]+\/[\w.+-]+);base64,([^)\s]+)(\))/gi, (m, pre, mime, b64, post) => {
      try { return pre + saveMedia(mime, b64) + post; } catch { return m; }
    });
    // reconstruct the file: front-matter (title/date/tags/permalink…) on top + the edited body
    const front = String(req.body?.front ?? "").trim();
    const out = front ? `---\n${front}\n---\n\n${body}\n` : `${body}\n`;
    fs.writeFileSync(path.join(dir, slug + ".md"), out);
    res.json({ ok: true, file: type + "/" + slug + ".md" });
  });
  app.post(base + "/api/content/delete", guard, express.json(), (req, res) => {
    const type = req.body?.type === "posts" ? "posts" : "pages";
    const slug = String(req.body?.slug || "");
    if (!safeSlug(slug)) return res.status(400).json({ ok: false, error: "invalid slug" });
    const file = path.join(cdir(type), slug + ".md");
    if (fs.existsSync(file)) fs.unlinkSync(file);
    res.json({ ok: true });
  });

  log(`web admin at ${base} — magic-link (nonce + same-browser + fingerprint)${allowIps.size ? `, IP allowlist (${allowIps.size})` : ""}, for ${adminEmails.join(", ")}`);
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
    `<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
  <h1 class="h5 mb-0">Site admin</h1>
  <div class="d-flex align-items-center gap-2">
    <a class="btn btn-sm btn-primary" href="/" target="_blank" rel="noopener">View site →</a>
    <button class="btn btn-sm btn-outline-warning" data-act="restart">Restart</button>
    <span class="small text-secondary ms-1">${esc(email)} · <a href="#" id="lo">sign out</a></span></div></div>
<p class="small text-secondary mb-4">Content &amp; media changes go live instantly — hit <b>View site</b> to check them before continuing. <b>Restart</b> is only needed after theme or settings changes.</p>
<div class="card mb-3"><div class="card-header d-flex justify-content-between align-items-center"><span>Server actions</span><span class="small text-secondary">whitelisted — not a shell</span></div><div class="card-body">
  <div class="d-flex gap-2 flex-wrap mb-2">
    <button class="btn btn-sm btn-outline-primary" data-act="update">Update to latest</button>
    <button class="btn btn-sm btn-outline-primary" data-act="pull">Pull from git</button>
    <button class="btn btn-sm btn-outline-warning" data-act="restart">Restart app</button>
  </div>
  <pre id="out" class="small mb-0 p-2 rounded" style="background:#0b0d11;color:#cfe3ff;max-height:240px;overflow:auto;white-space:pre-wrap;display:none"></pre>
</div></div>
<div class="card"><div class="card-header">Media library</div><div class="card-body">
  <input id="up" type="file" class="form-control mb-2" accept="image/*,video/*" multiple />
  <p class="small text-secondary">Uploads go to <code>public/media/</code>, served at <code>/media/&lt;name&gt;</code>.</p>
  <div id="grid" class="row row-cols-2 row-cols-md-4 g-3"></div></div></div>
<div class="card mt-3"><div class="card-header">Typography</div><div class="card-body">
  <style id="fontPrev"></style>
  <p class="small text-secondary">A font per role, shown in its own type below. Downloaded + self-hosted on your live site — previews here load from a CDN in this admin only. Applies live; reload the site to see it.</p>
  <div class="row" id="fontRoles"></div>
  <div class="rounded p-2 mb-2" style="background:#fff;color:#111;border:1px solid #ddd">
    <div id="spH" style="font-weight:700;font-size:1.35rem;line-height:1.15">The quick brown fox</div>
    <div id="spS" style="font-weight:600">jumps over the lazy dog</div>
    <div id="spB" class="small" style="margin:.25rem 0">Pack my box with five dozen liquor jugs. 0123456789</div>
    <code id="spM">const x = 42; // il1 O0</code>
  </div>
  <button id="fontApply" class="btn btn-sm btn-outline-primary">Download &amp; apply</button>
  <span id="fontMsg" class="small ms-2 text-secondary"></span>
</div></div>
<div class="card mt-3"><div class="card-header">Home page</div><div class="card-body">
  <p class="small text-secondary mb-2">What visitors see at <code>/</code> — like WordPress → Settings → Reading. Takes effect after a <b>Restart</b>.</p>
  <select id="homeSel" class="form-select form-select-sm mb-2" style="max-width:440px"></select>
  <button id="homeApply" class="btn btn-sm btn-outline-primary">Save home page</button>
  <span id="homeMsg" class="small ms-2 text-secondary"></span>
</div></div>
<div class="card mt-3"><div class="card-header d-flex justify-content-between align-items-center"><span>Content</span>
  <span><button class="btn btn-sm btn-outline-primary" id="newPage">+ New page</button> <button class="btn btn-sm btn-outline-primary" id="newPost">+ New post</button></span></div>
<div class="card-body"><div class="row g-3">
  <div class="col-md-4"><div id="clist" class="small"></div></div>
  <div class="col-md-8">
    <p id="cempty" class="small text-secondary">Pick a page or post to edit, or create a new one.</p>
    <div id="ceditor" style="display:none">
      <div class="d-flex gap-2 mb-2 align-items-center flex-wrap">
        <span class="badge text-bg-secondary" id="ctype"></span>
        <input id="cslug" class="form-control form-control-sm" placeholder="slug (lowercase-hyphens)" style="max-width:240px" />
      </div>
      <details class="mb-2"><summary class="small text-secondary" style="cursor:pointer">Front matter -- title, date, tags, permalink…</summary>
        <textarea id="cfront" rows="3" class="form-control form-control-sm mt-1" spellcheck="false" style="font:12px/1.5 ui-monospace,monospace" placeholder="title: My Page"></textarea></details>
      <div id="cbody" class="border rounded bg-white text-dark px-2" style="min-height:360px"></div>
      <textarea id="cbodyRaw" rows="16" class="form-control d-none" spellcheck="false" style="font:12px/1.5 ui-monospace,monospace" placeholder="Your markdown here."></textarea>
      <div id="cnorte" class="form-text text-warning d-none">Rich editor unavailable -- editing markdown as text. Run <code>npm i rte-rich-text-editor</code> for the WYSIWYG editor.</div>
      <div class="mt-2 d-flex gap-2 align-items-center flex-wrap">
        <button class="btn btn-sm btn-primary" id="csave">Save</button>
        <a class="btn btn-sm btn-outline-secondary" id="cview" target="_blank" rel="noopener">View →</a>
        <button class="btn btn-sm btn-outline-danger" id="cdel">Delete</button>
        <span id="cmsg" class="small text-secondary"></span>
      </div>
    </div>
  </div>
</div></div></div>
<p class="small text-secondary mt-3">Changes are live on the next page load -- no restart needed.</p>
<script src="${base}/rte.js"></script>
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
const out=document.getElementById("out");
document.querySelectorAll("[data-act]").forEach(b=>b.onclick=async()=>{
  const act=b.getAttribute("data-act");out.style.display="block";out.textContent="";
  if(act==="restart"){if(!confirm("Restart the app? It only comes back if a process manager (pm2/docker/systemd) is running it.")){out.style.display="none";return;}
    await fetch(B+"/api/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:act})});
    out.textContent="Restarting… if a process manager is running the app it'll be back shortly — reload then.";return;}
  document.querySelectorAll("[data-act]").forEach(x=>x.disabled=true);
  try{const r=await fetch(B+"/api/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:act})});
    const rd=r.body.getReader(),dec=new TextDecoder();
    for(;;){const{done,value}=await rd.read();if(done)break;out.textContent+=dec.decode(value);out.scrollTop=out.scrollHeight;}}
  catch(e){out.textContent+="\\n[network error] "+e.message;}
  document.querySelectorAll("[data-act]").forEach(x=>x.disabled=false);
});
load();
const FROLES=[["heading","Headings (H1)","spH"],["subhead","Subsections (H2-H4)","spS"],["body","Body / paragraphs","spB"],["mono","Code / mono","spM"]];
const fstack=c=>c==="Serif"?"serif":c==="Mono"?"monospace":"sans-serif";let FCAT=[];
function fontSpec(){FROLES.forEach(([k,,id])=>{const s=document.querySelector('[data-frole="'+k+'"]');const f=FCAT.find(x=>x.slug===(s&&s.value));const el=document.getElementById(id);if(el)el.style.fontFamily=f?"'"+f.family+"',"+fstack(f.cat):"inherit";});}
async function loadFonts(){const d=await (await fetch(B+"/api/fonts")).json();FCAT=d.fonts||[];
document.getElementById("fontPrev").textContent=FCAT.map(f=>"@font-face{font-family:'"+f.family+"';font-weight:400;font-display:swap;src:url(https://cdn.jsdelivr.net/fontsource/fonts/"+f.slug+"@latest/latin-400-normal.woff2) format('woff2')}").join("");
const w=document.getElementById("fontRoles");w.innerHTML="";
FROLES.forEach(([k,label])=>{const col=document.createElement("div");col.className="col-sm-6 mb-2";
let o='<option value="">System default</option>';FCAT.forEach(f=>{o+='<option value="'+f.slug+'"'+((d.current&&d.current[k])===f.slug?' selected':'')+'>'+f.family+' - '+f.cat+'</option>';});
col.innerHTML='<label class="form-label small mb-1">'+label+'</label><select class="form-select form-select-sm" data-frole="'+k+'">'+o+'</select>';w.appendChild(col);});
document.querySelectorAll("[data-frole]").forEach(s=>s.onchange=fontSpec);fontSpec();}
document.getElementById("fontApply").onclick=async()=>{const roles={};document.querySelectorAll("[data-frole]").forEach(s=>{if(s.value)roles[s.dataset.frole]=s.value;});
const m=document.getElementById("fontMsg");m.textContent="downloading...";
try{const r=await (await fetch(B+"/api/fonts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({roles})})).json();m.textContent=r.ok?"applied - reload the site to see it":"error: "+r.error;}catch(e){m.textContent="error: "+e.message;}};
loadFonts();
async function loadHome(){const d=await (await fetch(B+"/api/home")).json();const sel=document.getElementById("homeSel");
let o='<option value="">Default landing page</option>';
if(d.posts)o+='<option value="posts"'+(d.home==="posts"?' selected':'')+'>Your latest posts (blog index)</option>';
(d.pages||[]).forEach(p=>{o+='<option value="'+p+'"'+(d.home===p?' selected':'')+'>Static page: '+p+'</option>';});
sel.innerHTML=o;}
document.getElementById("homeApply").onclick=async()=>{const m=document.getElementById("homeMsg");m.textContent="saving…";
try{const r=await (await fetch(B+"/api/home",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({home:document.getElementById("homeSel").value})})).json();
m.textContent=r.ok?"saved — click Restart to apply":"error: "+r.error;}catch(e){m.textContent="error: "+e.message;}};
loadHome();
var CT='pages',ED=null,useRTE=!!window.RTE;
function ensureEditor(){if(useRTE&&!ED){try{ED=RTE.init('#cbody',{height:'360px',placeholder:'Write your content…'});}catch(e){useRTE=false;}}
  if(!useRTE){document.getElementById('cbody').classList.add('d-none');document.getElementById('cbodyRaw').classList.remove('d-none');document.getElementById('cnorte').classList.remove('d-none');}}
function setBody(html,md){ensureEditor();if(useRTE&&ED){ED.setHTML(html||'');}else{document.getElementById('cbodyRaw').value=md||'';}}
function getBody(){return (useRTE&&ED)?ED.getMarkdown():document.getElementById('cbodyRaw').value;}
async function loadContent(){var d=await (await fetch(B+'/api/content')).json();
  var mk=function(t,items){return '<div class="fw-bold mt-2 mb-1 text-secondary">'+(t==='pages'?'Pages':'Posts')+'</div>'+((items&&items.length)?items.map(function(x){return '<a href="#" class="d-block text-truncate citem" data-type="'+t+'" data-slug="'+x.slug+'">'+(x.title||x.slug)+'</a>';}).join(''):'<div class="text-secondary">none</div>');};
  document.getElementById('clist').innerHTML=mk('pages',d.pages)+mk('posts',d.posts);
  document.querySelectorAll('.citem').forEach(function(a){a.onclick=function(e){e.preventDefault();openContent(a.dataset.type,a.dataset.slug);};});}
async function openContent(t,slug){CT=t;var d=await (await fetch(B+'/api/content/raw?type='+t+'&slug='+encodeURIComponent(slug))).json();
  document.getElementById('cempty').style.display='none';document.getElementById('ceditor').style.display='';
  document.getElementById('ctype').textContent=(t==='posts'?'post':'page');document.getElementById('cslug').value=slug;
  document.getElementById('cfront').value=d.front||'';setBody(d.html,d.body);
  document.getElementById('cview').href=(t==='posts'?'/blog/':'/')+slug;document.getElementById('cmsg').textContent='';}
function newContent(t){CT=t;document.getElementById('cempty').style.display='none';document.getElementById('ceditor').style.display='';
  document.getElementById('ctype').textContent=(t==='posts'?'post':'page');document.getElementById('cslug').value='';
  document.getElementById('cfront').value='title: New '+(t==='posts'?'post':'page');setBody('','');document.getElementById('cmsg').textContent='';document.getElementById('cslug').focus();}
document.getElementById('newPage').onclick=function(){newContent('pages');};
document.getElementById('newPost').onclick=function(){newContent('posts');};
document.getElementById('csave').onclick=async function(){var m=document.getElementById('cmsg');m.textContent='saving…';
  var r=await (await fetch(B+'/api/content/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:CT,slug:document.getElementById('cslug').value,front:document.getElementById('cfront').value,body:getBody()})})).json();
  m.textContent=r.ok?'✓ saved -- live now':'error: '+(r.error||'');if(r.ok){document.getElementById('cview').href=(CT==='posts'?'/blog/':'/')+document.getElementById('cslug').value;loadContent();}};
document.getElementById('cdel').onclick=async function(){if(!confirm('Delete this content?'))return;var m=document.getElementById('cmsg');
  var r=await (await fetch(B+'/api/content/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:CT,slug:document.getElementById('cslug').value})})).json();
  if(r.ok){document.getElementById('ceditor').style.display='none';document.getElementById('cempty').style.display='';loadContent();}else{m.textContent='error: '+(r.error||'');}};
loadContent();
</script>`
  );
