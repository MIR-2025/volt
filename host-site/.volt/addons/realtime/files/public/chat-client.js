// chat-client.js — thin browser wrapper around the Socket.io chat events.
// Pair it with Volt signals in your app.js. Requires the socket.io client
// (load /socket.io/socket.io.js before your module).
//
//   import { createChat } from "/chat-client.js";
//   const chat = createChat({
//     onHistory:  ({ room, messages }) => ...,
//     onMessage:  (msg) => ...,
//     onPresence: ({ room, users }) => ...,
//     onTyping:   ({ name }) => ...,
//   });
//   chat.join("general");
//   chat.send("general", "hello");
//   chat.typing("general");

export function createChat({ onHistory, onMessage, onPresence, onTyping } = {}) {
  if (!window.io) throw new Error("Socket.io client not loaded — add <script src=\"/socket.io/socket.io.js\"></script>");
  const socket = window.io();
  if (onHistory) socket.on("chat:history", onHistory);
  if (onMessage) socket.on("chat:message", onMessage);
  if (onPresence) socket.on("chat:presence", onPresence);
  if (onTyping) socket.on("chat:typing", onTyping);

  return {
    socket,
    join: (room) => socket.emit("chat:join", { room }),
    send: (room, body) => socket.emit("chat:message", { room, body }),
    typing: (room) => socket.emit("chat:typing", { room }),
  };
}
