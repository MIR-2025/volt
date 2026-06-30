# volt-ai-gateway

The **voltjs.com hosted AI gateway** — the server half of Volt's hybrid AI model.
The real Anthropic key lives **only here** (a capped Workspace key). Volt apps
(via [`volt-addon-ai`](../volt-addon-ai)) send a per-app `VOLT_AI_TOKEN`; the
gateway validates it, enforces caps, forwards to Anthropic, streams back, and
meters tokens. Apps never see the key, and you can revoke any app instantly.

## Run

```
cp .env.example .env     # set ANTHROPIC_API_KEY (capped Workspace key) + ADMIN_TOKEN
npm install
npm run dev              # or: npm run pm2
```

Put it behind `voltjs.com/api/ai` (reverse-proxy `/api/ai` → this service). That's
the default `VOLT_AI_GATEWAY` in `volt-addon-ai`.

## Issue an app token

```
curl -X POST https://voltjs.com/admin/tokens \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"app":"acme-blog","dailyCap":50000}'
# → { "token": "volt_…", ... }   give this to the app as VOLT_AI_TOKEN
```

Manage:
```
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://voltjs.com/admin/tokens
curl -X POST  .../admin/tokens/<token>/disable  -H "Authorization: Bearer $ADMIN_TOKEN"   # kill switch
curl -X POST  .../admin/tokens/<token>/enable   -H "Authorization: Bearer $ADMIN_TOKEN"
curl -X DELETE .../admin/tokens/<token>         -H "Authorization: Bearer $ADMIN_TOKEN"   # revoke
```

## Guardrails (defense in depth)

1. **Per-app daily token cap** (set when issuing).
2. **Global daily token cap** — backstop across all apps (`GLOBAL_DAILY_TOKEN_CAP`).
3. **`max_tokens` clamp** per request (`AI_MAX_TOKENS`).
4. **Kill switch** — disable or revoke any token without touching the key.
5. **Capped Anthropic Workspace key** — the ultimate dollar ceiling, on Anthropic's side.

So a free tier on your key can never run away: it hits a token cap here long before
it hits the dollar cap there.

## Notes

- Storage is a JSON file store (`data/tokens.json`, `data/usage.json`), fine for a
  single instance. For multi-instance, move the store + counters to Redis/Postgres
  (the metering is the only shared state).
- Caps are in **tokens**; size them from the model's price to hit a dollar target.
