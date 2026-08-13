# Pendulum Lab public design system

The landing page is the calm entryway to the simulator's denser workstation.
It shares the same palette and component logic without copying the simulator's
control density.

## Tokens

- Background `#070910`; raised `#0b0e17`; panel `#10141f`; elevated `#151a28`
- Control `#181d2b`; hover `#1d2332`; selected `#242a3d`
- Primary text `#f1f3f8`; secondary `#a8b0c2`; muted `#7f899e`
- Indigo action `#8b7cf6`; cyan data `#72d6e5`; green `#58c99b`
- Amber `#e0ae68`; red `#ef6f7d`; info blue `#7ca8f6`
- Radii 5 / 8 / 12 px; motion 120 / 180 / 260 ms with
  `cubic-bezier(.2,.8,.2,1)`

## Interaction contract

Meaningful motion belongs to the Three.js pendulum, trajectory console, scroll
position, and concise one-shot section reveals. The page does not ship cursor
spotlights, card tilt, magnetic buttons, text scrambling, particle overlays, or
an animation framework. Reduced-motion and reduced-data preferences keep the
poster and scientific content fully usable.

## Surfaces and hierarchy

The hero may use the generated pendulum artwork and live scene. Content bands
alternate background and raised surfaces; cards use one panel level and a quiet
selected border. Indigo marks actions and selection, while cyan is reserved for
live measurements and trajectories. Monospace is limited to evidence, values,
and instrumentation labels.

English `index.html` is the source page. Generate Korean with `npm run build:ko`;
do not hand-edit `ko.html`. Keep all local assets CSP-compatible and preserve the
deterministic `captureHero=1` path used by browser QA.
