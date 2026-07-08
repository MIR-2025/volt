// chat-ui.js — live chat panel (frontend for the realtime add-on). Served at
// /chat-ui.js when realtime is enabled; mounted by public/app.js.
// Identity comes from the auth session (if auth is on), else "guest-…".
// All message text and names render through Volt holes → text nodes (escaped),
// so nothing a user types can inject markup.
import { signal, computed, html } from "/volt.js";
import { createChat } from "/chat-client.js";

const ROOMS = ["general", "random"];
const MAX = 500; // keep in sync with the server cap

const fmtTime = (ts) => {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

export function chatPanel() {
  const room = signal(ROOMS[0]);
  const messages = signal([]);
  const online = signal([]);
  const typers = signal([]);
  const draft = signal("");

  const timers = new Map();
  const sawTyping = (name) => {
    clearTimeout(timers.get(name));
    if (!typers().includes(name)) typers([...typers(), name]);
    timers.set(
      name,
      setTimeout(() => {
        typers(typers().filter((n) => n !== name));
        timers.delete(name);
      }, 2500),
    );
  };

  let chat;
  try {
    chat = createChat({
      onHistory: ({ room: r, messages: m }) => {
        if (r === room()) messages(m);
      },
      onMessage: (m) => {
        if (m.room === room()) messages([...messages(), m]);
      },
      onPresence: ({ room: r, users }) => {
        if (r === room()) online(users);
      },
      onTyping: ({ name }) => sawTyping(name),
    });
    chat.join(room());
  } catch {
    /* socket.io client missing — panel still renders, just inert */
  }

  const switchRoom = (r) => {
    if (r === room() || !chat) return;
    room(r);
    messages([]);
    online([]);
    typers([]);
    chat.join(r);
  };

  let lastTyped = 0;
  const onType = (e) => {
    draft(e.target.value);
    const now = Date.now();
    if (chat && now - lastTyped > 800) {
      chat.typing(room());
      lastTyped = now;
    }
  };
  const send = () => {
    const body = draft().trim();
    if (!body || !chat) return;
    chat.send(room(), body.slice(0, MAX));
    draft("");
  };

  const typingLine = computed(() => {
    const t = typers().filter((n) => n);
    if (!t.length) return "";
    return t.length === 1 ? `${t[0]} is typing…` : `${t.length} people are typing…`;
  });

  const roomTab = (r) =>
    html`<button class=${() => "btn btn-sm " + (room() === r ? "btn-primary" : "btn-outline-secondary")} onclick=${() => switchRoom(r)}>#${r}</button>`;

  const messageRow = (m) =>
    html`<div class="py-1 small">
      <span class="accent fw-semibold">${m.name}</span>
      <span class="text-muted ms-1">${fmtTime(m.createdAt)}</span>
      <div>${m.body}</div>
    </div>`;

  return html`<div class="card-x p-4 mb-4">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h2 class="h6 mb-0">Chat <span class="text-muted small">— realtime</span></h2>
      <div class="d-flex gap-1">${ROOMS.map(roomTab)}</div>
    </div>
    <div class="small text-muted mb-2">Online: ${() => online().join(", ") || "—"}</div>
    <div style="max-height:220px;overflow:auto">
      ${() => (messages().length ? messages().map(messageRow) : html`<span class="text-muted small">No messages yet.</span>`)}
    </div>
    <div style="height:1.2em">${() => (typingLine() ? html`<span class="text-muted small fst-italic">${typingLine}</span>` : null)}</div>
    <div class="input-group mt-2">
      <input class="form-control" placeholder=${() => "Message #" + room() + "…"} maxlength=${String(MAX)}
             value=${draft} oninput=${onType} onkeydown=${(e) => e.key === "Enter" && send()} />
      <button class="btn btn-primary" onclick=${send}>Send</button>
    </div>
  </div>`;
}
