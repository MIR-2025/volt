# Getting started

One command scaffolds an app. No build step, no config to hand-write.

```
npm create volt@latest my-app
```
```
cd my-app && npm run dev
```

The **first run opens a setup wizard** in your browser — tick the features you want (auth, realtime, a database), fill in settings, click _Apply_, and the app starts. On a headless/remote box it prints a link + an SSH-tunnel command. Reopen settings anytime with `npm run dev -- --edit`.

Requirements: Node.js ≥ 16.7. Works on Linux, macOS, and Windows — `.env` is auto-loaded, no `--env-file` flag.
