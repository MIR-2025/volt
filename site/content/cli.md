# CLI reference

```
npm create volt@latest <dir> [options]   # scaffold
  --template <name>   default | starter | guestbook
  --port <number>     dev port (default: derived from today's date)
  --start             scaffold, then run the dev server
  --no-git            don't init a git repo
  --skip-install      don't install dependencies

# inside an app:
npx create-volt@latest update     # refresh public/volt.js
npx create-volt@latest config     # open the setup wizard (= npm run dev -- --edit)
npx create-volt@latest studio     # ephemeral data browser
npx create-volt@latest import-wp  # import a live WordPress site (REST API)
npx create-volt@latest import-wxr # import a WordPress (WXR) export file into pages/
```

The dev port defaults to the creation date (YY+M+DD, e.g. `2026-06-28` -> `26628`) so apps made on different days never collide.
