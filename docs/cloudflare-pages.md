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

Cloudflare Pages reads the staged `_site/_headers` file. The mirror sends the
full response-header contract: CSP with `frame-ancestors 'none'`, HSTS, DENY
framing, Origin-Agent-Cluster, COOP/COEP/CORP, nosniff, referrer policy, and a
locked-down permissions policy. Inline style attributes remain narrowly enabled
for measured runtime CSS variables while inline style blocks stay disabled. The
deployment workflow polls both live EN and KO documents, requires HTTPS, matches
their complete byte hashes to the staged source, validates the response CSP
against the boot hashes extracted from those live bytes, and uploads the bodies,
raw response headers, and a machine-readable result artifact.

GitHub Pages does not honor `_headers`. Its canonical deployment therefore
cannot enforce response-only directives such as `frame-ancestors`; the public
cross-repository journey records those live headers without claiming they pass
the mirror contract. Use the credentialed Cloudflare workflow when the hardened
header boundary is a release requirement.

Before enabling the mirror as an app host, verify every subresource is same
origin or explicitly CORP-compatible. The current landing page self-hosts all
runtime assets. Do not point the main simulator at the mirror until its own
worker, service-worker, and fallback tests pass under cross-origin isolation.

## Deploy and rollback

Preview a branch in the Cloudflare dashboard, then promote only after
`npm run check`, `npm run smoke`, and Lighthouse pass. Roll back by selecting
the previous successful Pages deployment; keep the GitHub Pages URL canonical
until the mirror has an operational owner and monitored custom domain.
