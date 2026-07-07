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
// Any form opts in: embed app.locals.spam.fields() in the form, and call
// app.locals.spam.check({ req, content }) on submit → { ok, spam, banned, status, reasons }.
import crypto from "node:crypto";

const SECRET = process.env.ANTISPAM_SECRET || process.env.ADMIN_SECRET || "volt-antispam-dev-secret";
const HP = "_hp_url"; // honeypot field name (looks tempting to a bot)
const MIN_MS = 2000; // a submit faster than this is a bot
const MAX_MS = 2 * 60 * 60 * 1000; // token older than 2h is stale
const PROBE_LIMIT = 20; // known probes from one IP → 429
const PROBE_WINDOW = 60 * 60 * 1000; // probes counted over 1h

const HARD = new Set(["honeypot", "too fast"]); // any one of these = spam outright
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
  const spam = {
    honeypotField: HP,
    probeLimit: PROBE_LIMIT,

    // Drop into a <form> so the honeypot + time-trap ride along.
    fields() {
      return (
        `<input type="text" name="${HP}" tabindex="-1" autocomplete="off" aria-hidden="true" ` +
        `style="position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0">` +
        `<input type="hidden" name="_ts" value="${issueToken()}">`
      );
    },
    // A fresh token for client-rendered forms that fetch instead of embed.
    token: issueToken,

    // Verdict for a submission.
    //   { ok:true }                                    → accept
    //   { ok:false, spam:true, status:400, reasons }   → spam, reject (or shadow-drop)
    //   { ok:false, banned:true, status:429, reasons } → IP over the probe limit
    check({ req, content = "", token, honeypot } = {}) {
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
  log(`spam protection ready (no API key) — honeypot + time-trap + content heuristics, 429 at ${PROBE_LIMIT} probes/IP`);
}
