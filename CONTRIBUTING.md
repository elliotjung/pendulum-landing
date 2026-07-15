# Contributing to the Pendulum Lab landing page

Install a supported Node.js release and run `npm ci`. Keep claims tied to the
versioned evidence in `assets/evidence-summary.json`; do not hand-edit synced
evidence or generated `ko.html` content.

Before submitting a change, run the landing gate in this order:

```text
npm run check
npm run build:ko
npm run smoke
```

For cross-repository evidence and release rules, see the simulator's
[cross-project release guide](https://github.com/elliotjung/pendulum-lab/blob/master/documents/cross-project-release.md).
Visual changes should preserve reduced-motion, keyboard, mobile, and both
language paths. Security issues belong in the private channel documented in
[SECURITY.md](SECURITY.md).

Contributions are accepted under the [MIT License](LICENSE) and must follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
