// index.js (volt-addon-mir) — makes a Volt app a Memory Infrastructure Registry (MIR)
// partner/market; its users are the participants. The app records participation events
// and resolves a participant's neutral, cross-partner signals. Base: mirregistry.org/v1,
// authenticated with x-api-key.
//
// Onboarding (register → verify domain → promote) is driven from the config wizard; at
// runtime this add-on does two things:
//   • serves the domain-verification challenge at /.well-known/mir-challenge (the token
//     MIR handed us at register time), so MIR can confirm this origin controls the domain
//   • exposes app.locals.mir { submitEvent, resolveUser, call } to your routes and to
//     other add-ons (reachable in a handler via req.app.locals.mir)
//
// MIR only meters events for a public, domain-verified partner, so the config only offers
// MIR once SITE_URL is a real routable domain — a localhost install could never pass the
// challenge and is intentionally not offered the option.
//
// eventType is a LOCKED dotted enum (e.g. "transaction.completed"), not free-form; weight
// is ≥ 0 and defaults to 1 (use claims for negative signals). In sandbox, submit→resolve
// is immediate; in production a resolve is provisional (202) until the participant links
// their MIR account, and unknown (404) until they have any events — this client surfaces
// those three outcomes distinctly.

const DEFAULT_BASE = "https://mirregistry.org/v1";

export function register({ app, env, log }) {
  const base = String(env.MIR_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
  const key = String(env.MIR_API_KEY || "").trim();
  const challenge = String(env.MIR_CHALLENGE || "").trim();
  // Emitting participation events sends data about your users to an external registry, so
  // it is a deliberate opt-in (MIR_EMIT), separate from being a registered partner. Off =
  // registered/able-to-resolve, but submitEvent is a no-op. Set in the config wizard.
  const emit = /^(1|true|on|yes)$/i.test(String(env.MIR_EMIT || ""));
  // Never emit for a localhost / private-network app — dev + test events must not pollute a
  // partner's production reputation data. This is a hard gate, independent of MIR_EMIT.
  const host = String(env.SITE_URL || "").replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
  const isLocal = !host || host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|::1)/.test(host);

  // domain verification — echo the challenge token as plain text at the well-known path.
  if (challenge) {
    app.get("/.well-known/mir-challenge", (_req, res) => res.type("text/plain").send(challenge));
  }

  const call = async (pathname, { method = "GET", body } = {}) => {
    const headers = { "content-type": "application/json" };
    if (key) headers["x-api-key"] = key;
    let res, text;
    try {
      res = await fetch(base + pathname, { method, headers, body: body ? JSON.stringify(body) : undefined });
      text = await res.text();
    } catch (e) {
      return { status: 0, ok: false, data: { error: String((e && e.message) || e) } };
    }
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    return { status: res.status, ok: res.ok, data };
  };

  const mir = {
    base,
    environment: key.startsWith("mir_sandbox") ? "sandbox" : key ? "production" : "unregistered",
    configured: () => !!key,
    emitting: emit,

    // Record a participation event for a user (participant). No-ops (returns { skipped })
    // unless the owner opted into emission (MIR_EMIT). Otherwise returns the created event,
    // or throws with MIR's error message.
    async submitEvent(userExternalId, eventType, opts = {}) {
      if (!key) throw new Error("MIR not configured — set MIR_API_KEY (register in the config)");
      if (isLocal) return { skipped: true, reason: "localhost/private site — MIR never emits for local apps" };
      if (!emit) return { skipped: true, reason: "MIR emission not opted in — enable “Emit participation events” in the config (MIR_EMIT=on)" };
      if (!userExternalId || !eventType) throw new Error("submitEvent needs (userExternalId, eventType)");
      const body = { userExternalId: String(userExternalId), eventType: String(eventType) };
      if (opts.weight != null) body.weight = opts.weight;
      if (opts.occurredAt) body.occurredAt = opts.occurredAt;
      const r = await call("/events", { method: "POST", body });
      if (!r.ok) throw new Error(`MIR event ${r.status}: ${(r.data && (r.data.error || r.data.message)) || JSON.stringify(r.data).slice(0, 160)}`);
      return r.data;
    },

    // Resolve a participant's neutral signals. Surfaces the three MIR outcomes distinctly:
    //   found (200)       → { found:true, signals }
    //   provisional (202) → { provisional:true } — production: events exist, account not linked yet
    //   unknown (404)     → { unknown:true }      — no events for this user
    async resolveUser(userExternalId, opts = {}) {
      if (!key) throw new Error("MIR not configured — set MIR_API_KEY (register in the config)");
      const q = new URLSearchParams({ userExternalId: String(userExternalId) });
      if (opts.purpose) q.set("purpose", opts.purpose);
      if (opts.signals) q.set("signals", Array.isArray(opts.signals) ? opts.signals.join(",") : String(opts.signals));
      const r = await call("/resolve?" + q.toString());
      if (r.status === 404) return { found: false, unknown: true, provisional: false, status: 404, signals: null };
      if (r.status === 202) return { found: false, unknown: false, provisional: true, status: 202, signals: r.data };
      if (r.ok) return { found: true, unknown: false, provisional: false, status: r.status, signals: r.data };
      throw new Error(`MIR resolve ${r.status}: ${(r.data && (r.data.error || r.data.message)) || ""}`);
    },

    // low-level escape hatch (claims, future endpoints)
    call,
  };

  app.locals.mir = mir;
  log(`partner client ready → ${base} (${mir.environment})${challenge ? ", challenge served" : ""} · events ${isLocal ? "OFF (localhost/private site — never emits)" : emit ? "EMITTING" : "not emitting (opt in via config)"}`);
}
