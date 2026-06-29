# Studio

An ephemeral, localhost-only data browser — like Prisma Studio.

```
npm run dev -- --studio
```

It connects the database in your `.env` and is **never a route in the running app** — it exists only while you run it, binds `127.0.0.1`, and disappears on Ctrl-C. Shell/SSH access is the auth; internal collections (auth tokens/sessions) are hidden.
