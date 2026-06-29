// auth.js — magic-link login (no passwords), per the house auth convention:
//   1. user submits email → we store a one-time token + the requesting UA,
//      and email a link containing the token
//   2. opening the link shows a confirm page (must be the same browser/UA)
//   3. clicking "Confirm" consumes the token and starts a session cookie
//
// Tokens expire after TOKEN_TTL and are single-use. Sessions are random ids
// kept in the store and carried in an httpOnly cookie.

import crypto from "node:crypto";

const TOKEN_TTL = 15 * 60 * 1000; // 15 minutes
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_COOKIE = "gb_sid";

const token = () => crypto.randomBytes(32).toString("hex");
const normalizeEmail = (e) => String(e || "").trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Step 1: create + email a magic link. Returns { ok } or throws on bad input.
export async function requestLogin(store, mailer, { email, ua, baseUrl }) {
  const addr = normalizeEmail(email);
  if (!validEmail(addr)) throw new Error("Please enter a valid email address.");
  const tok = token();
  await store.putToken({ token: tok, email: addr, ua: ua || "", expiresAt: Date.now() + TOKEN_TTL });
  const link = `${baseUrl}/verify?token=${tok}`;
  await mailer.sendMagicLink(addr, link);
  return { ok: true };
}

// Step 3: confirm a token → start a session. Returns { sessionId, email }.
export async function confirmLogin(store, { token: tok, ua }) {
  const rec = await store.getToken(tok);
  if (!rec) throw new Error("This login link is invalid.");
  if (rec.used) throw new Error("This login link was already used.");
  if (rec.expiresAt < Date.now()) throw new Error("This login link has expired.");
  if (rec.ua && ua && rec.ua !== ua) throw new Error("Open the link in the same browser you requested it from.");

  await store.useToken(tok);
  const sessionId = token();
  await store.putSession({ id: sessionId, email: rec.email, expiresAt: Date.now() + SESSION_TTL });
  return { sessionId, email: rec.email };
}

// Parse a cookie header into a plain object.
export function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Resolve the current session from a request, or null.
export async function sessionFromReq(store, req) {
  const sid = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!sid) return null;
  return await store.getSession(sid);
}

export const cookieMaxAgeSeconds = SESSION_TTL / 1000;
