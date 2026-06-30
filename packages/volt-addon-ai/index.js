// volt-addon-ai — a server-side AI proxy. The key/token never reaches the browser.
//
// Two modes, auto-selected:
//   BYO     — ANTHROPIC_API_KEY set → call Anthropic directly with your key.
//   gateway — else VOLT_AI_TOKEN set → proxy through the voltjs.com hosted gateway
//             (the Anthropic key lives only there; the app holds a revocable token).
//   neither → disabled (fail-closed, logs why).
//
// Mounts POST /api/ai. Streams Anthropic's SSE straight through. Guards (because
// it spends real money): per-IP rate limit, max_tokens clamp, optional auth gate.
//
// .env:
//   ANTHROPIC_API_KEY   BYO key (server-side only)
//   VOLT_AI_TOKEN       per-app token for the hosted gateway
//   VOLT_AI_GATEWAY     gateway URL (default https://voltjs.com/api/ai)
//   AI_MODEL            default model (default claude-haiku-4-5)
//   AI_MAX_TOKENS       hard cap per request (default 1024)
//   AI_RATE_PER_MIN     requests/min/IP (default 20)
//   AI_REQUIRE_AUTH     1 → require the auth add-on's session

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v || ""));

// in-memory sliding-window limiter (per IP). Fine for a single process; front it
// with the gateway's own quota for multi-instance deployments.
function rateLimiter(perMin) {
  const hits = new Map();
  return (ip) => {
    const now = Date.now();
    const cutoff = now - 60000;
    const arr = (hits.get(ip) || []).filter((t) => t > cutoff);
    arr.push(now);
    hits.set(ip, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => t > cutoff)) hits.delete(k);
    return arr.length <= perMin;
  };
}

export function register({ app, express, env, requireAuth, log }) {
  const key = env.ANTHROPIC_API_KEY || "";
  const token = env.VOLT_AI_TOKEN || "";
  const gateway = env.VOLT_AI_GATEWAY || "https://voltjs.com/api/ai";
  const mode = key ? "byo" : token ? "gateway" : null;
  if (!mode) return log("volt-addon-ai: set ANTHROPIC_API_KEY (BYO) or VOLT_AI_TOKEN (hosted gateway) — disabled.");

  const model = env.AI_MODEL || "claude-haiku-4-5";
  const maxCap = Number(env.AI_MAX_TOKENS) || 1024;
  const perMin = Number(env.AI_RATE_PER_MIN) || 20;
  const requireAuthGate = truthy(env.AI_REQUIRE_AUTH);
  const allow = rateLimiter(perMin);

  const r = express.Router();
  r.use(express.json({ limit: "256kb" }));
  if (requireAuthGate && requireAuth) r.use(requireAuth);

  r.post("/api/ai", async (req, res) => {
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0].trim();
    if (!allow(ip)) return res.status(429).json({ error: "rate limit — slow down" });

    const { messages, system, max_tokens, model: reqModel } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "messages[] required" });

    const payload = {
      model: reqModel || model,
      max_tokens: Math.min(Number(max_tokens) || maxCap, maxCap),
      messages,
      ...(system ? { system } : {}),
      stream: true,
    };

    try {
      const upstream =
        mode === "byo"
          ? await fetch(ANTHROPIC_URL, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION }, body: JSON.stringify(payload) })
          : await fetch(gateway, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });

      if (!upstream.ok || !upstream.body) {
        const detail = await upstream.text().catch(() => "");
        return res.status(upstream.status || 502).type("application/json").send(detail || JSON.stringify({ error: "upstream error" }));
      }

      res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      const reader = upstream.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(dec.decode(value, { stream: true }));
      }
      res.end();
    } catch {
      if (!res.headersSent) res.status(502).json({ error: "ai proxy failed" });
      else res.end();
    }
  });

  app.use(r);
  log(`volt-addon-ai: ${mode === "byo" ? "BYO key" : "hosted gateway"} · model ${model} · ${perMin}/min/IP · max_tokens<=${maxCap}${requireAuthGate ? " · auth required" : ""}`);
}
