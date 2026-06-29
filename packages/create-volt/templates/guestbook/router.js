// router.js — all HTTP routes for the guestbook. The index view is composed
// with a server-side header include (per the house convention: the index file
// pulls its header from an include defined here in the router).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  requestLogin,
  confirmLogin,
  sessionFromReq,
  SESSION_COOKIE,
  cookieMaxAgeSeconds,
} from "./lib/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsDir = path.join(__dirname, "views");

// Render a view, expanding `<!--#include name-->` against views/partials/name.html.
function render(name) {
  let html = fs.readFileSync(path.join(viewsDir, name), "utf8");
  return html.replace(/<!--#include\s+([\w-]+)-->/g, (_m, partial) => {
    const file = path.join(viewsDir, "partials", `${partial}.html`);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  });
}

const baseUrl = (req) => `${req.protocol}://${req.get("host")}`;
const setSessionCookie = (res, sid) =>
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${cookieMaxAgeSeconds}`,
  );

export function createRouter({ store, mailer, io }) {
  const router = express.Router();
  router.use(express.json());

  // --- pages ---
  router.get("/", (_req, res) => res.type("html").send(render("index.html")));
  router.get("/verify", (req, res) => {
    const token = String(req.query.token || "");
    res.type("html").send(render("confirm.html").replaceAll("{{TOKEN}}", encodeURIComponent(token)));
  });

  // --- auth ---
  router.post("/api/login", async (req, res) => {
    try {
      await requestLogin(store, mailer, {
        email: req.body?.email,
        ua: req.headers["user-agent"],
        baseUrl: baseUrl(req),
      });
      res.json({ ok: true, sent: true, dev: mailer.name === "console" });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.post("/api/confirm", async (req, res) => {
    try {
      const { sessionId, email } = await confirmLogin(store, {
        token: req.body?.token,
        ua: req.headers["user-agent"],
      });
      setSessionCookie(res, sessionId);
      res.json({ ok: true, email });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.post("/api/logout", async (req, res) => {
    const session = await sessionFromReq(store, req);
    if (session) await store.delSession(session.id);
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
    res.json({ ok: true });
  });

  router.get("/api/me", async (req, res) => {
    const session = await sessionFromReq(store, req);
    res.json({ email: session?.email || null });
  });

  // --- messages ---
  router.get("/api/messages", async (_req, res) => {
    res.json({ messages: await store.listMessages(100) });
  });

  router.post("/api/messages", async (req, res) => {
    const session = await sessionFromReq(store, req);
    if (!session) return res.status(401).json({ ok: false, error: "Sign in to post." });
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ ok: false, error: "Message is empty." });
    if (body.length > 500) return res.status(400).json({ ok: false, error: "Message too long (max 500)." });

    const message = await store.addMessage({
      id: crypto.randomBytes(8).toString("hex"),
      email: session.email,
      body,
      createdAt: Date.now(),
    });
    io.emit("message:new", message); // push to every open page
    res.json({ ok: true, message });
  });

  return router;
}
