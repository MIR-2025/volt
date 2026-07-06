// pages/_theme.js — "Northwind" full-site theme: sticky nav, hero, feature +
// product grids, CTA band, footer. Content pages (format: html) provide the
// sections. Media slots (.slot) are placeholders you swap your own image/video
// into from the config editor.
const NAME = process.env.SITE_NAME || "Northwind Co";

export const css = `
:root{--bg:#ffffff;--surface:#ffffff;--ink:#141a1f;--muted:#5c6a76;--line:#e6eaef;--brand:#0e7c66;--brand-ink:#ffffff;--radius:16px;--brand-2:color-mix(in srgb,var(--brand),#000 16%);--soft:color-mix(in srgb,var(--ink) 4%,var(--bg))}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
a{color:var(--brand);text-decoration:none}
img,video{max-width:100%;display:block}
.wrap{max-width:1100px;margin:0 auto;padding:0 1.25rem}
header.nav{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--surface) 82%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
header.nav .wrap{display:flex;align-items:center;gap:1.5rem;height:64px}
header.nav .brand{font-weight:800;font-size:1.15rem;color:var(--ink)}
header.nav nav{margin-left:auto;display:flex;gap:1.5rem;align-items:center}
header.nav nav a{color:var(--muted);font-weight:500}
header.nav nav a:hover{color:var(--ink)}
header.nav .cta{background:var(--brand);color:var(--brand-ink);padding:.5rem 1rem;border-radius:999px;font-weight:600}
header.nav .cta:hover{background:var(--brand-2)}
section{padding:4.5rem 0}
section.alt{background:var(--soft)}
.eyebrow{color:var(--brand);font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:.8rem;margin:0}
h1{font-size:clamp(2.2rem,5vw,3.4rem);line-height:1.08;letter-spacing:-.02em;margin:.4rem 0}
h2{font-size:clamp(1.6rem,3vw,2.2rem);line-height:1.15;letter-spacing:-.01em;margin:.3rem 0 1.2rem}
p.lead{font-size:1.2rem;color:var(--muted);max-width:46ch}
.btn{display:inline-block;background:var(--brand);color:var(--brand-ink);font-weight:600;padding:.8rem 1.4rem;border-radius:999px}
.btn:hover{background:var(--brand-2)}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.hero{display:grid;grid-template-columns:1.1fr 1fr;gap:3rem;align-items:center}
@media(max-width:820px){.hero{grid-template-columns:1fr}}
.grid{display:grid;gap:1.5rem}
.grid.c3{grid-template-columns:repeat(3,1fr)}
.grid.c2{grid-template-columns:repeat(2,1fr)}
@media(max-width:820px){.grid.c3,.grid.c2{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:1.5rem}
.card h3{margin:.2rem 0 .4rem}
.card .price{color:var(--brand);font-weight:700}
.slot{position:relative;border-radius:var(--radius);overflow:hidden;background:linear-gradient(135deg,var(--brand),color-mix(in srgb,var(--brand),#000 32%));aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;color:var(--brand-ink);text-align:center;margin-bottom:1rem}
.slot.wide{aspect-ratio:16/9}.slot.tall{aspect-ratio:3/4}
.slot span{font-size:.85rem;opacity:.92;padding:.5rem 1rem;border:1px dashed color-mix(in srgb,var(--brand-ink) 45%,transparent);border-radius:8px}
.slot img,.slot video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;margin:0}
.cta-band{background:var(--brand);color:var(--brand-ink);border-radius:var(--radius);padding:3rem;text-align:center}
.cta-band h2{color:var(--brand-ink)}.cta-band .btn{background:var(--brand-ink);color:var(--brand)}
footer.site{border-top:1px solid var(--line);color:var(--muted);padding:2.5rem 0;font-size:.92rem}
footer.site .wrap{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}
`;

export function layout({ title, head, content, nav = [] }) {
  const links = nav.map((i) => `<a href="${i.href}"${i.active ? ' class="active"' : ""}>${i.label}</a>`).join("");
  const menu = nav.length ? `<input type="checkbox" id="__navt" class="nav-toggle" hidden /><label for="__navt" class="nav-burger" aria-label="Menu">☰</label><nav class="nav-links">${links}</nav>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>${head}<link rel="stylesheet" href="/_theme.css"/></head><body>
<header class="nav"><div class="wrap nav-wrap"><a class="brand" href="/">${NAME}</a>${menu}</div></header>
${content}
<footer class="site"><div class="wrap"><span>© ${NAME}</span><span>Built with <a href="https://voltjs.com">Volt</a></span></div></footer>
</body></html>`;
}
