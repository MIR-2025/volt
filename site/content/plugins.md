# Add-ons & plugins

WordPress's plugin economy is a big part of its moat — and the part a migrated site loses. Volt's answer is a **third-party add-on** model: equivalent functionality (forms, commerce, search, SEO…) shipped as small npm packages you install and own, instead of a plugin sprawl you configure in a dashboard.

## Use one (in your app)

```
npx create-volt add forms
```

That installs `volt-addon-forms` and adds `forms` to `VOLT_ADDONS` in `.env`. Restart and it's wired.

## Build one

```
npx create-volt create-addon forms
```

This scaffolds a publishable `volt-addon-forms/` package. The whole contract is one function:

```
// index.js
export function register({ app, express, io, store, mailer, env, log }) {
  app.post("/api/forms/submit", express.json(), async (req, res) => {
    await store.collection("submissions").put(crypto.randomUUID(), req.body);
    res.json({ ok: true });
  });
  log("ready");
}
```

`register(ctx)` runs once at startup and receives:

| ctx | what it is |
| --- | --- |
| `app` | the Express app — add routes |
| `express` | the host's Express — `express.static` / `express.Router` with no dependency of your own |
| `io` | Socket.io server (if the realtime add-on is on) |
| `store` | the database — `collection(name).{put,get,all,find,delete}` (if db is on) |
| `mailer` | send mail (if the mailer add-on is on) |
| `env`, `log` | environment + a namespaced logger |

Serve your own frontend assets from `public/`, add any routes/sockets you need, and use the host's database — no separate setup.

## Publish + distribute

```
npm publish        # publishes volt-addon-forms
```

Anyone then runs `npx create-volt add forms`. Discovery is by convention: `VOLT_ADDONS` entries that aren't built-ins are loaded from `volt-addon-<name>` (or a local `.volt/addons/<name>/index.js`).

## Why this beats the plugin model

Add-ons are **code you install and read**, not opaque dashboard configuration. No standing admin to attack, no plugin-update treadmill, and the same security posture as the rest of your app. You bring over the *functionality* you need — not 50 plugins' worth of surface area.
