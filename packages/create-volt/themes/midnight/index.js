// volt-theme-midnight — a dark, modern, sans-serif theme.
const NAME = process.env.SITE_NAME || "Home";

export const css = `:root{--ink:#e6e8ee;--bg:#0e1116;--accent:#7c9cff;--muted:#9aa4b2;--line:#222831}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 system-ui,-apple-system,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:0 1.2rem}
header.site{position:sticky;top:0;background:rgba(14,17,22,.85);backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:.9rem 0}
header.site a{color:var(--accent);font-weight:800;text-decoration:none;letter-spacing:-.02em}
main{padding:2rem 0 3rem}
h1,h2,h3{line-height:1.2;letter-spacing:-.01em}
a{color:var(--accent)}
pre{background:#0a0d12;border:1px solid var(--line);padding:1rem;border-radius:10px;overflow:auto;color:#cfe3ff}
:not(pre)>code{background:rgba(124,156,255,.15);padding:.1em .35em;border-radius:5px;color:var(--accent)}
blockquote{border-left:3px solid var(--accent);margin:1.2rem 0;padding:.2rem 1rem;color:var(--muted)}
img{max-width:100%;border-radius:10px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid var(--line);padding:.5rem .7rem}
footer.site{border-top:1px solid var(--line);margin-top:3rem;padding:1.5rem 0;color:var(--muted);font-size:.9rem}`;

export function layout({ title, head, content }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>${head}<link rel="stylesheet" href="/_theme.css" /></head><body>
<header class="site"><div class="wrap"><a href="/">${NAME}</a></div></header>
<main><div class="wrap">${content}</div></main>
<footer class="site"><div class="wrap">${NAME} — built with Volt</div></footer>
</body></html>`;
}
