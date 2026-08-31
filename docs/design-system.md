# Pendulum Lab public design system

The landing page and Lab use one restrained research-software language. The
landing page has more narrative room, but it should still read like a maintained
scientific instrument: flat graphite planes, explicit rules, compact evidence
tables, and color reserved for data or state.

## Tokens

- Background `#0b0f14`; surface `#10161d`; raised surface `#151c24`
- Control `#19212b`; line `#29343f`; strong line `#3b4854`
- Primary text `#edf1f3`; body `#b7c0c8`; muted `#7f8b96`
- Teal measurement/action `#75b8c7`; amber comparison/warning `#d2a968`
- Green `#6db997`; red `#d47a82`; info blue `#86a9ca`
- Radius `2px` for controls and bounded surfaces; shadows only for a necessary
  overlay; short linear transitions only for state continuity

## Interaction contract

Motion must explain state. The constrained double-spherical hero, the planar
trajectory console, scroll position, and open/close continuity are valid uses.
Ordinary text, panels, numbers, logos, and catalog items do not arrive, pulse,
float, count up, glow, tilt, or chase the pointer. Reduced-motion,
reduced-data, no-JavaScript, and WebGL-failure paths expose the same scientific
scope and actions without implying that a simulation is running.

The hero and console intentionally use different disclosed models. The hero's
3D Cartesian constrained state is stepped at 240 Hz by
`assets/hero-physics-kernel.js`; camera orbit never feeds back into that
physics. The trajectory console uses the Lab-derived planar double-pendulum
kernel at 150 Hz. Neither surface is validation evidence.

## Surfaces and hierarchy

Prefer continuous bands, matrices, tables, and ruled lists over repeated
floating cards. Teal and amber distinguish measured series or components; each
surface must disclose their local roles instead of assigning a universal
meaning. Monospace is limited to values, equations, provenance, and instrument
labels. Gradients and decorative bloom are not part of the public surface.

English `index.html` is the source page. Generate Korean with `npm run build:ko`;
do not hand-edit `ko.html`. Keep local assets CSP-compatible, keep static and
no-JavaScript fallbacks truthful, and preserve the deterministic
`captureHero=1` path used by browser QA.
