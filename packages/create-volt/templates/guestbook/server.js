// server.js — guestbook dev/prod server. Express serves the static client and
// the views; Socket.io pushes new messages live; storage is pluggable
// (memory | mongodb | mysql | postgres) via the DB_DRIVER env var.
//
//   npm run dev                         # in-memory store, magic links to console
//   DB_DRIVER=postgres DATABASE_URL=... npm start
//
// Run under PM2 in production:  pm2 start server.js --name guestbook ; pm2 log

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server as SocketServer } from "socket.io";
import { createStore } from "./lib/store.js";
import { createMailer } from "./lib/mailer.js";
import { createRouter } from "./router.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Auto-load .env (no --env-file flag needed; works the same on Windows). Never
// overrides a variable already set in the environment.
const ENV_PATH = path.join(__dirname, ".env");
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const PORT = Number(process.env.PORT) || 26629;

const store = await createStore();
const mailer = await createMailer();

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const io = new SocketServer(server);

app.use("/", createRouter({ store, mailer, io }));

server.listen(PORT, () => {
  console.log(`📖 Guestbook → http://localhost:${PORT}`);
  console.log(`   storage: ${store.name}   mail: ${mailer.name}`);
});
