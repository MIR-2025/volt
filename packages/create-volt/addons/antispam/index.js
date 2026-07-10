// index.js (volt-addon-antispam) — built-in spam protection, no API key, no third-party.
// Nothing about a submission ever leaves the app; every check runs locally. Layered signals
// combine into a verdict:
//   • honeypot  — a hidden field real users never fill; a bot that fills it is blocked
//   • time-trap — a signed token embedded at form render; a submit faster than ~2s (a bot)
//                 or with a forged/absent token is caught
//   • content   — heuristic score: link count, spam keywords, shouting
//   • probes    — each DETECTED-spam submission is a "known probe" for that IP. Once an IP
//                 reaches PROBE_LIMIT (20) probes in the window, it's a known bad actor and
//                 gets a hard 429 before any further work.
//
//   • proof-of-work — an invisible HMAC challenge (pow-captcha-js) the browser solves in ~1s;
//                 prices spam by volume with no puzzle and no third party. Opt-in per form via
//                 fields({ pow:true }), or on for every form via ANTISPAM_POW=1.
//
// Any form opts in: embed app.locals.spam.fields() in the form, and call
// app.locals.spam.check({ req, content }) on submit → { ok, spam, banned, status, reasons }.
import crypto from "node:crypto";
import { createPow } from "pow-captcha-js";

const SECRET = process.env.ANTISPAM_SECRET || process.env.ADMIN_SECRET || "volt-antispam-dev-secret";
const POW_PATH = process.env.ANTISPAM_POW_PATH || "/pow"; // where the browser fetches a PoW challenge
const POW_ON = /^(1|true|yes|on)$/i.test(String(process.env.ANTISPAM_POW || "")); // require PoW on every checked form
const HP = "_hp_url"; // honeypot field name (looks tempting to a bot)
const MIN_MS = 2000; // a submit faster than this is a bot
const MAX_MS = 2 * 60 * 60 * 1000; // token older than 2h is stale
const PROBE_LIMIT = 20; // known probes from one IP → 429
const PROBE_WINDOW = 60 * 60 * 1000; // probes counted over 1h

const HARD = new Set(["honeypot", "too fast", "proof-of-work"]); // any one of these = spam outright
const SPAM_WORDS = /\b(viagra|cialis|casino|porn|xxx|payday\s*loan|bitcoin|crypto\s*(?:invest|profit|double)|forex|seo\s*services?|backlinks?|escort|replica\s*watch|nude)\b/i;
const linkCount = (s) => (String(s).match(/https?:\/\/|www\.|\[url|<a\s/gi) || []).length;
const clientIp = (req) =>
  String(req.headers?.["x-real-ip"] || (req.headers?.["x-forwarded-for"] || "").split(",")[0] || req.socket?.remoteAddress || "")
    .replace(/^::ffff:/, "")
    .trim();

// signed, stateless time-trap token = "<ts>.<hmac(ts)>"
const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("base64url");
const issueToken = () => {
  const ts = String(Date.now());
  return ts + "." + sign(ts);
};
function tokenAgeMs(tok) {
  const [ts, mac] = String(tok || "").split(".");
  if (!ts || !mac || sign(ts) !== mac) return null; // forged / absent
  const age = Date.now() - Number(ts);
  return Number.isFinite(age) ? age : null;
}

// per-IP known-probe counter (sliding window)
const probes = new Map(); // ip → [timestamps]
const activeProbes = (ip, now = Date.now()) => (probes.get(ip) || []).filter((t) => now - t < PROBE_WINDOW);
function recordProbe(ip) {
  if (!ip) return 0;
  const now = Date.now();
  const arr = activeProbes(ip, now);
  arr.push(now);
  probes.set(ip, arr);
  if (probes.size > 5000) for (const [k, v] of probes) if (!v.some((t) => now - t < PROBE_WINDOW)) probes.delete(k);
  return arr.length;
}

export function register({ app, env, log }) {
  // Invisible proof-of-work (pow-captcha-js): a stateless HMAC challenge the browser solves in ~1s.
  // Shares SECRET with the other signals. Routes are mounted so any form can turn PoW on.
  const pow = createPow({ secret: SECRET, bits: Number(env?.POW_BITS || process.env.POW_BITS || 18), path: POW_PATH, global: "voltPow" });
  app.get(POW_PATH, pow.routes().challenge);
  app.get(POW_PATH + ".js", pow.routes().script);

  // Client wiring for a <form>: load the solver, and on submit grind (~1s, invisible) then attach
  // the solved token as a hidden `_pow` field before submitting. Injects via the DOM (no escaping).
  const powScript = () =>
    `<script src="${POW_PATH}.js"></script>` +
    `<script>(function(){var s=document.currentScript,f=s&&s.closest('form');if(!f)return;var busy=false;` +
    `f.addEventListener('submit',function(e){if(busy)return;e.preventDefault();busy=true;` +
    `voltPow.fetchAndSolve().then(function(v){var i=document.createElement('input');i.type='hidden';i.name='_pow';i.value=JSON.stringify(v);f.appendChild(i);f.submit();}).catch(function(){f.submit();});});})();</script>`;

  // Pull the solved token out of a submission: hidden `_pow` JSON field, or fields merged onto the body.
  const readPow = (req, powBody) => {
    if (powBody) return powBody;
    const raw = req?.body?._pow;
    if (raw) { try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; } }
    return req?.body?.salt && req?.body?.sig ? req.body : null;
  };

  const spam = {
    honeypotField: HP,
    probeLimit: PROBE_LIMIT,
    pow, // the pow-captcha-js instance — call pow.verify()/pow.challenge() directly if you like
    powScript, // embed in a form to enable invisible PoW on it

    // Drop into a <form> so the honeypot + time-trap ride along. PoW is added when opts.pow is set
    // or ANTISPAM_POW is on.
    fields(opts) {
      const base =
        `<input type="text" name="${HP}" tabindex="-1" autocomplete="off" aria-hidden="true" ` +
        `style="position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0">` +
        `<input type="hidden" name="_ts" value="${issueToken()}">`;
      return (opts && opts.pow) || POW_ON ? base + powScript() : base;
    },
    // A fresh token for client-rendered forms that fetch instead of embed.
    token: issueToken,

    // Verdict for a submission.
    //   { ok:true }                                    → accept
    //   { ok:false, spam:true, status:400, reasons }   → spam, reject (or shadow-drop)
    //   { ok:false, banned:true, status:429, reasons } → IP over the probe limit
    check({ req, content = "", token, honeypot, pow: powBody, requirePow = POW_ON } = {}) {
      const ip = req ? clientIp(req) : "";
      // known bad actor → 429 before doing any work
      if (ip && activeProbes(ip).length >= PROBE_LIMIT) return { ok: false, spam: true, banned: true, status: 429, reasons: ["rate limit: 20+ known probes"] };

      const reasons = [];
      const hp = honeypot != null ? honeypot : req?.body?.[HP];
      const tok = token != null ? token : req?.body?._ts;
      if (hp) reasons.push("honeypot");
      const age = tokenAgeMs(tok);
      if (age == null) reasons.push("no/invalid token");
      else if (age < MIN_MS) reasons.push("too fast");
      else if (age > MAX_MS) reasons.push("stale token");
      // invisible proof-of-work: required-but-missing OR provided-but-invalid = spam outright
      const pdata = readPow(req, powBody);
      if (requirePow) { if (!pow.verify(pdata || {})) reasons.push("proof-of-work"); }
      else if (pdata && !pow.verify(pdata)) reasons.push("proof-of-work");
      const links = linkCount(content);
      if (links >= 3) reasons.push(`${links} links`);
      if (SPAM_WORDS.test(content)) reasons.push("spam keyword");
      const letters = String(content).replace(/[^A-Za-z]/g, "");
      if (letters.length > 20 && (letters.match(/[A-Z]/g) || []).length / letters.length > 0.7) reasons.push("shouting");

      const spammy = reasons.some((r) => HARD.has(r)) || reasons.length >= 2;
      if (!spammy) return { ok: true, spam: false, status: 200, reasons };

      // record the probe; the one that reaches the limit escalates to 429
      const n = ip ? recordProbe(ip) : 0;
      if (n >= PROBE_LIMIT) return { ok: false, spam: true, banned: true, status: 429, reasons: [...reasons, "rate limit: 20+ known probes"] };
      return { ok: false, spam: true, status: 400, reasons };
    },
  };

  app.locals.spam = spam;
  log(`spam protection ready (no API key) — honeypot + time-trap + content heuristics + proof-of-work (${POW_ON ? "on" : "opt-in"}), 429 at ${PROBE_LIMIT} probes/IP`);
}
