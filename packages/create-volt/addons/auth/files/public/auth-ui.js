// auth-ui.js — magic-link sign-in panel (frontend for the auth add-on).
// Served at /auth-ui.js when auth is enabled; mounted by public/app.js.
// All dynamic text is rendered through Volt holes, which create text nodes
// (HTML-escaped) — so emails/notices can't inject markup.
import { signal, html } from "/volt.js";

const api = async (url, body) => {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({}));
};

// local part only, for a friendlier "signed in as" (still escaped on render)
const shortName = (email) => String(email || "").split("@")[0];

export function authPanel() {
  const me = signal(null);
  const email = signal("");
  const notice = signal("");
  const busy = signal(false);

  api("/api/me").then((r) => me(r.email || null));

  async function sendLink(e) {
    e?.preventDefault?.();
    const addr = email().trim();
    if (!addr || busy()) return;
    busy(true);
    notice("Sending…");
    const r = await api("/api/login", { email: addr });
    busy(false);
    notice(r.ok ? (r.dev ? "Magic link printed to the server console — open it to sign in." : `Magic link sent to ${addr}.`) : r.error || "Could not send link.");
  }
  async function logout() {
    await api("/api/logout", {});
    me(null);
    notice("");
  }

  const signedOut = () =>
    html`<form class="d-flex gap-2" onsubmit=${sendLink} autocomplete="on">
      <input class="form-control" type="email" name="email" placeholder="you@example.com"
             maxlength="320" autocomplete="email" inputmode="email" required
             value=${email} oninput=${(e) => email(e.target.value)} />
      <button class="btn btn-primary" type="submit" disabled=${() => busy()}>Send magic link</button>
    </form>`;

  const signedIn = () =>
    html`<div class="d-flex justify-content-between align-items-center">
      <span class="text-muted small">Signed in as <span class="accent fw-semibold">${() => shortName(me())}</span></span>
      <button class="btn btn-sm btn-outline-secondary" onclick=${logout}>Sign out</button>
    </div>`;

  return html`<div class="card-x p-4 mb-4">
    <h2 class="h6 mb-3">Account <span class="text-muted small">— magic-link auth</span></h2>
    ${() => (me() ? signedIn() : signedOut())}
    ${() => (notice() ? html`<p class="small text-muted mb-0 mt-2">${notice}</p>` : null)}
  </div>`;
}
