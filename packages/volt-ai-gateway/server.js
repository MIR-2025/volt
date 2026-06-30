// volt-ai-gateway — the voltjs.com hosted AI gateway.
//
// The real Anthropic key lives ONLY here (a capped Workspace key). Volt apps send
// a per-app Bearer token (VOLT_AI_TOKEN); the gateway validates it, checks the
// app's daily cap and a global daily cap, forwards to Anthropic with the real key,
// streams the SSE back, and meters tokens used. Apps never see the key; you can
// revoke any app's token without touching it.
//
// Admin (issue/list/disable/revoke tokens) is behind ADMIN_TOKEN.
//
// .env (see .env.example):
//   ANTHROPIC_API_KEY        the capped Workspace key (server-side, here only)
//   ADMIN_TOKEN              bearer for /admin/* (issue + revoke app tokens)
//   GLOBAL_DAILY_TOKEN_CAP   hard ceiling across all apps/day (default 5,000,000)
//   DEFAULT_APP_DAILY_CAP    default per-app tokens/day when issuing (default 100,000)
//   AI_MODEL                 default model (default claude-haiku-4-5)
//   AI_MAX_TOKENS            per-request max_tokens clamp (default 1024)
//   PORT                     listen port (default 8787)
//   DATA_DIR                 token/usage store dir (default ./data)
//   ANTHROPIC_URL            override upstream (tests only)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { paymentsEnabled, createCheckoutSession, constructWebhookEvent } from "./payments.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Quoted values are literal; unquoted values have a trailing ` # comment` stripped.
function unquote(v) {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v.replace(/(?:^|\s+)#.*$/, "");
}
// Load shared secrets from the repo-root .env (websites/volt/.env), then an
// optional local .env override. Real process.env (pm2/shell) always wins.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = unquote(m[2]);
  }
}
loadEnvFile(path.join(__dirname, ".env")); // optional per-deploy override
loadEnvFile(path.join(__dirname, "..", "..", ".env")); // shared root: websites/volt/.env

const PORT = Number(process.env.PORT) || 8787;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const GLOBAL_DAILY_TOKEN_CAP = Number(process.env.GLOBAL_DAILY_TOKEN_CAP) || 5_000_000;
const DEFAULT_APP_DAILY_CAP = Number(process.env.DEFAULT_APP_DAILY_CAP) || 100_000;
const MODEL_DEFAULT = process.env.AI_MODEL || "claude-haiku-4-5";
const MAX_TOKENS_CAP = Number(process.env.AI_MAX_TOKENS) || 1024;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const ANTHROPIC_URL = process.env.ANTHROPIC_URL || "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Pay-as-you-go: usage beyond the free daily cap is billed against prepaid USD
// credits at MARKUP times the underlying Anthropic cost. PRICING is $/Mtok
// (input,output) per model — defaults are placeholders; verify against current
// Anthropic pricing or override with PRICING_JSON.
const MARKUP = Number(process.env.AI_MARKUP) || 8;
const DEFAULT_PRICING = {
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 15, out: 75 },
};
let PRICING = DEFAULT_PRICING;
try {
  if (process.env.PRICING_JSON) PRICING = { ...DEFAULT_PRICING, ...JSON.parse(process.env.PRICING_JSON) };
} catch {
  /* keep defaults */
}
const costUsd = (model, inTok, outTok) => {
  const p = PRICING[model] || PRICING[MODEL_DEFAULT] || { in: 1, out: 5 };
  return ((inTok * p.in + outTok * p.out) / 1e6) * MARKUP;
};

if (!ANTHROPIC_API_KEY) {
  console.error("volt-ai-gateway: set ANTHROPIC_API_KEY (the capped Workspace key).");
  process.exit(1);
}
if (!ADMIN_TOKEN) {
  console.error("volt-ai-gateway: set ADMIN_TOKEN (to issue/revoke app tokens).");
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const TOK_FILE = path.join(DATA_DIR, "tokens.json");
const USE_FILE = path.join(DATA_DIR, "usage.json");
const CHG_FILE = path.join(DATA_DIR, "charges.json");
const load = (f, d) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return d;
  }
};
const save = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));
let tokens = load(TOK_FILE, []); // [{ token, app, dailyCap, tier, creditBalanceUsd, disabled, createdAt }]
let usage = load(USE_FILE, { global: { day: "", tokens: 0 }, perToken: {} });
let charges = load(CHG_FILE, []); // [{ stripeSessionId, token, amountUsd, at }] — webhook idempotency

const today = () => new Date().toISOString().slice(0, 10);
function rollDay() {
  const d = today();
  if (usage.global.day !== d) usage.global = { day: d, tokens: 0 };
  for (const t of Object.keys(usage.perToken)) if (usage.perToken[t].day !== d) usage.perToken[t] = { day: d, tokens: 0 };
}
function record(token, n) {
  if (!n) return;
  rollDay();
  usage.global.tokens += n;
  usage.perToken[token] = usage.perToken[token] || { day: today(), tokens: 0 };
  usage.perToken[token].tokens += n;
  save(USE_FILE, usage);
}
const usedToday = (token) => (usage.perToken[token]?.day === today() ? usage.perToken[token].tokens : 0);

const app = express();
app.disable("x-powered-by");

// Stripe webhook — needs the RAW body for signature verification, so it must be
// registered before express.json(). Credits are added here, after Stripe confirms
// payment; idempotent via the charges store (a session can never credit twice).
app.post("/webhooks/stripe", express.raw({ type: "application/json" }), (req, res) => {
  let event;
  try {
    event = constructWebhookEvent(req.body, req.get("stripe-signature"));
  } catch (e) {
    return res.status(400).send(`Webhook signature error: ${e.message}`);
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const token = s.metadata?.token;
    const amountUsd = Number(s.metadata?.amountUsd || 0);
    if (token && amountUsd > 0 && !charges.find((c) => c.stripeSessionId === s.id)) {
      const rec = tokens.find((t) => t.token === token);
      if (rec) {
        rec.creditBalanceUsd = (rec.creditBalanceUsd || 0) + amountUsd;
        rec.tier = "payg";
        save(TOK_FILE, tokens);
        charges.push({ stripeSessionId: s.id, token, amountUsd, at: new Date().toISOString() });
        save(CHG_FILE, charges);
        console.log(`[credit] +$${amountUsd} → ${rec.app} (balance $${rec.creditBalanceUsd.toFixed(2)})`);
      }
    }
  }
  res.json({ received: true });
});

app.use(express.json({ limit: "256kb" }));

// --- admin: issue / list / disable / revoke app tokens ---
const admin = (req, res, next) => {
  if ((req.headers.authorization || "") !== `Bearer ${ADMIN_TOKEN}`) return res.status(401).json({ error: "admin token required" });
  next();
};
app.post("/admin/tokens", admin, (req, res) => {
  const { app: appName, dailyCap, tier, creditUsd } = req.body || {};
  if (!appName) return res.status(400).json({ error: "app name required" });
  const rec = {
    token: "volt_" + crypto.randomBytes(24).toString("base64url"),
    app: String(appName),
    dailyCap: Number(dailyCap) || DEFAULT_APP_DAILY_CAP,
    tier: tier === "payg" ? "payg" : "free",
    creditBalanceUsd: Number(creditUsd) || 0,
    disabled: false,
    createdAt: today(),
  };
  tokens.push(rec);
  save(TOK_FILE, tokens);
  res.json({ ok: true, ...rec });
});
app.get("/admin/tokens", admin, (_req, res) => {
  rollDay();
  res.json({
    tokens: tokens.map((t) => ({ app: t.app, token: t.token, dailyCap: t.dailyCap, tier: t.tier || "free", creditBalanceUsd: Number((t.creditBalanceUsd || 0).toFixed(4)), disabled: t.disabled, createdAt: t.createdAt, usedToday: usedToday(t.token) })),
    global: { day: usage.global.day, tokens: usage.global.tokens, cap: GLOBAL_DAILY_TOKEN_CAP },
    markup: MARKUP,
  });
});
// manually add credits / set tier (comps, refunds, testing — payments add credits via the webhook)
app.post("/admin/tokens/:token/credit", admin, (req, res) => {
  const t = tokens.find((x) => x.token === req.params.token);
  if (!t) return res.status(404).json({ error: "not found" });
  t.creditBalanceUsd = Math.max(0, (t.creditBalanceUsd || 0) + Number(req.body?.amountUsd || 0));
  if (t.creditBalanceUsd > 0) t.tier = "payg";
  save(TOK_FILE, tokens);
  res.json({ ok: true, tier: t.tier, creditBalanceUsd: t.creditBalanceUsd });
});
app.post("/admin/tokens/:token/:action(disable|enable)", admin, (req, res) => {
  const t = tokens.find((x) => x.token === req.params.token);
  if (!t) return res.status(404).json({ error: "not found" });
  t.disabled = req.params.action === "disable";
  save(TOK_FILE, tokens);
  res.json({ ok: true, disabled: t.disabled });
});
app.delete("/admin/tokens/:token", admin, (req, res) => {
  const n = tokens.length;
  tokens = tokens.filter((x) => x.token !== req.params.token);
  save(TOK_FILE, tokens);
  res.json({ ok: true, removed: n - tokens.length });
});

// --- public self-service registration: any app can mint a free-tier token from
// its config wizard. Rate-limited per IP; the global daily cap bounds total spend
// regardless of how many tokens exist. (Revoke abusers via /admin.) ---
const regHits = new Map();
function regAllowed(ip) {
  const now = Date.now();
  const cut = now - 60000;
  const a = (regHits.get(ip) || []).filter((t) => t > cut);
  a.push(now);
  regHits.set(ip, a);
  if (regHits.size > 5000) for (const [k, v] of regHits) if (!v.some((t) => t > cut)) regHits.delete(k);
  return a.length <= 5;
}
app.post("/api/register", (req, res) => {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0].trim();
  if (!regAllowed(ip)) return res.status(429).json({ ok: false, error: "rate limit — try again shortly" });
  const rec = { token: "volt_" + crypto.randomBytes(24).toString("base64url"), app: String(req.body?.app || "app").slice(0, 64), dailyCap: DEFAULT_APP_DAILY_CAP, tier: "free", creditBalanceUsd: 0, disabled: false, createdAt: today() };
  tokens.push(rec);
  save(TOK_FILE, tokens);
  res.json({ ok: true, token: rec.token, tier: "free", dailyCap: rec.dailyCap });
});

// --- the proxy: validate token → check caps → forward → stream → meter ---
app.post("/api/ai", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const rec = tokens.find((t) => t.token === token);
  if (!rec) return res.status(401).json({ error: "invalid token" });
  if (rec.disabled) return res.status(403).json({ error: "token disabled" });
  rollDay();
  if (usage.global.tokens >= GLOBAL_DAILY_TOKEN_CAP) return res.status(503).json({ error: "global daily cap reached — try later" });
  // Free allowance up to dailyCap. Beyond it: payg apps with credits keep going
  // (billed at MARKUP× cost); free apps (or payg out of credits) are capped.
  const overFree = usedToday(token) >= rec.dailyCap;
  if (overFree) {
    if (rec.tier !== "payg") return res.status(429).json({ error: "free daily cap reached — switch to pay-as-you-go" });
    if ((rec.creditBalanceUsd || 0) <= 0) return res.status(402).json({ error: "out of credits — top up at POST /api/credits/checkout" });
  }

  const { messages, system, max_tokens, model, stream } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "messages[] required" });
  // Honor the client's stream preference (default off). Streaming clients
  // (volt-addon-ai) send stream:true; non-streaming ones (RTEPro) omit it and get
  // a single JSON response. Metering greps usage from either shape.
  const payload = {
    model: model || MODEL_DEFAULT,
    max_tokens: Math.min(Number(max_tokens) || MAX_TOKENS_CAP, MAX_TOKENS_CAP),
    messages,
    ...(system ? { system } : {}),
    stream: stream === true,
  };

  try {
    const up = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify(payload),
    });
    if (!up.ok || !up.body) {
      const detail = await up.text().catch(() => "");
      return res.status(up.status || 502).type("application/json").send(detail || JSON.stringify({ error: "upstream error" }));
    }
    res.setHeader("Content-Type", up.headers.get("content-type") || "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    const reader = up.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });
      buf += chunk;
      res.write(chunk);
    }
    res.end();
    // meter from Anthropic's SSE usage fields (input from message_start, last
    // cumulative output from message_delta).
    const inTok = Number((buf.match(/"input_tokens":\s*(\d+)/) || [])[1] || 0);
    const outs = [...buf.matchAll(/"output_tokens":\s*(\d+)/g)];
    const outTok = outs.length ? Number(outs[outs.length - 1][1]) : 0;
    record(token, inTok + outTok);
    // bill payg usage beyond the free cap against credits, at MARKUP× cost
    if (overFree && rec.tier === "payg") {
      rec.creditBalanceUsd = Math.max(0, (rec.creditBalanceUsd || 0) - costUsd(payload.model, inTok, outTok));
      save(TOK_FILE, tokens);
    }
  } catch {
    if (!res.headersSent) res.status(502).json({ error: "proxy failed" });
    else res.end();
  }
});

// self-service balance for an app's own token (the config wizard polls this).
app.get("/api/credits", (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const rec = tokens.find((t) => t.token === token);
  if (!rec) return res.status(401).json({ error: "invalid token" });
  rollDay();
  res.json({ ok: true, app: rec.app, tier: rec.tier || "free", creditBalanceUsd: Number((rec.creditBalanceUsd || 0).toFixed(4)), dailyCap: rec.dailyCap, usedToday: usedToday(token), markup: MARKUP, payments: paymentsEnabled() });
});

// pay-as-you-go: an app buys credits with its own token → Stripe Checkout URL.
app.post("/api/credits/checkout", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const rec = tokens.find((t) => t.token === token);
  if (!rec) return res.status(401).json({ error: "invalid token" });
  if (!paymentsEnabled()) return res.status(503).json({ error: "payments not configured" });
  const amountUsd = Number(req.body?.amountUsd) || 0;
  if (amountUsd < 1) return res.status(400).json({ error: "amountUsd >= 1 required" });
  const baseUrl = req.body?.baseUrl || `${req.protocol}://${req.get("host")}`;
  try {
    const url = await createCheckoutSession({ token, amountUsd, baseUrl });
    res.json({ ok: true, url });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.get("/health", (_req, res) => {
  rollDay();
  res.json({ ok: true, model: MODEL_DEFAULT, globalUsed: usage.global.tokens, globalCap: GLOBAL_DAILY_TOKEN_CAP, apps: tokens.length, maxTokens: MAX_TOKENS_CAP, markup: MARKUP, payments: paymentsEnabled() });
});

app.listen(PORT, () => console.log(`volt-ai-gateway on :${PORT} — model ${MODEL_DEFAULT}, global cap ${GLOBAL_DAILY_TOKEN_CAP}/day, max_tokens<=${MAX_TOKENS_CAP}, markup ${MARKUP}x, payments ${paymentsEnabled() ? "on" : "off"}, ${tokens.length} app token(s)`));
