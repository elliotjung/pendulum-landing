import assert from 'node:assert/strict';

import {
  HERO_FIXED_STEP,
  HERO_KERNEL_VERSION,
  runHeroKernelScenario,
} from '../assets/hero-physics-kernel.js';

const EXPECTED_HASH = '6ad903ed';

const longRun = runHeroKernelScenario();
const repeat = runHeroKernelScenario();

assert.equal(longRun.kernelVersion, HERO_KERNEL_VERSION);
assert.equal(longRun.checkpointHash, EXPECTED_HASH, 'the pinned hero trajectory changed');
assert.equal(repeat.checkpointHash, longRun.checkpointHash, 'the hero trajectory is not repeatable');
assert.deepEqual(repeat.finalState, longRun.finalState, 'repeat runs did not finish bit-for-bit alike');
assert.ok(longRun.maxConstraintError < 1e-10, 'rod-length projection exceeded its envelope');
assert.ok(longRun.maxTangentError < 1e-11, 'velocity projection exceeded its envelope');
assert.ok(longRun.maxRelativeEnergyDrift < 5e-6, 'long-run energy drift exceeded its envelope');

const coarse = runHeroKernelScenario({ steps: 480 });
const refined = runHeroKernelScenario({ steps: 960, dt: HERO_FIXED_STEP / 2 });
const refinementError = Math.hypot(
  ...coarse.finalState.map((value, index) => value - refined.finalState[index]),
);
assert.equal(coarse.simulatedTime, refined.simulatedTime);
assert.ok(refinementError < 2e-5, 'half-step trajectory failed the two-second refinement gate');
assert.ok(
  refined.maxRelativeEnergyDrift < coarse.maxRelativeEnergyDrift * 0.2,
  'half-step integration did not materially reduce energy drift',
);

console.log(
  `hero physics verified (${longRun.simulatedTime}s, hash ${longRun.checkpointHash}, energy drift ${longRun.maxRelativeEnergyDrift.toExponential(2)})`,
);
