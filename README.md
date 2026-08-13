# Pendulum Lab Landing Page

Static product entryway for
[Pendulum Lab](https://github.com/elliotjung/pendulum-lab), a validated
browser laboratory for nonlinear pendulum dynamics.

- Live app: https://elliotjung.github.io/pendulum-lab/
- Landing page: https://elliotjung.github.io/pendulum-landing/
- Reviewer console: https://elliotjung.github.io/pendulum-lab/reviewer.html

## What Is In This Site

- `index.html` - the page shell, SEO metadata, navigation, and all sections.
- `ko.html` - the statically generated Korean page (do not edit by hand; run
  `npm run build:ko` after changing `index.html` or the dictionary). A tiny
  CSP-hashed boot script on the English page honors `?lang=`, the stored
  choice, then the browser locale, and hops to `ko.html` before paint —
  Korean visitors get a plain static page with identical performance.
- `assets/i18n-core.js` - the English→Korean dictionary + translation pass;
  consumed only by `scripts/build-ko-page.mjs`, never loaded at runtime.
- `assets/landing.css` - shared graphite/indigo/cyan visual system, responsive
  layout, quiet reveal states, and trajectory-console styling.
- `assets/scene.js` - Three.js hero sculpture that morphs from order to chaos.
- `assets/orbit-console.js` - lightweight RK4 double-pendulum canvas console
  used in the new trajectory section; it starts only near the viewport.
- `assets/main.js` - deferred hero lifecycle, scroll progress, one-shot section
  reveals, counters, attribution, and evidence JSON hydration.
- `assets/evidence-summary.json` - shared validation numbers copied from the
  main lab reports.
- `assets/changelog-highlights.json` - three release highlights pinned to the
  same main-repository commit as the evidence summary; refresh with
  `npm run sync:changelog`.
- `assets/og-card.png`, `assets/favicon-32.png`, and
  `assets/apple-touch-icon.png` - dimension-checked social and bookmark assets.
  The og-card is generated: `npm run assets:og-card` composites the text-free
  base art (`assets/og-card-base.png`) with the live test count from the
  evidence summary, and `assets/og-card-meta.json` records the numbers baked
  into the pixels so the static gate fails when the card goes stale.
- `assets/fonts/` - page-specific Pretendard Regular/Bold WOFF2 subsets plus
  the OFL. After Korean copy changes, install `fonttools brotli` once and run
  `npm run build:ko && npm run assets:fonts`; each font is capped at 60 KB.
- `assets/scene.bundle.js` - minified, tree-shaken self-hosted Three.js hero
  bundle generated from the lockfile. `npm run build:hero` refreshes it and the
  static gate enforces its transfer ceiling.
- `assets/app-preview.png`, responsive WebP variants, and
  `assets/app-walkthrough.gif` are captured from the simulator with
  `npm run assets:simulator-preview` while its local server is running.
- `tests/landing-smoke.spec.ts` - Playwright smoke test for hero/console paint,
  mini-lab controls, deterministic capture mode, serious/critical axe findings,
  mobile bounds, UTM attribution, release hydration, and asset availability.
- `scripts/check-static-assets.mjs` - local asset/link, evidence schema/freshness,
  mojibake, external-font, and CSP inline-hash guards (recomputes the SHA-256
  of every inline script on both pages against the CSP).
- `scripts/build-ko-page.mjs` - generates `ko.html` (CI rebuilds and fails on
  drift).
- `scripts/sync-kernel-manifest.mjs` - realigns the demo-kernel manifest with
  freshly synced evidence (used by the evidence-sync workflow).
- `scripts/sync-copy-counts.mjs` (`npm run sync:copy`) - rewrites every static
  test-count occurrence (meta descriptions, OG/Twitter alt text, no-JS
  fallback spans, the Korean dictionary) from the evidence summary; the
  cross-repo release workflow runs it before the static gate.
- `.github/workflows/landing-ci.yml` - smoke, static check, ko.html freshness,
  and Lighthouse audit.
- `.github/workflows/node-compatibility.yml` - browser-free quick check on every
  supported Node line (22, 24, and 26).
- `.github/workflows/evidence-sync.yml` - pulls the evidence summary when the
  simulation repo dispatches `evidence-updated`, re-runs the full gate, and
  auto-commits the sync (see ADR 0001 in the sim repo's `docs/adr/`).

There is no build step. Serve the folder statically or open `index.html`
through any local static server.

`404.html` supplies the GitHub Pages recovery route. `_headers`,
`wrangler.toml`, and `docs/cloudflare-pages.md` define the optional Cloudflare
Pages mirror and its COOP/COEP experiment boundary.

## Development

```bash
npm install
npm run check
npm run smoke
npm run lighthouse
```

The smoke test checks that the Three.js hero either paints or falls back cleanly,
that the 2D trajectory console paints nonblank pixels and reacts to its controls,
that EN/KO axe scans have no serious or critical violations, and that key static
assets are reachable.

## Deployment Pipeline

- Production URL: https://elliotjung.github.io/pendulum-landing/
- Preview: use GitHub Actions artifacts from pull requests, or run the local
  static server from Playwright/Lighthouse.
- Rollback: redeploy the previous landing commit or revert the Pages deployment.

The CI gate is `npm run check` -> Chromium smoke -> Lighthouse CI. Reports are
written under `reports/` and are intentionally gitignored; do not mix them with
deployable assets. `npm run lighthouse` runs the stable local audit wrapper, and
`npm run lighthouse:lhci` is kept for raw LHCI troubleshooting.

The page uses a self-hosted, tree-shaken Three.js runtime and a self-hosted
Pretendard subset for Korean copy. Three.js, Playwright, axe, and LHCI are
lockfile-tracked so Dependabot can see them. The CSP should remain free of
external runtime hosts unless a release note explicitly explains the exception.

For a two-repo release, follow the simulation repo checklist:
`docs/cross-project-release.md`. The short form is sim verify -> standalone
build -> evidence sync -> landing check/smoke -> tag/release.

## Maintenance

- Keep generated dependency and Playwright output folders out of git via
  `.gitignore`.
- Evidence sync is automated: the sim repo dispatches `evidence-updated` on
  evidence changes and `.github/workflows/evidence-sync.yml` pulls, re-verifies,
  and commits. The manual path (`npm run evidence:summary` in the main repo,
  then `node scripts/sync-kernel-manifest.mjs` here) remains as local
  convenience; CI can compare the two by setting `PENDULUM_LAB_EVIDENCE_PATH`.
- After fresh evidence changes the test count, run `npm run sync:copy`,
  `npm run assets:og-card`, and `npm run build:ko` (the static gate lists the
  exact command when something is stale; the cross-repo release workflow runs
  all three automatically).
- When adding new sections, keep the first viewport anchored on the product and
  leave a visible hint of the next section below the hero.
- CTA links should remain direct, valid actions such as Open Lab, Start Guided
  Mode, or View Research Evidence, with tested deep links into the app.

MIT-licensed, same as the main lab. The self-hosted Korean webfont subset under
`assets/fonts/` is Pretendard 1.3.9 and is redistributed under the SIL Open
Font License 1.1; its license text is stored beside the font files.
