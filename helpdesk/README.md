# Help Desk — a simple Volt app

A no-build help desk: public ticket submission with a per-ticket thread, plus a key-gated
staff inbox. Built with the Volt signals library (`public/volt.js`); storage is a JSON file
(`data/tickets.json`) — no database to set up.

## Run

```bash
npm install        # inside the volt monorepo it also resolves the hoisted express
npm run dev        # → http://localhost:26706
```

Set a real staff key in `.env` (`HELPDESK_KEY`) before exposing the staff inbox.

## How it works

- **Customers** submit at `/` (name, email, subject, message) → get a ticket reference and a
  private link `#/t/<id>` (the unguessable id is the access token) to track status and reply.
- **Staff** sign in at `#/staff` with `HELPDESK_KEY`, then see every ticket, reply, and set
  status — **open / pending / resolved**. A staff reply moves *open → pending*; a customer
  reply reopens a *resolved* ticket.

## API

| Method | Path | Who |
| --- | --- | --- |
| `POST` | `/api/tickets` | public — create `{name,email,subject,body}` → `{id,ref}` |
| `GET` | `/api/tickets/:id` | public — the thread (id = access token) |
| `POST` | `/api/tickets/:id/reply` | public — add a customer message |
| `GET` | `/api/staff/tickets?status=` | staff (`x-staff-key`) — list + counts |
| `GET` | `/api/staff/tickets/:id` | staff — one thread |
| `POST` | `/api/staff/tickets/:id/reply` | staff — reply |
| `POST` | `/api/staff/tickets/:id/status` | staff — set `open`/`pending`/`resolved` |

## Data model

```js
{ id, ref, name, email, subject, status, createdAt, updatedAt,
  messages: [{ from: "user" | "staff", body, at }] }
```

## Upgrade path

This stays deliberately simple (JSON file + one shared staff key). For production, move to the
Volt add-ons — `db` (MongoDB), `auth` (magic-link staff login), `mailer` (email on reply):

```bash
npx create-volt add db auth mailer
```
