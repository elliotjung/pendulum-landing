# Cloudflare Pages mirror

The canonical site remains GitHub Pages. A Cloudflare Pages project can mirror
this repository to provide an independent availability path and a controlled
place to test cross-origin isolation headers.

## Project settings

- Production branch: `main`
- Framework preset: none
- Build command: `npm ci && npm run build:hero && npm run build:ko && npm run prepare:site -- --headers`
- Output directory: `_site`, matching `wrangler.toml`
- Runtime dependencies: Node 22+ for the deterministic static build; the
  published artifact itself is static

Cloudflare Pages reads the staged `_site/_headers` file. The mirror sends COOP/COEP and
CORP headers so `crossOriginIsolated` experiments can be run there. GitHub Pages
does not honor `_headers`, so its behavior is unchanged.

Before enabling the mirror as an app host, verify every subresource is same
origin or explicitly CORP-compatible. The current landing page self-hosts all
runtime assets. Do not point the main simulator at the mirror until its own
worker, service-worker, and fallback tests pass under cross-origin isolation.

## Deploy and rollback

Preview a branch in the Cloudflare dashboard, then promote only after
`npm run check`, `npm run smoke`, and Lighthouse pass. Roll back by selecting
the previous successful Pages deployment; keep the GitHub Pages URL canonical
until the mirror has an operational owner and monitored custom domain.
