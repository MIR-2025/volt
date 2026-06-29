# Add-ons

Apps ship with add-ons bundled but off. The wizard turns them on — pure config: it writes `.env`, adds packages, runs `npm install`, and the app auto-wires what's enabled.

```
npm run dev -- --edit
```

| Add-on | What it gives you |
| --- | --- |
| **db** | Document store: memory / MongoDB / MySQL / Postgres — one interface. |
| **mailer** | Console (dev) / SMTP (prod) email. |
| **auth** | Magic-link login + sessions (pulls in db + mailer). |
| **realtime** | Socket.io chat: rooms, presence, typing (pulls in db). |
| **pages** | Markdown pages served at `/<slug>` (pulls in marked). |
| **media** | Uploads to local disk or any S3-compatible store (pulls in auth). |
