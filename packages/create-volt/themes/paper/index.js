// volt-theme-paper — a light, serif, reading-focused theme.
const NAME = process.env.SITE_NAME || "Home";

// Canonical color tokens (--bg --surface --ink --muted --line --brand --brand-ink)
// are the theme's defaults; a SITE_SCHEME overrides them without touching structure.
export const css = `:root{--bg:#fbfaf7;--surface:#f1ede4;--ink:#222;--muted:#6b6b6b;--line:#e7e3da;--brand:#9a3b2e;--brand-ink:#fff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.75 Georgia,"Times New Roman",serif}
.wrap{max-width:680px;margin:0 auto;padding:0 1.2rem}
header.site{padding:2rem 0 1rem;border-bottom:1px solid var(--line)}
header.site a{color:var(--ink);text-decoration:none;font-weight:700;font-size:1.3rem}
main{padding:2rem 0 3rem}
h1,h2,h3{font-weight:700;line-height:1.2}
a{color:var(--brand)}
pre{background:var(--surface);padding:1rem;border-radius:6px;overflow:auto;font:14px/1.5 ui-monospace,monospace}
:not(pre)>code{background:var(--surface);padding:.1em .35em;border-radius:4px;font-size:.9em}
blockquote{border-left:3px solid var(--brand);margin:1.5rem 0;padding:.2rem 1.2rem;color:var(--muted);font-style:italic}
img{max-width:100%;border-radius:6px}
footer.site{border-top:1px solid var(--line);margin-top:3rem;padding:1.5rem 0;color:var(--muted);font-size:.9rem}`;

export function layout({ title, head, content, nav = [] }) {
  const links = nav.map((i) => `<a href="${i.href}"${i.active ? ' class="active"' : ""}>${i.label}</a>`).join("");
  const menu = nav.length ? `<input type="checkbox" id="__navt" class="nav-toggle" hidden /><label for="__navt" class="nav-burger" aria-label="Menu">☰</label><nav class="nav-links">${links}</nav>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>${head}<link rel="stylesheet" href="/_theme.css" /></head><body>
<header class="site"><div class="wrap nav-wrap"><a class="brand" href="/">${NAME}</a>${menu}</div></header>
<main><div class="wrap">${content}</div></main>
<footer class="site"><div class="wrap">${NAME} — built with Volt</div></footer>
</body></html>`;
}
