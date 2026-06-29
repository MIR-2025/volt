// volt-theme-classic — a structured site theme: top nav bar + card content.
const NAME = process.env.SITE_NAME || "Home";

export const css = `:root{--ink:#1f2329;--bg:#f4f5f7;--card:#fff;--accent:#2557d6;--muted:#5b6573;--line:#e2e5ea}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 system-ui,sans-serif}
header.site{background:var(--card);border-bottom:1px solid var(--line)}
header.site .bar{display:flex;align-items:center;gap:1rem;max-width:840px;margin:0 auto;padding:.9rem 1.2rem}
header.site a.brand{font-weight:800;color:var(--ink);text-decoration:none;font-size:1.15rem}
header.site nav{margin-left:auto}
header.site nav a{color:var(--muted);text-decoration:none;margin-left:1rem}
header.site nav a:hover{color:var(--accent)}
main .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:2rem;max-width:840px;margin:2rem auto}
h1,h2,h3{line-height:1.25}
a{color:var(--accent)}
pre{background:#0b0d11;color:#cfe3ff;padding:1rem;border-radius:8px;overflow:auto}
:not(pre)>code{background:#eef1f5;padding:.1em .35em;border-radius:5px}
img{max-width:100%}
footer.site{text-align:center;color:var(--muted);font-size:.9rem;padding:2rem 1rem}`;

export function layout({ title, head, content }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>${head}<link rel="stylesheet" href="/_theme.css" /></head><body>
<header class="site"><div class="bar"><a class="brand" href="/">${NAME}</a><nav><a href="/">Home</a></nav></div></header>
<main><div class="card">${content}</div></main>
<footer class="site">${NAME} — built with Volt</footer>
</body></html>`;
}
