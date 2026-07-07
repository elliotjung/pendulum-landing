# Pendulum Lab — Landing Page

The marketing/landing site for [Pendulum Lab](https://github.com/Elliot-Jung-17/pendulum-lab),
a validated chaotic-pendulum research laboratory that runs entirely in the browser.

- **Live app:** https://elliot-jung-17.github.io/pendulum-lab/
- **Landing (this site):** https://elliot-jung-17.github.io/pendulum-landing/
- **Reviewer console:** https://elliot-jung-17.github.io/pendulum-lab/reviewer.html

## Stack

Deliberately dependency-light: a single static `index.html` plus
`assets/landing.css`, `assets/main.js` (cursor spotlight, parallax/tilt,
magnetic buttons, GSAP ScrollTrigger choreography, count-up telemetry) and
`assets/scene.js` (a Three.js "order → chaos" hero sculpture that morphs a
luminous ribbon from an ordered ring into a baked chaotic double-pendulum
trajectory as you scroll). Three.js and GSAP load from pinned CDNs under the
page CSP, Google Fonts use `display=swap`, and reduced-motion/WebGL-fallback
users get a static app screenshot backdrop. There is no build step — open
`index.html` or serve the folder statically.

The page reads `assets/evidence-summary.json`, generated from the main
repository's `reports/vitest-results.json`,
`reports/reviewer-kit-manifest.json`, and `reports/publication-status.json`
via `npm run evidence:summary`. Static copy remains as fallback text, but the
displayed unit-test count, SciPy agreement, and period-doubling onset all share
the same source JSON as the main README.

## Development

```bash
# any static server works
npx serve .

# smoke test the static site
npm install
npm run smoke
```

MIT-licensed, same as the lab.
