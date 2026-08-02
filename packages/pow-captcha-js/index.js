// pow-captcha — invisible proof-of-work spam protection. Zero-dependency, framework-agnostic,
// self-hosted: no third party, no visitor tracking, and no puzzle for the human.
//
// A human pays nothing (~1s of hidden CPU in their own browser); a spammer pays that CPU *per
// submission*, which is what actually deters volume. The challenge is stateless — HMAC-signed —
// so the server stores nothing to issue one and verifies it with a constant-time MAC check.
// Standard SHA-256 on both sides (Node `crypto` and browser Web Crypto) so they agree exactly.
// Lineage: Hashcash (1997).
//
//   Server:  const pow = createPow({ secret: process.env.POW_SECRET });
//            app.get("/pow",    pow.routes().challenge);   // hands out a challenge
//            app.get("/pow.js", pow.routes().script);      // the ~700-byte browser solver
//            // in a protected POST handler:
//            if (!pow.verify(req.body)) return res.sendStatus(403);
//
//   Browser: <script src="/pow.js"></script>
//            const solved = await pow.fetchAndSolve();     // {salt,bits,exp,sig,nonce}
//            // merge `solved` into your form / JSON body before you POST it
//
import crypto from "node:crypto";

// Count the leading zero BITS of a hex digest — the unit PoW difficulty is measured in.
export function leadingZeroBits(hex) {
  let n = 0;
  for (const c of hex) {
    const v = parseInt(c, 16);
    if (v === 0) { n += 4; continue; }
    return n + (v < 2 ? 3 : v < 4 ? 2 : v < 8 ? 1 : 0);
  }
  return n;
}

export function createPow(opts = {}) {
  const secret = opts.secret || process.env.POW_SECRET;
  if (!secret) throw new Error("pow-captcha: a `secret` is required (pass { secret } or set POW_SECRET) — a long random string, unique per server.");
  const bits = Math.max(1, Math.min(30, Number(opts.bits ?? 18)));          // base difficulty (~1s in-browser at 18)
  const maxBits = Math.max(bits, Math.min(32, Number(opts.maxBits ?? 28))); // ceiling for escalation
  const ttl = Math.max(1000, Number(opts.ttl ?? 120000));                   // challenge lifetime (ms)
  const clientPath = opts.clientPath || opts.path || "/pow";               // the URL the browser fetches a challenge from
  const globalName = opts.global || "pow";                                  // exposes window.<globalName> in the browser
  const cors = !!opts.cors;                                                 // set permissive CORS on the built-in routes
  const seen = opts.seen || new Map();                                      // salt→exp replay guard (swap for a Redis-backed Map to scale)

  const sign = (salt, b, exp) => crypto.createHmac("sha256", secret).update(`${salt}.${b}.${exp}`).digest("hex");

  // Mint a challenge. `extraBits` raises difficulty above the base for a suspicious client, up to maxBits.
  function challenge(extraBits = 0) {
    const b = Math.max(bits, Math.min(maxBits, bits + (Number(extraBits) || 0)));
    const salt = crypto.randomBytes(12).toString("hex");
    const exp = Date.now() + ttl;
    return { salt, bits: b, exp, sig: sign(salt, b, exp) };
  }

  // Verify a solved challenge. True only if it is genuine (untampered HMAC), unexpired, at/above the
  // base difficulty, actually solved to its stated bits, and not already used (one-time replay guard).
  function verify(body) {
    const salt = String(body?.salt || "");
    const b = Number(body?.bits || 0);
    const exp = Number(body?.exp || 0);
    const sig = String(body?.sig || "");
    const nonce = String(body?.nonce ?? "");
    if (!salt || b < bits || b > maxBits || !(exp > Date.now())) return false;
    const want = sign(salt, b, exp);
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return false; // genuine + untampered
    const now = Date.now();
    for (const [k, e] of seen) if (e < now) seen.delete(k); // sweep expired
    if (seen.has(salt)) return false;                       // replay — one salt, one use
    if (leadingZeroBits(crypto.createHash("sha256").update(salt + ":" + nonce).digest("hex")) < b) return false; // work not actually done
    seen.set(salt, exp);
    return true;
  }

  // The browser solver as a self-contained IIFE string. Exposes window.<globalName> with
  // solve(challenge) and fetchAndSolve(base?) → the solved object to merge into your submission.
  function clientScript() {
    return `(function(){function z(b){var n=0;for(var i=0;i<b.length;i++){var x=b[i];if(x===0){n+=8;continue;}for(var m=7;m>=0;m--){if(x&(1<<m))return n;n++;}return n;}return n;}`
      + `async function solve(c){for(var k=0;;k++){var h=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(c.salt+':'+k)));`
      + `if(z(h)>=c.bits)return{salt:c.salt,bits:c.bits,exp:c.exp,sig:c.sig,nonce:k};if((k&2047)===0)await new Promise(function(r){setTimeout(r,0);});}}`
      + `async function fetchAndSolve(base){var c=await (await fetch((base||'')+${JSON.stringify(clientPath)})).json();return await solve(c);}`
      + `window[${JSON.stringify(globalName)}]={solve:solve,fetchAndSolve:fetchAndSolve};})();`;
  }

  // Optional (req,res) handlers — work in both node:http and Express (both expose writeHead/end).
  function setCors(req, res) {
    if (!cors) return;
    res.setHeader("Access-Control-Allow-Origin", (req && req.headers && req.headers.origin) || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Vary", "Origin");
  }
  function routes() {
    return {
      challenge(req, res) { setCors(req, res); const b = JSON.stringify(challenge()); res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(b) }); res.end(b); },
      script(req, res) { setCors(req, res); const b = clientScript(); res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600", "Content-Length": Buffer.byteLength(b) }); res.end(b); },
    };
  }

  return { challenge, verify, clientScript, routes, config: { bits, maxBits, ttl, clientPath, global: globalName, cors } };
}

export default createPow;
