# create-volt template ideas

Candidate `--template <name>` starters. ✅ = shipped. Each reuses the machinery
already built: magic-link auth, Socket.io, and the memory/Mongo/MySQL/Postgres
storage layer.

## Minimal
- **default** ✅ — Counter + Todos signal demo
- **blank** — empty `mount()`, no demo. A clean starting point for real work.

## Real-time (Socket.io)
- **guestbook** ✅ — live message board
- **chat** ✅ — multi-room chat with typing indicators + presence ("who's online")
- **poll** — create a poll, vote, results bars update live
- **kanban** — drag-drop board that syncs across tabs
- **pixel-canvas** — r/place-style shared grid; each cell click broadcasts
- **leaderboard** — live scores/ranking

## Auth & accounts (magic-link)
- **auth-starter** — magic-link login + a protected `/dashboard`, nothing else
- **profile** — sign in, edit a profile, persisted

## CRUD / data (storage adapters)
- **notes** — create/edit/delete notes that persist
- **blog** — markdown posts + public index
- **bookmarks** — save links with tags
- **url-shortener** — short links + live click counts

## Practical starters
- **contact-form** — form → DB + email (reuses the mailer)
- **waitlist** — email capture + confirmation (landing pages)
- **dashboard** — Bootstrap admin shell with live cards
- **upload** — file upload + gallery

## Suggested order
1. `blank` — people immediately want a non-demo start
2. `auth-starter` — the most reused pattern
3. `chat` ✅ — flashiest real-time showcase; stress-tests presence
