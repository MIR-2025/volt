# pow-captcha-js

**Invisible proof-of-work spam protection.** A stateless, HMAC-signed challenge the visitor's
browser solves in about a second — no puzzle to click, no third-party script, no visitor tracking,
and zero dependencies. A drop-in captcha alternative for any Node app.

It doesn't test whether someone is human. It makes each submission cost a little CPU. A person
sending one message pays nothing they'll notice; a bot sending ten thousand pays that cost ten
thousand times. That's the whole idea — you price *volume*, not cleverness. (Lineage:
[Hashcash](https://en.wikipedia.org/wiki/Hashcash), 1997.)

## Why not reCAPTCHA / hCaptcha / image captchas?

- **Image & text captchas are solved by AI now** — an LLM beats a human at them — while still
  punishing real users and wrecking accessibility.
- **Third-party widgets** (reCAPTCHA, hCaptcha, Turnstile) ship your visitors' data to Google or
  Cloudflare on every page with a form.
- **pow-captcha-js** runs entirely on your own server and the visitor's own browser. Nothing about a
  submission ever leaves your app. There's nothing to look at, nothing to click, and no account.

## Install

```sh
npm i pow-captcha-js
```

Zero dependencies. ESM. Node ≥ 16.

## Quick start (Express)

```js
import express from "express";
import { createPow } from "pow-captcha-js";

const app = express();
app.use(express.json());

const pow = createPow({ secret: process.env.POW_SECRET }); // a long random string, unique per server

app.get("/pow",    pow.routes().challenge); // hands out a challenge
app.get("/pow.js", pow.routes().script);    // the ~700-byte browser solver

app.post("/contact", (req, res) => {
  if (!pow.verify(req.body)) return res.status(403).json({ error: "verification failed — reload and retry" });
  // …it's a real submission; handle it…
  res.json({ ok: true });
});
```

## Quick start (no framework, `node:http`)

The route handlers are plain `(req, res)` functions, so they work without Express too:

```js
import http from "node:http";
import { createPow } from "pow-captcha-js";

const pow = createPow({ secret: process.env.POW_SECRET });
const r = pow.routes();

http.createServer((req, res) => {
  const path = req.url.split("?")[0];
  if (req.method === "GET" && path === "/pow")    return r.challenge(req, res);
  if (req.method === "GET" && path === "/pow.js") return r.script(req, res);
  // …your own routes; call pow.verify(parsedBody) on protected POSTs…
}).listen(3000);
```

## In the browser

```html
<script src="/pow.js"></script>
<script>
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const solved = await pow.fetchAndSolve();          // {salt,bits,exp,sig,nonce}, ~1s, invisible
    await fetch("/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...formData, ...solved }), // merge the solved token into your body
    });
  });
</script>
```

`pow.fetchAndSolve(base)` fetches a challenge and grinds it with Web Crypto. Pass a `base` origin if
your API is on another host (and set `cors: true` on the server).

## API

### `createPow(options) → pow`

| option | default | meaning |
|---|---|---|
| `secret` | `process.env.POW_SECRET` | **Required.** HMAC key. A long random string, unique per server. |
| `bits` | `18` | Base difficulty (leading zero bits). ~1s in a browser at 18. **+1 bit doubles the attacker's cost.** |
| `maxBits` | `28` | Ceiling for escalation (see `challenge(extraBits)`). |
| `ttl` | `120000` | Challenge lifetime in ms (min 1000). |
| `clientPath` / `path` | `"/pow"` | The URL the browser fetches a challenge from (set this if a proxy rewrites the path). |
| `global` | `"pow"` | The browser global the solver is exposed as (`window.pow`). |
| `cors` | `false` | Set permissive CORS headers on the built-in routes (for cross-origin forms). |
| `seen` | in-memory `Map` | The replay store. Pass a Redis-backed Map-like to share across processes. |

### `pow.challenge(extraBits = 0) → { salt, bits, exp, sig }`
Mint a challenge. `extraBits` raises difficulty above the base (up to `maxBits`) — hand a suspicious
IP a harder problem without touching honest visitors.

### `pow.verify(body) → boolean`
`true` only if `body` (`{salt,bits,exp,sig,nonce}`) is a genuine, unexpired, sufficiently-solved,
not-yet-used challenge. Never throws on garbage input — returns `false`.

### `pow.routes() → { challenge, script }`
Ready-made `(req, res)` handlers for `GET /pow` and `GET /pow.js`.

### `pow.clientScript() → string`
The browser solver as a self-contained IIFE string, if you'd rather inline it than serve `/pow.js`.

## Security notes

- **One secret per server.** Each server issues *and* verifies its own challenges, so they never need
  to share a secret — give each its own random `POW_SECRET`. (Sharing one would only weaken them.)
- **Replay is blocked** by a one-time-use guard on each challenge's salt. The default store is an
  in-process `Map` (perfect for a single instance). Running multiple processes behind a load
  balancer? Pass a `seen` backed by Redis so a salt used on one node is known to all.
- **Tune under attack** with `bits`. Each extra bit doubles the grind. 18 is a good default (~1s);
  raise it if you're being hammered.
- **Layer it.** PoW prices volume; pair it with a hidden honeypot field and a per-IP rate limit for
  defense in depth. It is not a substitute for authentication or authorization.

## How it works

1. `GET /pow` returns `{ salt, bits, exp, sig }` where `sig = HMAC-SHA256("salt.bits.exp", secret)`.
   No server-side state is stored — the signature *is* the state.
2. The browser finds a `nonce` such that `SHA-256(salt + ":" + nonce)` has at least `bits` leading
   zero bits, then submits `{ salt, bits, exp, sig, nonce }` with the form.
3. `verify()` re-checks the HMAC in constant time, confirms it hasn't expired, confirms the nonce
   actually meets the difficulty, and marks the salt used so it can't be replayed.

Standard SHA-256 on both sides — Node's `crypto` and the browser's Web Crypto agree exactly.

## License

MIT © Richard Whitney
