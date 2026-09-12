# Magic Pencil: Kingdoms of Paper — the site

A promo site for the browser game
[Magic Pencil: Kingdoms of Paper](https://devkancheti4-design.github.io/magic-pencil-kingdoms/).

Everything on it is drawn by hand in inline SVG — there is not a single image file. No
framework, no bundler, no dependencies.

## Run it

```bash
node build.mjs && python3 -m http.server 4400
```

## How it is put together

`node build.mjs` stitches `partials/head.html`, `partials/nav.html`, the eight section files
in `partials/sections/` and `partials/footer.html` into `index.html`, concatenates the
per-section CSS and JS, and writes a deployable `dist/`.

**Edit the partials, not `index.html`** — the build overwrites it.

```
partials/head.html  nav.html  footer.html
partials/sections/<name>.html | .css | .js   ← one section per name
assets/css/tokens.css   ← paper, ink and crayon: every colour and size
assets/css/base.css     ← paper texture + the hand-drawn component kit
assets/css/shell.css    ← nav, pencil cursor, ink scroll-line, footer
assets/js/site.js       ← the runtime
```

### The two tricks worth knowing

**Drawings draw themselves.** Put `[data-draw]` on a wrapper and give every outline the
`.stroke` class. The runtime measures each path with `getTotalLength()`, sets `--len`, and
the stroke animates on when it scrolls into view. Crayon fills go in `.wash` layers
*underneath* the outline so colour arrives after the line — like colouring in.

**Everything is a token.** Change the crayon box in `tokens.css` and the whole site follows,
night mode included.

## Deploying

Push to `main` — `.github/workflows/pages.yml` runs the build and publishes `dist/`.
