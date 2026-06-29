// _theme.js — the blog theme. layout() wraps every page + post; `css` is served
// at /_theme.css and shared with the WYSIWYG editor preview. Edit freely.
const NAME = process.env.SITE_NAME || "My Volt Blog";

export const css = `:root{--ink:#1f2329;--bg:#fbfaf8;--accent:#2557d6;--muted:#6b7280;--line:#e7e3da}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.7 Georgia,"Times New Roman",serif}
.wrap{max-width:720px;margin:0 auto;padding:0 1.2rem}
header.site{border-bottom:1px solid var(--line);padding:1.2rem 0;margin-bottom:2rem}
header.site .wrap{display:flex;align-items:baseline;gap:1.2rem;font-family:system-ui,sans-serif}
header.site a.brand{font-weight:800;font-size:1.2rem;color:var(--ink);text-decoration:none}
header.site nav{margin-left:auto;display:flex;gap:1.2rem}
header.site nav a{color:var(--muted);text-decoration:none}
header.site nav a:hover{color:var(--accent)}
main{padding-bottom:3rem}
h1,h2,h3{line-height:1.2}
a{color:var(--accent)}
.post-meta{font-family:system-ui,sans-serif}
.post-tag{font-family:system-ui,sans-serif;font-size:.85rem;background:#eef1f5;color:var(--accent);padding:.1em .5em;border-radius:6px;text-decoration:none}
pre{background:#f1ede4;padding:1rem;border-radius:8px;overflow:auto;font:14px/1.5 ui-monospace,monospace}
:not(pre)>code{background:#f1ede4;padding:.1em .35em;border-radius:4px;font-size:.9em}
blockquote{border-left:3px solid var(--accent);margin:1.2rem 0;padding:.2rem 1rem;color:var(--muted);font-style:italic}
img{max-width:100%;border-radius:8px}
footer.site{border-top:1px solid var(--line);margin-top:3rem;padding:1.5rem 0;color:var(--muted);font-size:.9rem;font-family:system-ui,sans-serif}`;

export function layout({ title, head, content }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>${head}<link rel="icon" href="/favicon.webp" /><link rel="stylesheet" href="/_theme.css" />
<link rel="alternate" type="application/rss+xml" title="${NAME}" href="/feed.xml" /></head><body>
<header class="site"><div class="wrap"><a class="brand" href="/"><img src="/logo.webp" alt="" style="height:1em;vertical-align:-.15em" /> ${NAME}</a>
  <nav><a href="/blog">Blog</a><a href="/about">About</a><a href="/feed.xml">RSS</a></nav></div></header>
<main><div class="wrap">${content}</div></main>
<footer class="site"><div class="wrap">${NAME} — built with Volt</div></footer>
</body></html>`;
}
