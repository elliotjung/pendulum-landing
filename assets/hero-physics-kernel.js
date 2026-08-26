/** Pure deterministic kernel for the landing hero's constrained 3-D pendulum. */

export const HERO_KERNEL_VERSION = 'pendulum-hero-kernel/v1';
export const HERO_SCENARIO_SEED = 0x51f15e;
export const HERO_SPATIAL_STATE_SIZE = 12;
export const HERO_P1 = 0;
export const HERO_P2 = 3;
export const HERO_V1 = 6;
export const HERO_V2 = 9;
export const HERO_FIXED_STEP = 1 / 240;
export const HERO_DEFAULT_PARAMS = Object.freeze({ m1: 1, m2: 1, l1: 1.14, l2: 1.02, g: 9.81 });
export const HERO_INITIAL_CONDITIONS = Object.freeze({
  theta1: 2.34,
  theta2: 2.72,
  phi1: 0.22,
  phi2: -0.38,
  phiDot1: 0.42,
  phiDot2: -0.31,
});
export const HERO_SHADOW_INITIAL_CONDITIONS = Object.freeze({
  ...HERO_INITIAL_CONDITIONS,
  theta1: 2.3408,
});

const FNV_OFFSET = 2166136261 >>> 0;
const FNV_PRIME = 16777619;
const CHECKPOINT_QUANTIZATION = 1e7;
const DEFAULT_CHECKPOINT_STRIDE = 60;

function assertParameters(params) {
  for (const key of ['m1', 'm2', 'l1', 'l2']) {
    if (!(params[key] > 0) || !Number.isFinite(params[key])) {
      throw new RangeError(`${key} must be positive and finite`);
    }
  }
  if (!(params.g >= 0) || !Number.isFinite(params.g)) throw new RangeError('g must be non-negative and finite');
}

function writeSphericalLink(target, positionOffset, velocityOffset, {
  theta,
  phi,
  thetaDot = 0,
  phiDot = 0,
  length,
}) {
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  target[positionOffset] = length * sinTheta * cosPhi;
  target[positionOffset + 1] = -length * cosTheta;
  target[positionOffset + 2] = length * sinTheta * sinPhi;
  target[velocityOffset] = length * (cosTheta * cosPhi * thetaDot - sinTheta * sinPhi * phiDot);
  target[velocityOffset + 1] = length * sinTheta * thetaDot;
  target[velocityOffset + 2] = length * (cosTheta * sinPhi * thetaDot + sinTheta * cosPhi * phiDot);
}

export function createHeroSpatialState(initial = HERO_INITIAL_CONDITIONS, params = HERO_DEFAULT_PARAMS) {
  assertParameters(params);
  const next = new Float64Array(HERO_SPATIAL_STATE_SIZE);
  writeSphericalLink(next, HERO_P1, HERO_V1, {
    length: params.l1,
    theta: initial.theta1,
    phi: initial.phi1,
    thetaDot: initial.thetaDot1,
    phiDot: initial.phiDot1,
  });
  const second = new Float64Array(6);
  writeSphericalLink(second, 0, 3, {
    length: params.l2,
    theta: initial.theta2,
    phi: initial.phi2,
    thetaDot: initial.thetaDot2,
    phiDot: initial.phiDot2,
  });
  for (let axis = 0; axis < 3; axis += 1) {
    next[HERO_P2 + axis] = next[HERO_P1 + axis] + second[axis];
    next[HERO_V2 + axis] = next[HERO_V1 + axis] + second[3 + axis];
  }
  return next;
}

export function createHeroSpatialWork() {
  return {
    k1: new Float64Array(HERO_SPATIAL_STATE_SIZE),
    k2: new Float64Array(HERO_SPATIAL_STATE_SIZE),
    k3: new Float64Array(HERO_SPATIAL_STATE_SIZE),
    k4: new Float64Array(HERO_SPATIAL_STATE_SIZE),
    temp: new Float64Array(HERO_SPATIAL_STATE_SIZE),
    constraint: new Float64Array(2),
  };
}

function solveConstraintPair(out, a11, a12, a22, b1, b2) {
  const determinant = a11 * a22 - a12 * a12;
  if (!(determinant > 1e-14) || !Number.isFinite(determinant)) {
    throw new RangeError('hero constraint matrix is singular');
  }
  out[0] = (b1 * a22 - b2 * a12) / determinant;
  out[1] = (a11 * b2 - a12 * b1) / determinant;
}

function spatialDerivative(source, out, params, constraint) {
  const p1x = source[HERO_P1];
  const p1y = source[HERO_P1 + 1];
  const p1z = source[HERO_P1 + 2];
  const dx = source[HERO_P2] - p1x;
  const dy = source[HERO_P2 + 1] - p1y;
  const dz = source[HERO_P2 + 2] - p1z;
  const v1x = source[HERO_V1];
  const v1y = source[HERO_V1 + 1];
  const v1z = source[HERO_V1 + 2];
  const dvx = source[HERO_V2] - v1x;
  const dvy = source[HERO_V2 + 1] - v1y;
  const dvz = source[HERO_V2 + 2] - v1z;
  const inverseM1 = 1 / params.m1;
  const inverseM2 = 1 / params.m2;
  const p1Squared = p1x * p1x + p1y * p1y + p1z * p1z;
  const dSquared = dx * dx + dy * dy + dz * dz;
  const coupling = p1x * dx + p1y * dy + p1z * dz;
  solveConstraintPair(
    constraint,
    p1Squared * inverseM1,
    -coupling * inverseM1,
    dSquared * (inverseM1 + inverseM2),
    -(v1x * v1x + v1y * v1y + v1z * v1z) + params.g * p1y,
    -(dvx * dvx + dvy * dvy + dvz * dvz),
  );
  const lambda1 = constraint[0];
  const lambda2 = constraint[1];
  out[HERO_P1] = v1x;
  out[HERO_P1 + 1] = v1y;
  out[HERO_P1 + 2] = v1z;
  out[HERO_P2] = source[HERO_V2];
  out[HERO_P2 + 1] = source[HERO_V2 + 1];
  out[HERO_P2 + 2] = source[HERO_V2 + 2];
  out[HERO_V1] = (p1x * lambda1 - dx * lambda2) * inverseM1;
  out[HERO_V1 + 1] = -params.g + (p1y * lambda1 - dy * lambda2) * inverseM1;
  out[HERO_V1 + 2] = (p1z * lambda1 - dz * lambda2) * inverseM1;
  out[HERO_V2] = dx * lambda2 * inverseM2;
  out[HERO_V2 + 1] = -params.g + dy * lambda2 * inverseM2;
  out[HERO_V2 + 2] = dz * lambda2 * inverseM2;
}

function projectSpatialConstraints(source, params, constraint) {
  const inverseM1 = 1 / params.m1;
  const inverseM2 = 1 / params.m2;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const p1x = source[HERO_P1];
    const p1y = source[HERO_P1 + 1];
    const p1z = source[HERO_P1 + 2];
    const dx = source[HERO_P2] - p1x;
    const dy = source[HERO_P2 + 1] - p1y;
    const dz = source[HERO_P2 + 2] - p1z;
    const p1Squared = p1x * p1x + p1y * p1y + p1z * p1z;
    const dSquared = dx * dx + dy * dy + dz * dz;
    const error1 = 0.5 * (p1Squared - params.l1 * params.l1);
    const error2 = 0.5 * (dSquared - params.l2 * params.l2);
    if (Math.max(Math.abs(error1), Math.abs(error2)) < 1e-13) break;
    const coupling = p1x * dx + p1y * dy + p1z * dz;
    solveConstraintPair(
      constraint,
      p1Squared * inverseM1,
      -coupling * inverseM1,
      dSquared * (inverseM1 + inverseM2),
      -error1,
      -error2,
    );
    const lambda1 = constraint[0];
    const lambda2 = constraint[1];
    source[HERO_P1] += (p1x * lambda1 - dx * lambda2) * inverseM1;
    source[HERO_P1 + 1] += (p1y * lambda1 - dy * lambda2) * inverseM1;
    source[HERO_P1 + 2] += (p1z * lambda1 - dz * lambda2) * inverseM1;
    source[HERO_P2] += dx * lambda2 * inverseM2;
    source[HERO_P2 + 1] += dy * lambda2 * inverseM2;
    source[HERO_P2 + 2] += dz * lambda2 * inverseM2;
  }
  const p1x = source[HERO_P1];
  const p1y = source[HERO_P1 + 1];
  const p1z = source[HERO_P1 + 2];
  const dx = source[HERO_P2] - p1x;
  const dy = source[HERO_P2 + 1] - p1y;
  const dz = source[HERO_P2 + 2] - p1z;
  const v1x = source[HERO_V1];
  const v1y = source[HERO_V1 + 1];
  const v1z = source[HERO_V1 + 2];
  const dvx = source[HERO_V2] - v1x;
  const dvy = source[HERO_V2 + 1] - v1y;
  const dvz = source[HERO_V2 + 2] - v1z;
  const p1Squared = p1x * p1x + p1y * p1y + p1z * p1z;
  const dSquared = dx * dx + dy * dy + dz * dz;
  const coupling = p1x * dx + p1y * dy + p1z * dz;
  solveConstraintPair(
    constraint,
    p1Squared * inverseM1,
    -coupling * inverseM1,
    dSquared * (inverseM1 + inverseM2),
    -(p1x * v1x + p1y * v1y + p1z * v1z),
    -(dx * dvx + dy * dvy + dz * dvz),
  );
  const impulse1 = constraint[0];
  const impulse2 = constraint[1];
  source[HERO_V1] += (p1x * impulse1 - dx * impulse2) * inverseM1;
  source[HERO_V1 + 1] += (p1y * impulse1 - dy * impulse2) * inverseM1;
  source[HERO_V1 + 2] += (p1z * impulse1 - dz * impulse2) * inverseM1;
  source[HERO_V2] += dx * impulse2 * inverseM2;
  source[HERO_V2 + 1] += dy * impulse2 * inverseM2;
  source[HERO_V2 + 2] += dz * impulse2 * inverseM2;
}

export function stepHeroSpatialState(source, dt, work, params = HERO_DEFAULT_PARAMS) {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('dt must be positive and finite');
  if (!(source instanceof Float64Array) || source.length !== HERO_SPATIAL_STATE_SIZE) {
    throw new RangeError('invalid hero state');
  }
  const { k1, k2, k3, k4, temp, constraint } = work;
  spatialDerivative(source, k1, params, constraint);
  for (let i = 0; i < HERO_SPATIAL_STATE_SIZE; i += 1) temp[i] = source[i] + k1[i] * dt * 0.5;
  spatialDerivative(temp, k2, params, constraint);
  for (let i = 0; i < HERO_SPATIAL_STATE_SIZE; i += 1) temp[i] = source[i] + k2[i] * dt * 0.5;
  spatialDerivative(temp, k3, params, constraint);
  for (let i = 0; i < HERO_SPATIAL_STATE_SIZE; i += 1) temp[i] = source[i] + k3[i] * dt;
  spatialDerivative(temp, k4, params, constraint);
  for (let i = 0; i < HERO_SPATIAL_STATE_SIZE; i += 1) {
    source[i] += dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6;
  }
  projectSpatialConstraints(source, params, constraint);
  return source;
}

export function heroSpatialEnergy(source, params = HERO_DEFAULT_PARAMS) {
  const speed1Squared = source[HERO_V1] ** 2 + source[HERO_V1 + 1] ** 2 + source[HERO_V1 + 2] ** 2;
  const speed2Squared = source[HERO_V2] ** 2 + source[HERO_V2 + 1] ** 2 + source[HERO_V2 + 2] ** 2;
  const kinetic = 0.5 * params.m1 * speed1Squared + 0.5 * params.m2 * speed2Squared;
  const potential = params.g * (params.m1 * source[HERO_P1 + 1] + params.m2 * source[HERO_P2 + 1]);
  return kinetic + potential;
}

export function heroSpatialDiagnostics(
  source,
  params = HERO_DEFAULT_PARAMS,
  referenceEnergy = heroSpatialEnergy(source, params),
) {
  const link2x = source[HERO_P2] - source[HERO_P1];
  const link2y = source[HERO_P2 + 1] - source[HERO_P1 + 1];
  const link2z = source[HERO_P2 + 2] - source[HERO_P1 + 2];
  const relativeVelocityX = source[HERO_V2] - source[HERO_V1];
  const relativeVelocityY = source[HERO_V2 + 1] - source[HERO_V1 + 1];
  const relativeVelocityZ = source[HERO_V2 + 2] - source[HERO_V1 + 2];
  const constraintErrors = [
    Math.hypot(source[HERO_P1], source[HERO_P1 + 1], source[HERO_P1 + 2]) - params.l1,
    Math.hypot(link2x, link2y, link2z) - params.l2,
  ];
  const tangentErrors = [
    source[HERO_P1] * source[HERO_V1] + source[HERO_P1 + 1] * source[HERO_V1 + 1] + source[HERO_P1 + 2] * source[HERO_V1 + 2],
    link2x * relativeVelocityX + link2y * relativeVelocityY + link2z * relativeVelocityZ,
  ];
  const energy = heroSpatialEnergy(source, params);
  return {
    energy,
    relativeEnergyDrift: Math.abs(energy - referenceEnergy) / Math.max(1, Math.abs(referenceEnergy)),
    constraintErrors,
    tangentErrors,
    maxConstraintError: Math.max(...constraintErrors.map(Math.abs)),
    maxTangentError: Math.max(...tangentErrors.map(Math.abs)),
  };
}

function mixHash(hash, value) {
  hash ^= value >>> 0;
  return Math.imul(hash, FNV_PRIME) >>> 0;
}

function hashCheckpoint(hash, state, step) {
  let next = mixHash(hash, step);
  for (let index = 0; index < state.length; index += 1) {
    next = mixHash(next, Math.round(state[index] * CHECKPOINT_QUANTIZATION));
  }
  return next;
}

export function createHeroNumericalTracker(
  initialState,
  params = HERO_DEFAULT_PARAMS,
  { seed = HERO_SCENARIO_SEED, checkpointStride = DEFAULT_CHECKPOINT_STRIDE } = {},
) {
  if (!Number.isSafeInteger(checkpointStride) || checkpointStride < 1) {
    throw new RangeError('invalid checkpoint stride');
  }
  const referenceEnergy = heroSpatialEnergy(initialState, params);
  let hash = mixHash(mixHash(FNV_OFFSET, seed), checkpointStride);
  hash = hashCheckpoint(hash, initialState, 0);
  let maxConstraintError = 0;
  let maxTangentError = 0;
  let maxRelativeEnergyDrift = 0;
  let observedSteps = 0;
  return {
    observe(state, step) {
      const diagnostics = heroSpatialDiagnostics(state, params, referenceEnergy);
      maxConstraintError = Math.max(maxConstraintError, diagnostics.maxConstraintError);
      maxTangentError = Math.max(maxTangentError, diagnostics.maxTangentError);
      maxRelativeEnergyDrift = Math.max(maxRelativeEnergyDrift, diagnostics.relativeEnergyDrift);
      observedSteps = step;
      if (step % checkpointStride === 0) hash = hashCheckpoint(hash, state, step);
    },
    snapshot() {
      return {
        kernelVersion: HERO_KERNEL_VERSION,
        seed,
        checkpointStride,
        checkpointHash: hash.toString(16).padStart(8, '0'),
        observedSteps,
        referenceEnergy,
        maxConstraintError,
        maxTangentError,
        maxRelativeEnergyDrift,
      };
    },
  };
}

export function runHeroKernelScenario({
  steps = 3_120,
  dt = HERO_FIXED_STEP,
  params = HERO_DEFAULT_PARAMS,
  initial = HERO_INITIAL_CONDITIONS,
  seed = HERO_SCENARIO_SEED,
  checkpointStride = DEFAULT_CHECKPOINT_STRIDE,
} = {}) {
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > 2_000_000) {
    throw new RangeError('invalid step count');
  }
  const state = createHeroSpatialState(initial, params);
  const work = createHeroSpatialWork();
  const tracker = createHeroNumericalTracker(state, params, { seed, checkpointStride });
  for (let step = 1; step <= steps; step += 1) {
    stepHeroSpatialState(state, dt, work, params);
    tracker.observe(state, step);
  }
  return { ...tracker.snapshot(), dt, simulatedTime: steps * dt, finalState: Array.from(state) };
}
