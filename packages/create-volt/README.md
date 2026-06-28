# create-volt

Scaffold a new [Volt](https://github.com/) app in one command — a tiny,
**no-build**, signals-based UI with **Socket.io hot reload**. Think
`create-react-app`, but the whole framework is one ~260-line file you can read.

## Usage

```bash
npm create volt@latest my-app
# or
npx create-volt my-app
# or with pnpm / yarn / bun
pnpm create volt my-app
yarn create volt my-app
bun create volt my-app
```

Then:

```bash
cd my-app
npm run dev        # → http://localhost:3000
```

Edit `public/app.js` and save — the page hot-reloads itself.

## Options

| Flag             | Effect                                                  |
| ---------------- | ------------------------------------------------------- |
| `--skip-install` | Don't run the install step (scaffold files only)        |
| `--force`        | Scaffold into an existing non-empty directory           |
| `-h`, `--help`   | Show help                                               |
| `-v`, `--version`| Print the create-volt version                           |

The installer auto-detects whichever package manager invoked it
(npm / pnpm / yarn / bun) and uses it for `install`.

## What you get

```
my-app/
├── public/
│   ├── volt.js       the Volt library (no build step)
│   └── app.js        your app — Counter + Todos demo
├── views/index.html  the HTML shell
├── server.js         dev server (Express + Socket.io + file watcher)
├── package.json
└── .gitignore
```

## Requirements

Node.js ≥ 16.7. Works on Linux, macOS and Windows.

## License

MIT
