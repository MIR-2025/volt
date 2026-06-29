# Customize with AI

Volt is unusually friendly to AI coding tools (Claude Code, Cursor, Copilot, …) — and that's not an accident. The qualities that make it small make it easy for an AI to understand and change correctly.

## Why it works so well

- **One readable file.** The entire UI library is ~260 lines of plain JS — an AI can hold all of it in context and reason about the whole framework, not a slice of a giant ecosystem.
- **No build step.** The AI edits a file, you save, it hot-reloads. There's no bundler/transpiler config to get wrong, and no opaque error surface between the code and the result.
- **Plain files, not a database.** Your app _is_ `server.js`, `public/app.js`, `views/`, and `.env` — readable, diffable, version-controlled. There's no hidden config in a DB (the WordPress problem) for an AI to be blind to.
- **Safe by construction.** Volt interpolations render as escaped text nodes, so an AI can't accidentally introduce an XSS hole by templating user data.

## How to do it

Open the app in your AI editor, point it at the relevant files, and ask. Give it `public/volt.js` plus the file you're changing, and mention the API ([signal / computed / el / html / mount](/docs/library)). Then run `npm run dev` and watch it hot-reload.

```
npm run dev      # keep it running; AI edits hot-reload live
```

## Prompts that just work

- "Add a _priority_ field to tasks — a low/med/high dropdown — and sort the list by it."
- "Add a dark/light theme toggle stored in localStorage."
- "Add pagination to the notes list, 20 per page."
- "When a new item is added, email me a summary using the mailer add-on."
- "Turn on realtime so the list updates live across tabs." (the AI enables it via `--edit` + the realtime add-on)

Tip: have the AI _run the app and verify in a browser_, not just write code. No build step means the feedback loop is seconds.

Volt itself — and this docs content — are authored this way.
