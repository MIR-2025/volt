# nginx — voltjs.com → volt-ai-gateway

Route `voltjs.com/api/*` (and the Stripe webhook) to the gateway on `127.0.0.1:8787`, and
everything else to the marketing site (`volt-site`) on `127.0.0.1:26628`.

You already have a `voltjs.com server {}` block (the site is live on HTTPS). **Add the two
gateway `location` blocks below to that existing block, above `location /`.** Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## The two blocks to add

```nginx
# hosted-AI gateway — token registration + AI proxy + credits
location /api/ {
    proxy_pass http://127.0.0.1:8787;          # NO trailing slash — keep the /api prefix
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;   # gateway rate-limits on this
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;                        # stream AI responses instead of buffering
    proxy_read_timeout 300s;                    # long generations
}

# Stripe webhook — signature is verified on the RAW body, which nginx forwards as-is
location = /webhooks/stripe {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host            $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## The one gotcha

`proxy_pass http://127.0.0.1:8787;` has **no trailing slash**. The gateway's routes include
the `/api` prefix (`app.post("/api/register")`, `"/api/ai"`, …), so the full URI must pass
through. A trailing slash (`…:8787/`) rewrites `/api/register` → `/register` → **404**.

## Full server block (reference)

```nginx
server {
    server_name voltjs.com www.voltjs.com;

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }

    location = /webhooks/stripe {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host            $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://127.0.0.1:26628;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl;                             # cert lines usually added by `certbot --nginx`
    # ssl_certificate     /etc/letsencrypt/live/voltjs.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/voltjs.com/privkey.pem;
}

server {                                         # HTTP → HTTPS
    listen 80;
    server_name voltjs.com www.voltjs.com;
    return 301 https://$host$request_uri;
}
```

## Verify

```bash
curl -sX POST https://voltjs.com/api/register \
  -H 'content-type: application/json' -d '{"app":"smoke"}'
# → {"ok":true,"token":"volt_…","tier":"free","dailyCap":100000}
```

> `/admin/*` on the gateway is intentionally **not** proxied — it's admin-token-gated and
> stays off the public web. Only `/api/` and `/webhooks/stripe` are exposed.
