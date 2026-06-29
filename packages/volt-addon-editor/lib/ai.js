// ai.js — the key-injecting AI proxy for RTEPro. The editor POSTs a provider-
// native body with a `_provider` field; we forward it to that provider with the
// server-side API key (never exposed to the browser). providerRequest is pure
// (unit-tested); aiProxyHandler does the fetch.

export function providerRequest(body, env) {
  const provider = body._provider || "anthropic";
  const payload = { ...body };
  delete payload._provider;

  if (provider === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
    return {
      provider,
      url: "https://api.anthropic.com/v1/messages",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      payload,
    };
  }
  if (provider === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
    return {
      provider,
      url: "https://api.openai.com/v1/chat/completions",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
      payload,
    };
  }
  if (provider === "gemini") {
    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
    const model = payload.model || "gemini-2.0-flash";
    delete payload.model;
    return {
      provider,
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      headers: { "content-type": "application/json" },
      payload,
    };
  }
  throw new Error(`unknown AI provider: ${provider}`);
}

export function aiProxyHandler(env) {
  return async (req, res) => {
    try {
      const { url, headers, payload } = providerRequest(req.body || {}, env);
      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
      const text = await r.text();
      res.status(r.status).type(r.headers.get("content-type") || "application/json").send(text);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  };
}
