// Shared lightweight landing-page kernel. Source model: pendulum-lab 10.36.0.
export const DEMO_KERNEL_VERSION = 'pendulum-demo-kernel/v2';

export function createRk4Work() {
  return { k1: [0, 0, 0, 0], k2: [0, 0, 0, 0], k3: [0, 0, 0, 0], k4: [0, 0, 0, 0], tmp: [0, 0, 0, 0] };
}

export function rhsDoubleInto(state, out, params) {
  const [a1, a2, v1, v2] = state;
  const { m1, m2, l1, l2, g } = params;
  const d = a1 - a2;
  const sd = Math.sin(d);
  const cd = Math.cos(d);
  const den = 2 * m1 + m2 - m2 * Math.cos(2 * d);
  out[0] = v1;
  out[1] = v2;
  out[2] = (-g * (2 * m1 + m2) * Math.sin(a1) - m2 * g * Math.sin(a1 - 2 * a2)
    - 2 * sd * m2 * (v2 * v2 * l2 + v1 * v1 * l1 * cd)) / (l1 * den);
  out[3] = (2 * sd * (v1 * v1 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(a1)
    + v2 * v2 * l2 * m2 * cd)) / (l2 * den);

  // Linear damping is a generalized torque, Q = -gamma * q-dot. Applying it
  // through M(q)^-1 keeps the coupled dynamics physically consistent. Because
  // this lives in the RHS, every RK4 stage samples damping at its own
  // intermediate state instead of applying an unrelated post-step decay.
  const dampingValue = params.damping;
  const damping = Number.isFinite(dampingValue) && dampingValue > 0 ? dampingValue : 0;
  if (damping > 0) {
    const m11 = (m1 + m2) * l1 * l1;
    const m12 = m2 * l1 * l2 * cd;
    const m22 = m2 * l2 * l2;
    const det = m11 * m22 - m12 * m12;
    out[2] += damping * (-m22 * v1 + m12 * v2) / det;
    out[3] += damping * (m12 * v1 - m11 * v2) / det;
  }
}

function stageInto(state, derivative, scale, out) {
  for (let index = 0; index < 4; index += 1) out[index] = state[index] + derivative[index] * scale;
}

export function rk4StepDouble(state, params, dt, work) {
  rhsDoubleInto(state, work.k1, params);
  stageInto(state, work.k1, dt * 0.5, work.tmp);
  rhsDoubleInto(work.tmp, work.k2, params);
  stageInto(state, work.k2, dt * 0.5, work.tmp);
  rhsDoubleInto(work.tmp, work.k3, params);
  stageInto(state, work.k3, dt, work.tmp);
  rhsDoubleInto(work.tmp, work.k4, params);
  for (let index = 0; index < 4; index += 1) {
    state[index] += (dt / 6) * (work.k1[index] + 2 * work.k2[index] + 2 * work.k3[index] + work.k4[index]);
  }
  return state;
}
