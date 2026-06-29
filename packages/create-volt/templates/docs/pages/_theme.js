// _theme.js — the docs theme: a fixed sidebar + a content column. Add a page in
// pages/ and link it in NAV below. `css` is served at /_theme.css.
const NAME = process.env.SITE_NAME || "Docs";
const NAV = [
  ["/getting-started", "Getting started"],
  ["/configuration", "Configuration"],
  ["/deployment", "Deployment"],
];

export const css = `:root{--ink:#1f2329;--bg:#fff;--accent:#2557d6;--muted:#5b6573;--line:#e7eaef;--side:#f7f8fa}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 system-ui,-apple-system,sans-serif;display:flex;min-height:100vh}
aside{width:240px;flex:0 0 240px;background:var(--side);border-right:1px solid var(--line);padding:1.5rem}
aside .brand{display:flex;align-items:center;gap:.4rem;font-weight:800;color:var(--ink);text-decoration:none;margin-bottom:1rem}
aside nav a{display:block;color:var(--muted);text-decoration:none;padding:.3rem 0}
aside nav a:hover{color:var(--accent)}
main{flex:1;min-width:0;padding:2.5rem;max-width:780px}
h1,h2,h3{line-height:1.25}
a{color:var(--accent)}
pre{background:#0b0d11;color:#cfe3ff;padding:1rem;border-radius:8px;overflow:auto}
:not(pre)>code{background:#eef1f5;padding:.1em .35em;border-radius:5px}
img{max-width:100%}
@media(max-width:700px){body{flex-direction:column}aside{width:auto;flex:none;border-right:none;border-bottom:1px solid var(--line)}}`;

export function layout({ title, head, content }) {
  const nav = NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>${head}<link rel="icon" href="/favicon.webp" /><link rel="stylesheet" href="/_theme.css" /></head><body>
<aside><a class="brand" href="/getting-started"><img src="/logo.webp" alt="" style="height:1.1em" /> ${NAME}</a><nav>${nav}</nav></aside>
<main>${content}</main>
</body></html>`;
}
