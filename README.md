# Pendulum Lab Landing Page

Static product entryway for
[Pendulum Lab](https://github.com/elliotjung/pendulum-lab), a validated
browser laboratory for nonlinear pendulum dynamics. Its primary product
statement is: **An interactive laboratory for understanding and measuring
nonlinear dynamics.**

- Live app: https://elliotjung.github.io/pendulum-lab/
- Landing page: https://elliotjung.github.io/pendulum-landing/
- Reviewer console: https://elliotjung.github.io/pendulum-lab/reviewer.html

## Start Here

The first-session path is deliberately short: same start → tiny difference →
divergence → measurement → the same exact experiment in the full Lab. The
Landing trajectory console accepts direct numeric values as well as sliders,
switches between radians and degrees for display, keeps canonical radians in
the URL, enforces the Lab's inclusive `[-π, +π]` angle boundary, and names the
reference and perturbed states explicitly.

The shared first recipe is **Sensitive dependence**: planar double pendulum,
`θ=(2.18, 2.64) rad`, `ω=(0, 0) rad/s`, `γ=0.06`, RK4 with `dt=0.001`, and a
symmetric `Δθ₁=1e-3 rad` perturbation (`seed=20260826`, `n=12`). Those exact
values are visible on the page and travel into the Lab URL.

For implementation details, continue below. For the numerical methods and
scientific evidence, use the Lab repository rather than treating this
explanatory site as an authority.

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
- `assets/pendulum-demo-kernel.js` - the `pendulum-demo-kernel/v3` browser ESM
  generated from the Lab's authoritative `rhsDouble` implementation, rather
  than a separately maintained equation port. It supplies the allocation-free
  planar double-pendulum equation and RK4 step used by the trajectory console. The
  state is `[theta1, theta2, omega1, omega2]`; force-level damping is evaluated
  inside every RK4 stage. The cinematic 3D hero is a distinct model described
  below and does not use this planar kernel.
- `assets/demo-kernel-manifest.json` - SHA-256 and release-evidence provenance
  for the generated v3 kernel. The static gate verifies the file and its
  runtime export before deployment.
- `assets/orbit-console.js` - lightweight RK4 double-pendulum canvas console
  used in the trajectory section. It owns the precise EN/KO state editor,
  radians/degrees display conversion, lossless Landing/Lab URL handoff, and
  explicit reference/perturbed readout. It starts only near the viewport, caps
  catch-up work and DPR, and rebuilds its abortable listener/observer graph
  after a BFCache restore without duplicating handlers.
- `assets/main.js` - deferred hero lifecycle, scroll progress, one-shot section
  reveals, counters, attribution, and evidence JSON hydration.
- `assets/evidence-summary.json` - shared validation numbers copied from the
  main lab reports.
- `assets/changelog-highlights.json` - three release highlights pinned to the
  same main-repository commit as the evidence summary, with release-reviewed
  Korean copy when available; refresh with `npm run sync:changelog`.
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
  `assets/walkthrough-30s.gif` are captured from the simulator with
  `npm run assets:simulator-preview` while its local server is running.
- `tests/landing-smoke.spec.ts` - Playwright smoke test for hero/console paint,
  mini-lab controls, deterministic capture mode, serious/critical axe findings,
  mobile bounds, UTM attribution, release hydration, and asset availability.
- `scripts/check-static-assets.mjs` - local asset/link, evidence schema/freshness,
  mojibake, external-font, and CSP inline-hash guards (recomputes the SHA-256
  of every inline script on both pages against the CSP).
- `scripts/build-ko-page.mjs` - generates `ko.html` (CI rebuilds and fails on
  drift).
- `scripts/sync-kernel-manifest.mjs` - realigns the generated v3 demo-kernel
  manifest with freshly synced evidence and refuses an unexpected kernel
  contract (used by the evidence-sync workflow).
- `scripts/sync-copy-counts.mjs` (`npm run sync:copy`) - rewrites every static
  test-count occurrence (meta descriptions, OG/Twitter alt text, no-JS
  fallback spans, and freshness wording) from the evidence summary; the
  Korean evidence fallback is then baked by `npm run build:ko`. The cross-repo
  release workflow runs both before the static gate.
- `scripts/prepare-site.mjs` (`npm run prepare:site`) - materializes the
  deterministic public-file allowlist shared by GitHub Pages and the optional
  Cloudflare mirror.
- `.github/workflows/landing-ci.yml` - smoke, static check, ko.html freshness,
  and Lighthouse audit.
- `.github/workflows/node-compatibility.yml` - browser-free quick check on every
  supported Node line (22, 24, and 26).
- `.github/workflows/evidence-sync.yml` - materializes the exact evidence and
  demo-kernel bytes from a successful, live-observed Lab Pages handoff, verifies
  every dispatched hash, re-runs the full gate, and auto-commits the sync.

The deployable pages are static, but two generated assets have mandatory build
checks: `assets/scene.bundle.js` from `assets/scene.js`, and `ko.html` from the
English source page plus the translation dictionary. Serve the folder through a
local HTTP server; direct `file://` loading cannot reproduce CSP, module, or
routing behavior.

`404.html` supplies the GitHub Pages recovery route. `_headers`,
`wrangler.toml`, and `docs/cloudflare-pages.md` define the optional Cloudflare
Pages mirror and its fail-closed response-header contract. GitHub Pages does
not process `_headers`; the deployed journey records its headers as evidence,
while the optional mirror is the enforcement target for CSP, framing, HSTS,
COOP, and COEP.

## Development

```bash
npm install
npm run build:hero
npm run build:ko
npm run prepare:site
npm run check
npm run smoke
npm run lighthouse
```

The smoke test checks that the Three.js hero either paints or falls back cleanly,
that the 2D trajectory console paints nonblank pixels and reacts to its controls,
that EN/KO axe scans have no serious or critical violations, and that key static
assets are reachable.

`npm run prepare:site` produces the ignored `_site/` allowlist used by GitHub
Pages. Pass `-- --headers` only for the optional Cloudflare mirror, which stages
its `_headers` isolation policy alongside the public files.

## Physics and animation lifecycle

The three visible simulation surfaces are related, but they are not the same
physical model:

| Surface | Model and state | Integration / damping | Authority |
| --- | --- | --- | --- |
| Cinematic hero | Constrained double-spherical pendulum; 3D Cartesian positions and velocities with mass-weighted position/velocity projection | Deterministic RK4 at 240 Hz; conservative (`gamma = 0`) | `assets/scene.js`; explanatory visual, not a validation oracle |
| Trajectory console | Planar double pendulum; `[theta1, theta2, omega1, omega2]` | Shared Lab RHS, RK4 with `dt = 0.001`; trail sampled at 150 Hz; force-level `-gamma * omega` inside every RK4 stage | `assets/pendulum-demo-kernel.js` plus its source-bound manifest |
| Full Lab | Planar, compound, triple, N-link, driven, elastic, spherical, and other supported systems | Selectable fixed, adaptive, and implicit methods with model-specific diagnostics | Main Lab repository, tests, reports, and reviewer evidence |

The hero is not a rotating prop. `assets/scene.js` advances two nearby 3D
constrained states and treats scroll or pointer input as camera/stage motion
only. The nearby trajectory begins `8e-4 rad` away so the visible divergence
remains physically motivated. Its accumulator and prewarm work are bounded,
and rendering stops when the hero and descent are outside the active region or
the document is hidden.

The trajectory console uses the same RHS with RK4 and `dt = 0.001`, while the
visible trail is sampled at 150 Hz. A positive `gamma` is a generalized torque
`-gamma * q-dot`; the shared RHS solves the coupled mass matrix for that torque
inside all four RK4 stages. It is not a post-step visual velocity decay. The
console caps catch-up to 80 one-millisecond steps, targets 30 FPS on compact
devices and 60 FPS otherwise, bounds DPR by a pixel budget, pauses offscreen,
and cancels RAF/idle work plus observers/listeners on page lifecycle teardown.
Its angular readout is the wrapped `|delta theta1(t)|`; the pixel screen-gap
readout is presentation-only, not the phase-state norm used by the Lab's
finite-time Lyapunov diagnostic.

The console handoff contract is
`experiment=sensitive-dependence`,
`experimentSchema=pendulum-sensitive-dependence/v1`, `workflowStep`,
`trajectoryStage`, `angleUnit`, `perturbationVar`, `perturbationPattern`,
`perturbationSeed`, full-precision `deltaTheta`, and `ensembleCount`, together
with the Lab's canonical `th1`, `th2`, `iw1`, `iw2`, `gamma`, `method`, `dt`,
and physical-parameter keys. Angles and `deltaTheta` are serialized in radians;
`angleUnit` is only the display preference. The Landing page mirrors the
editable state plus fixed recipe coordinates into its own URL so language
switches and BFCache back-navigation keep the experiment intact.

These simulations explain the product; scientific validation remains the main
Lab repository's responsibility. The two-repository equations, routing and
release contract are documented in the Lab's
`documents/product-integration.md`.

## Deployment Pipeline

- Production URL: https://elliotjung.github.io/pendulum-landing/
- Preview: use GitHub Actions artifacts from pull requests, or run the local
  static server from Playwright/Lighthouse.
- Rollback: redeploy the previous landing commit or revert the Pages deployment.

The CI gate is `npm run check` -> Chromium smoke -> actual-bundle regression
fixture -> cold/warm EN+KO Lighthouse matrix -> pessimistic Lighthouse CI.
Reports are written under `reports/` and are intentionally gitignored; do not
mix them with deployable assets. `npm run lighthouse` records one fresh-profile
cold run, one discarded warm-up, and three reused-profile warm runs per locale;
it gates both the warm median and worst run. Every SLO artifact includes runner
fingerprinting and long-task source attribution. `npm run lighthouse:fixture`
must observe a hard-gate failure from the opt-in production-bundle long task,
so CI proves the measurement path itself can catch a regression. Thresholds,
noise treatment, and report filenames are documented in
[`docs/performance-slo.md`](docs/performance-slo.md). `npm run lighthouse:lhci`
remains the release entry point and independent pessimistic cross-check.

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
- Evidence sync is automated after successful Lab Mainline and Pages runs. The
  Lab dispatch contains the exact deployed evidence/kernel bytes, hashes, and
  producer run ids; this repository has no committed-summary or branch-tip
  fallback. To recover a missed event, manually rerun Lab `Evidence Dispatch`
  with the successful Pages run id. Local comparison remains available through
  `PENDULUM_LAB_EVIDENCE_PATH`, but cannot publish or claim a coordinated sync.
- After fresh evidence changes, run `npm run sync:changelog`, `npm run
  sync:copy`, `npm run assets:og-card`, and `npm run build:ko` (the static gate
  lists the exact command when something is stale; the cross-repo release
  workflow runs all four automatically).
- When adding new sections, keep the first viewport anchored on the product and
  leave a visible hint of the next section below the hero.
- CTA links should remain direct, valid actions such as Open Lab, Start Guided
  Mode, or View Research Evidence, with tested deep links into the app.

MIT-licensed, same as the main lab. The self-hosted Korean webfont subset under
`assets/fonts/` is Pretendard 1.3.9 and is redistributed under the SIL Open
Font License 1.1; its license text is stored beside the font files.
