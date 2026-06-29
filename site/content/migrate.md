# Migrate from WordPress

Bring a WordPress site's content into Volt as markdown pages. In WordPress, go to **Tools → Export → All content** to download a WXR `.xml` file, then:

```
npx create-volt@latest import-wxr export.xml
```

Each published page and post becomes a markdown file in `pages/` — front-matter `title` (plus `date` and `tags`), Gutenberg block comments stripped, the body kept as HTML/markdown. Drafts and attachments are skipped.

| Flag | Effect |
| --- | --- |
| `--out <dir>` | Output directory (default `pages`). |
| `--drafts` | Include drafts, not just published. |
| `--force` | Overwrite files that already exist. |

Then enable the **pages** add-on to serve them:

```
npm run dev -- --edit   # tick "pages"
```

`pages/about.md` is served at `/about`. The importer reads standard WordPress WXR exports and brings over **content** — not themes or plugins. The layout is yours to build in Volt (that's the point).
