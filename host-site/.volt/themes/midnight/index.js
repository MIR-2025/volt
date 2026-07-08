// volt-theme-midnight — a dark, modern, sans-serif theme.
const NAME = process.env.SITE_NAME || "Home";
const BRAND = process.env.SITE_LOGO ? `<img class="brand-logo" src="${process.env.SITE_LOGO}" alt="${NAME}" />` : NAME;

// Canonical color tokens (--bg --surface --ink --muted --line --brand --brand-ink)
// are the theme's defaults; a SITE_SCHEME overrides them without touching structure.
export const css = `:root{--bg:#0e1116;--surface:#0a0d12;--ink:#e6e8ee;--muted:#9aa4b2;--line:#222831;--brand:#7c9cff;--brand-ink:#0e1116}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 system-ui,-apple-system,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:0 1.2rem}
header.site{position:sticky;top:0;background:color-mix(in srgb,var(--bg) 85%,transparent);backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:.9rem 0}
header.site a{color:var(--brand);font-weight:800;text-decoration:none;letter-spacing:-.02em}
main{padding:2rem 0 3rem}
h1,h2,h3{line-height:1.2;letter-spacing:-.01em}
a{color:var(--brand)}
pre{background:var(--surface);border:1px solid var(--line);padding:1rem;border-radius:10px;overflow:auto;color:var(--ink)}
:not(pre)>code{background:color-mix(in srgb,var(--brand) 15%,transparent);padding:.1em .35em;border-radius:5px;color:var(--brand)}
blockquote{border-left:3px solid var(--brand);margin:1.2rem 0;padding:.2rem 1rem;color:var(--muted)}
img{max-width:100%;border-radius:10px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid var(--line);padding:.5rem .7rem}
footer.site{border-top:1px solid var(--line);margin-top:3rem;padding:1.5rem 0;color:var(--muted);font-size:.9rem}`;

export function layout({ title, head, content, nav = [] }) {
  const links = nav.map((i) => `<a href="${i.href}"${i.active ? ' class="active"' : ""}>${i.label}</a>`).join("");
  const menu = nav.length ? `<input type="checkbox" id="__navt" class="nav-toggle" hidden /><label for="__navt" class="nav-burger" aria-label="Menu">☰</label><nav class="nav-links">${links}</nav>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>${head}<link rel="stylesheet" href="/_theme.css" /></head><body>
<header class="site"><div class="wrap nav-wrap"><a class="brand" href="/">${BRAND}</a>${menu}</div></header>
<main><div class="wrap">${content}</div></main>
<footer class="site"><div class="wrap">${NAME} — built with Volt</div></footer>
</body></html>`;
}
