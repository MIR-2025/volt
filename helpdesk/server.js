// server.js — a simple help desk. Public ticket submission + a per-ticket thread (the
// unguessable ticket id is the submitter's access token), and a staff inbox gated by a
// single key. Storage is a JSON file — no database to set up. Swap in the Volt db/auth
// add-ons (Mongo + magic-link) when you outgrow it.
import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// tiny .env loader (real process.env wins) — no dependency
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "").trim();
  }
} catch {}

const PORT = Number(process.env.PORT) || 26706;
const STAFF_KEY = process.env.HELPDESK_KEY || "";
const DATA = path.join(__dirname, "data", "tickets.json");
const STATUSES = ["open", "pending", "resolved"];

if (!STAFF_KEY || STAFF_KEY === "change-this-staff-key")
  console.warn("⚠ HELPDESK_KEY is unset/default — set a real key in .env before exposing the staff inbox.");

const load = () => { try { return JSON.parse(fs.readFileSync(DATA, "utf8")); } catch { return []; } };
const save = () => { fs.mkdirSync(path.dirname(DATA), { recursive: true }); fs.writeFileSync(DATA, JSON.stringify(tickets, null, 2)); };
let tickets = load();

const clean = (v, max = 5000) => String(v == null ? "" : v).replace(/\r/g, "").slice(0, max);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const now = () => new Date().toISOString();
// what a submitter (or staff) sees for one ticket — the full thread
const view = (t) => ({ id: t.id, ref: t.ref, name: t.name, email: t.email, subject: t.subject, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt, messages: t.messages });
// a compact row for the staff list
const row = (t) => ({ id: t.id, ref: t.ref, name: t.name, email: t.email, subject: t.subject, status: t.status, updatedAt: t.updatedAt, count: t.messages.length });
const find = (id) => tickets.find((t) => t.id === id);

const app = express();
app.use(express.json({ limit: "128kb" }));
app.use((_req, res, next) => { res.set("X-Content-Type-Options", "nosniff"); res.set("X-Frame-Options", "SAMEORIGIN"); res.set("Referrer-Policy", "same-origin"); next(); });
app.use(express.static(path.join(__dirname, "public")));

// ---- public ----
app.post("/api/tickets", (req, res) => {
  const { name, email, subject, body } = req.body || {};
  if (!isEmail(clean(email, 320))) return res.status(400).json({ error: "a valid email is required" });
  if (!clean(subject).trim()) return res.status(400).json({ error: "a subject is required" });
  if (!clean(body).trim()) return res.status(400).json({ error: "a message is required" });
  const t = {
    id: crypto.randomBytes(18).toString("base64url"),                 // unguessable — the access token
    ref: "HD-" + crypto.randomBytes(4).toString("hex").toUpperCase(), // human-friendly reference
    name: clean(name, 120) || "Anonymous",
    email: clean(email, 320),
    subject: clean(subject, 200),
    status: "open",
    createdAt: now(), updatedAt: now(),
    messages: [{ from: "user", body: clean(body), at: now() }],
  };
  tickets.push(t); save();
  res.json({ ok: true, id: t.id, ref: t.ref });
});

app.get("/api/tickets/:id", (req, res) => {
  const t = find(req.params.id);
  if (!t) return res.status(404).json({ error: "ticket not found" });
  res.json(view(t));
});

app.post("/api/tickets/:id/reply", (req, res) => {
  const t = find(req.params.id);
  if (!t) return res.status(404).json({ error: "ticket not found" });
  const body = clean(req.body?.body);
  if (!body.trim()) return res.status(400).json({ error: "a message is required" });
  t.messages.push({ from: "user", body, at: now() });
  if (t.status === "resolved") t.status = "open"; // a customer reply reopens
  t.updatedAt = now(); save();
  res.json(view(t));
});

// ---- staff (single-key gate) ----
const staff = (req, res, next) => {
  if (!STAFF_KEY || (req.get("x-staff-key") || "") !== STAFF_KEY) return res.status(401).json({ error: "staff key required" });
  next();
};

app.get("/api/staff/tickets", staff, (req, res) => {
  const f = String(req.query.status || "");
  let list = tickets.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  if (STATUSES.includes(f)) list = list.filter((t) => t.status === f);
  const counts = STATUSES.reduce((o, s) => ((o[s] = tickets.filter((t) => t.status === s).length), o), { all: tickets.length });
  res.json({ ok: true, tickets: list.map(row), counts });
});

app.get("/api/staff/tickets/:id", staff, (req, res) => {
  const t = find(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  res.json(view(t));
});

app.post("/api/staff/tickets/:id/reply", staff, (req, res) => {
  const t = find(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  const body = clean(req.body?.body);
  if (!body.trim()) return res.status(400).json({ error: "a message is required" });
  t.messages.push({ from: "staff", body, at: now() });
  if (t.status === "open") t.status = "pending"; // replied → awaiting the customer
  t.updatedAt = now(); save();
  res.json(view(t));
});

app.post("/api/staff/tickets/:id/status", staff, (req, res) => {
  const t = find(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  const status = String(req.body?.status || "");
  if (!STATUSES.includes(status)) return res.status(400).json({ error: "invalid status" });
  t.status = status; t.updatedAt = now(); save();
  res.json(view(t));
});

app.listen(PORT, () => console.log(`⛑  Help desk at http://localhost:${PORT}  (staff inbox: #/staff)`));
