# Pendulum Lab Landing Page

Static cinematic landing page for
[Pendulum Lab](https://github.com/Elliot-Jung-17/pendulum-lab), a validated
browser laboratory for nonlinear pendulum dynamics.

- Live app: https://elliot-jung-17.github.io/pendulum-lab/
- Landing page: https://elliot-jung-17.github.io/pendulum-landing/
- Reviewer console: https://elliot-jung-17.github.io/pendulum-lab/reviewer.html

## What Is In This Site

- `index.html` - the page shell, SEO metadata, navigation, and all sections.
- `assets/landing.css` - visual system, responsive layout, scroll states, and
  the trajectory-console styling.
- `assets/scene.js` - Three.js hero sculpture that morphs from order to chaos.
- `assets/orbit-console.js` - lightweight RK4 double-pendulum canvas console
  used in the new trajectory section; it starts only near the viewport.
- `assets/main.js` - page interactions: cursor light, scroll progress, GSAP
  choreography, counters, and evidence JSON hydration.
- `assets/reactbits.js` - vanilla ports of the typewriter, text-decrypt, and
  card interaction effects.
- `assets/evidence-summary.json` - shared validation numbers copied from the
  main lab reports.
- `assets/vendor/` - pinned self-hosted Three.js `0.160.0` and GSAP `3.12.5`
  files so GitHub Pages does not depend on runtime CDN availability.
- `tests/landing-smoke.spec.ts` - Playwright smoke test for hero paint, console
  paint, mobile CTA bounds, and asset availability.
- `scripts/check-static-assets.mjs` - local asset/link, evidence schema, and
  external-font guard.
- `.github/workflows/landing-ci.yml` - smoke, static check, and Lighthouse audit.

There is no build step. Serve the folder statically or open `index.html`
through any local static server.

## Development

```bash
npm install
npm run check
npm run smoke
npm run lighthouse
```

The smoke test checks that the Three.js hero either paints or falls back cleanly,
that the 2D trajectory console paints nonblank pixels, and that key static
assets are reachable.

## Deployment Pipeline

- Production URL: https://elliot-jung-17.github.io/pendulum-landing/
- Preview: use GitHub Actions artifacts from pull requests, or run the local
  static server from Playwright/Lighthouse.
- Rollback: redeploy the previous landing commit or revert the Pages deployment.

The CI gate is `npm run check` -> Chromium smoke -> Lighthouse CI. Reports are
written under `reports/` and are intentionally gitignored; do not mix them with
deployable assets. `npm run lighthouse` runs the stable local audit wrapper, and
`npm run lighthouse:lhci` is kept for raw LHCI troubleshooting.

The page uses self-hosted runtime assets and system font stacks. The CSP should
remain free of external runtime hosts unless a release note explicitly explains
the exception.

For a two-repo release, follow the simulation repo checklist:
`docs/cross-project-release.md`. The short form is sim verify -> standalone
build -> evidence sync -> landing check/smoke -> tag/release.

## Maintenance

- Keep generated dependency and Playwright output folders out of git via
  `.gitignore`.
- If main-lab validation numbers change, refresh `assets/evidence-summary.json`
  from the Pendulum Lab repository with `npm run evidence:summary` in the main
  repo before publishing.
- When adding new sections, keep the first viewport anchored on the product and
  leave a visible hint of the next section below the hero.
- CTA links should remain direct actions such as Open Lab, Try Performance Mode,
  or View Research Evidence, with deep links into the app when possible.

MIT-licensed, same as the main lab.
