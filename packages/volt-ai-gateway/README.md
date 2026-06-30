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

## Tiers & pay-as-you-go

Three ways an app gets AI:

| Tier | Where the key is | Who pays | Cap |
| --- | --- | --- | --- |
| **free** | gateway | you (capped) | `dailyCap` tokens/day, then 429 |
| **payg** | gateway | the app, prepaid | free cap, then billed from credits |
| **BYO** | the app's own `.env` | the app | their Anthropic account |

Beyond the free daily cap, **payg** apps keep going — each request is billed
against prepaid USD credits at **`AI_MARKUP`× (default 8×)** the underlying
Anthropic cost (from `PRICING`). Out of credits → `402`, back to the free cap.

Apps buy credits with their own token:

```
curl -X POST https://voltjs.com/api/credits/checkout \
  -H "Authorization: Bearer $VOLT_AI_TOKEN" -H "Content-Type: application/json" \
  -d '{"amountUsd":20}'
# → { "url": "https://checkout.stripe.com/..." }   send the user there
```

On Stripe's `checkout.session.completed` webhook (`POST /webhooks/stripe`) the
gateway adds the credits and flips the token to `payg` — idempotent, so a session
never credits twice. Set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, and point
a Stripe webhook at `/webhooks/stripe`. You can also comp credits directly:
`POST /admin/tokens/<token>/credit {"amountUsd":5}`.

## Notes

- Storage is a JSON file store (`data/tokens.json`, `data/usage.json`), fine for a
  single instance. For multi-instance, move the store + counters to Redis/Postgres
  (the metering is the only shared state).
- Caps are in **tokens**; size them from the model's price to hit a dollar target.
