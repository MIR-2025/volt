// server.js — minimal dev server for a Volt app. Express serves the static
// client and the index view; Socket.io carries the hot-reload signal; a file
// watcher on views/ and public/ broadcasts a (debounced) reload on any save.
//
// Cross-platform: paths are resolved relative to this file, and the watcher
// falls back to a manual recursive walk where native recursive fs.watch is
// unavailable (older Linux Node builds).
//
//   npm run dev            # start the dev server
//   PORT=4000 npm run dev  # override the port

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server as SocketServer } from "socket.io";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "views", "index.html")));

const server = http.createServer(app);
const io = new SocketServer(server);

// --- Hot reload: watch views/ + public/, debounce bursts, broadcast a reload ---
const watchDirs = ["views", "public"].map((d) => path.join(__dirname, d));
let timer = null;
function onChange(file) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(`[volt] change: ${file ?? "?"} → reload`);
    io.emit("volt:reload");
  }, 80);
}

// Watch a directory recursively. Tries native recursive fs.watch first; if the
// platform/runtime doesn't support it, walks the tree and watches each dir.
function watchRecursive(dir) {
  try {
    fs.watch(dir, { recursive: true }, (_event, file) => onChange(file));
    return;
  } catch {
    // Native recursive watch unsupported — fall back to per-directory watchers.
  }
  const watchDir = (d) => {
    try {
      fs.watch(d, (_event, file) => onChange(file));
    } catch {
      /* directory vanished between walk and watch — ignore */
    }
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) watchDir(path.join(d, entry.name));
    }
  };
  watchDir(dir);
}

for (const dir of watchDirs) watchRecursive(dir);

server.listen(PORT, () => console.log(`⚡ Volt dev server → http://localhost:${PORT}`));
