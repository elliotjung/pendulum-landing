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

There is no build step. Serve the folder statically or open `index.html`
through any local static server.

## Development

```bash
npm install
npm run smoke
```

The smoke test checks that the Three.js hero either paints or falls back cleanly,
that the 2D trajectory console paints nonblank pixels, and that key static
assets are reachable.

## Maintenance

- Keep generated dependency and Playwright output folders out of git via
  `.gitignore`.
- If main-lab validation numbers change, refresh `assets/evidence-summary.json`
  from the Pendulum Lab repository before publishing.
- When adding new sections, keep the first viewport anchored on the product and
  leave a visible hint of the next section below the hero.

MIT-licensed, same as the main lab.
