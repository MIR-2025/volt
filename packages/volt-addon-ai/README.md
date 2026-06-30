# volt-addon-ai

A **server-side AI proxy** for [Volt](https://voltjs.com). The key never reaches
the browser. Two modes, auto-selected:

- **BYO** — set `ANTHROPIC_API_KEY` and the app calls Anthropic directly.
- **Gateway** — set `VOLT_AI_TOKEN` and the app proxies through the **voltjs.com**
  hosted gateway, where the Anthropic key lives. The app holds only a revocable,
  scoped token — not the key, not your bill.

Enable by adding `ai` to `VOLT_ADDONS`.

## Why a proxy

Sending an API key to the browser exposes it to everyone. A proxy keeps it
server-side. But a key spends real money, so the proxy also enforces:

- **Per-IP rate limit** (`AI_RATE_PER_MIN`, default 20/min)
- **`max_tokens` clamp** (`AI_MAX_TOKENS`, default 1024)
- **Optional auth gate** (`AI_REQUIRE_AUTH=1` → requires the auth add-on's session)

The hosted gateway adds per-app quotas + a global spend cap on top, so a free
tier can't run away with your account.

## Endpoint

```
POST /api/ai
{ "messages": [{ "role": "user", "content": "Hello" }],
  "system": "optional system prompt",
  "max_tokens": 512,          // clamped to AI_MAX_TOKENS
  "model": "claude-haiku-4-5" // optional; defaults to AI_MODEL
}
```

Responds with Anthropic's **SSE stream** passed straight through — read it with
`fetch().body.getReader()` or `EventSource`.

## Config (.env)

| Var | Default | Meaning |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | BYO key (server-side only) |
| `VOLT_AI_TOKEN` | — | per-app token for the hosted gateway |
| `VOLT_AI_GATEWAY` | `https://voltjs.com/api/ai` | gateway URL |
| `AI_MODEL` | `claude-haiku-4-5` | default model |
| `AI_MAX_TOKENS` | `1024` | hard per-request cap |
| `AI_RATE_PER_MIN` | `20` | requests/min/IP |
| `AI_REQUIRE_AUTH` | — | `1` → require a signed-in session |

Set either `ANTHROPIC_API_KEY` or `VOLT_AI_TOKEN`. With neither, the add-on stays
disabled (fail-closed).
