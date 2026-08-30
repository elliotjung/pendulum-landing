# Landing performance SLO

The release gate measures the shipped EN and KO documents separately. It does
not hide the first visit inside a three-run median.

## Measurement contract

| State | Runs per locale | Chrome profile | Gate |
| --- | ---: | --- | --- |
| Cold | 1 | New | Performance ≥ 85, accessibility ≥ 95, best practices = 100, SEO ≥ 95; LCP ≤ 3000 ms, CLS ≤ 0.05, TBT ≤ 300 ms |
| Warm-up | 1 | New shared warm profile | Discarded and labelled; primes the profile only |
| Warm | 3 | Same profile as the warm-up | Median **and** pessimistic (minimum category score / maximum metric) must pass; performance ≥ 90, accessibility ≥ 95, best practices = 100, SEO ≥ 95; LCP ≤ 2500 ms, CLS ≤ 0.05, TBT ≤ 150 ms |

Cold and warm results answer different user questions: “How does a first visit
feel?” and “How does a repeat visit behave once browser caches are available?”
Keeping them separate prevents host start-up variance from being silently
averaged away, while the warm pessimistic result ensures one bad measured run
still blocks release.

## Artifacts and diagnosis

`npm run lighthouse` writes these ignored files under `reports/lighthouse/`:

- `lighthouse-{en,ko}-cold.json` and `-cold-summary.json`
- `lighthouse-{en,ko}-warm-{1,2,3}.json`
- `lighthouse-{en,ko}-summary.json` (warm median, retained for compatibility)
- `lighthouse-{en,ko}-slo.json` (cold, warm median, warm pessimistic, policies,
  runner fingerprint, and long-task attribution)
- `lighthouse-summary.json` (the complete two-language matrix)

The runner fingerprint records Node, platform, architecture, CPU, memory,
GitHub runner image, Lighthouse version, and Lighthouse benchmark index. Long
tasks are grouped by their reported URL, with unattributed duration kept
visible rather than discarded. Compare fingerprints before treating small
cross-run differences as a product regression.

## Gate self-test

`npm run lighthouse:fixture` loads the real landing bundle on a loopback host
with the `lhFixture=bundle-long-task` query. That opt-in module blocks the main
thread for about 900 ms. The command succeeds only when Lighthouse attributes
at least 800 ms of long-task work and the normal warm policy fails. `main.js`
accepts the query only on `localhost`, `127.0.0.1`, or `[::1]`, so a public URL
cannot activate the fixture. CI exercises it before the release matrix.
