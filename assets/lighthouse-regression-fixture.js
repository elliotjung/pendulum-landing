// This module is loaded only by `npm run lighthouse:fixture`. It deliberately
// blocks the real production bundle path so CI proves that the performance
// gate detects a regression instead of merely testing the gate's arithmetic.
await new Promise((resolve) => setTimeout(resolve, 150));
const startedAt = performance.now();
let checksum = 0;
while (performance.now() - startedAt < 900) {
  checksum = (checksum + Math.sqrt(checksum + 17)) % 65521;
}
window.__PENDULUM_LIGHTHOUSE_FIXTURE = {
  checksum,
  duration: performance.now() - startedAt
};
