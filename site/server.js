// server.js — the Volt product + docs site. A plain static server with Volt's
// hot-reload, built with Volt itself. Binds loopback by default (it sits behind
// nginx on the server); override with HOST=0.0.0.0 for direct local access.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server as SocketServer } from "socket.io";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 26628;
const HOST = process.env.HOST || "127.0.0.1";

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "views", "index.html")));

const server = http.createServer(app);
const io = new SocketServer(server);
let timer = null;
const reload = () => {
  clearTimeout(timer);
  timer = setTimeout(() => io.emit("volt:reload"), 80);
};
for (const d of ["public", "views"]) {
  try {
    fs.watch(path.join(__dirname, d), { recursive: true }, reload);
  } catch {
    /* ignore */
  }
}

server.listen(PORT, HOST, () => console.log(`⚡ Volt site → http://${HOST}:${PORT}`));
