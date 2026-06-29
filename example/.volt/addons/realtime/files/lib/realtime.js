// realtime.js — Socket.io live chat: rooms, presence, and typing indicators.
// Messages persist to the `messages` collection (db add-on). User identity
// comes from the auth session cookie when the auth add-on is present;
// otherwise each socket is an anonymous "guest-XXXX".

import crypto from "node:crypto";

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i !== -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Resolve a display name for a socket: the signed-in email, or a guest id.
async function identify(socket, store) {
  try {
    const sid = parseCookies(socket.handshake.headers.cookie)["volt_sid"];
    if (sid && store) {
      const s = await store.collection("auth_sessions").get(sid);
      if (s && s.expiresAt > Date.now()) return s.email;
    }
  } catch {
    /* ignore — fall through to guest */
  }
  return "guest-" + crypto.randomBytes(2).toString("hex");
}

export function attachRealtime(io, { store } = {}) {
  const messages = store ? store.collection("messages") : null;
  const presence = new Map(); // room -> Map(socketId -> name)

  const usersIn = (room) => [...new Set([...(presence.get(room)?.values() || [])])];
  const broadcastPresence = (room) => io.to(room).emit("chat:presence", { room, users: usersIn(room) });

  io.on("connection", async (socket) => {
    const name = await identify(socket, store);
    let current = null;

    socket.on("chat:join", async ({ room }) => {
      if (!room) return;
      if (current) {
        socket.leave(current);
        presence.get(current)?.delete(socket.id);
        broadcastPresence(current);
      }
      current = String(room);
      socket.join(current);
      if (!presence.has(current)) presence.set(current, new Map());
      presence.get(current).set(socket.id, name);

      const history = messages ? (await messages.find({ room: current })).sort((a, b) => a.createdAt - b.createdAt).slice(-100) : [];
      socket.emit("chat:history", { room: current, messages: history });
      broadcastPresence(current);
    });

    socket.on("chat:message", async ({ room, body }) => {
      const text = String(body || "").trim();
      if (!room || !text) return;
      const msg = { id: crypto.randomBytes(8).toString("hex"), room: String(room), name, body: text.slice(0, 500), createdAt: Date.now() };
      if (messages) await messages.put(msg.id, msg);
      io.to(String(room)).emit("chat:message", msg);
    });

    socket.on("chat:typing", ({ room }) => {
      if (room) socket.to(String(room)).emit("chat:typing", { name });
    });

    socket.on("disconnect", () => {
      if (current) {
        presence.get(current)?.delete(socket.id);
        broadcastPresence(current);
      }
    });
  });
}
