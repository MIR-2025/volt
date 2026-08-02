// Self-test — run: node test.mjs   (exits non-zero on any failure)
import crypto from "node:crypto";
import { createPow, leadingZeroBits } from "./index.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("  ok  -", msg); } else { fail++; console.error("  FAIL -", msg); } };

// Grind a challenge exactly as the browser does — Node SHA-256 == Web Crypto SHA-256, so a
// solution found here is byte-for-byte what crypto.subtle would produce in a real browser.
function solve(c) {
  for (let k = 0; ; k++) {
    if (leadingZeroBits(crypto.createHash("sha256").update(c.salt + ":" + k).digest("hex")) >= c.bits) return { ...c, nonce: k };
  }
}
// The smallest nonce that does NOT meet the difficulty (for the "no work" case).
function unsolved(c) {
  for (let k = 0; ; k++) {
    if (leadingZeroBits(crypto.createHash("sha256").update(c.salt + ":" + k).digest("hex")) < c.bits) return { ...c, nonce: k };
  }
}

const pow = createPow({ secret: "test-secret-A", bits: 12, ttl: 60000 }); // low bits = fast test

// 1. a genuine, solved, fresh challenge verifies
const good = solve(pow.challenge());
ok(pow.verify(good) === true, "valid solved challenge verifies");

// 2. replay of the same salt is rejected
ok(pow.verify(good) === false, "replay (same salt reused) is rejected");

// 3. tampered signature is rejected
const t = solve(pow.challenge());
t.sig = t.sig.slice(0, -1) + (t.sig.endsWith("a") ? "b" : "a");
ok(pow.verify(t) === false, "tampered HMAC signature is rejected");

// 4. a nonce that doesn't meet the difficulty is rejected
ok(pow.verify(unsolved(pow.challenge())) === false, "insufficient-work nonce is rejected");

// 5. an expired challenge is rejected (genuine HMAC, but exp now in the past). ttl floors at 1000ms
//    (a challenge can't be minted uselessly short), so wait it out to prove expiry actually bites.
const expired = createPow({ secret: "test-secret-A", bits: 12, ttl: 1000 });
const oldOne = solve(expired.challenge());
await new Promise((r) => setTimeout(r, 1100));
ok(expired.verify(oldOne) === false, "expired challenge is rejected");

// 6. difficulty floor — a challenge minted below a verifier's base is rejected even if genuine+solved
const hi = createPow({ secret: "shared", bits: 18 });
const lo = createPow({ secret: "shared", bits: 12 }); // same secret, lower base
ok(hi.verify(solve(lo.challenge())) === false, "below-floor difficulty is rejected (no downgrade)");

// 7. escalation — a harder challenge (base+extra bits) still verifies
const esc = createPow({ secret: "test-secret-B", bits: 10, maxBits: 16 });
const hard = esc.challenge(4); // 14 bits
ok(hard.bits === 14, "escalation raises bits (10 + 4 = 14)");
ok(esc.verify(solve(hard)) === true, "escalated (harder) challenge verifies");

// 8. wrong secret can't forge — a challenge from a different secret is rejected
const other = createPow({ secret: "attacker-secret", bits: 12 });
ok(pow.verify(solve(other.challenge())) === false, "challenge signed with a different secret is rejected");

// 9. client script is self-contained and references the configured path + global
const scripted = createPow({ secret: "x", clientPath: "/api/pow", global: "myPow" });
const js = scripted.clientScript();
ok(js.includes("/api/pow") && js.includes("myPow") && js.includes("crypto.subtle"), "clientScript embeds path + global + Web Crypto");

// 10. missing/garbage body never throws, just returns false
ok(pow.verify(undefined) === false && pow.verify({}) === false && pow.verify({ salt: "x", sig: "z" }) === false, "malformed input returns false without throwing");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
