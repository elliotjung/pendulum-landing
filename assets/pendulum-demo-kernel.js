//#region src/physics/constants.ts
/**
* Shared numerical thresholds and conventions for the physics core. Every
* threshold that crosses a module boundary lives here so the singularity /
* regularisation policy is consistent across systems and tunable in exactly
* one place. Values are unchanged from the historical per-file constants;
* this module only centralises them.
*/
/**
* Mass-matrix determinant / pivot threshold below which a configuration is
* treated as numerically singular. Used by the closed-form double / triple
* solvers and as the default pivot tolerance of the shared linear solver.
*/
var MASS_MATRIX_SINGULARITY_THRESHOLD = 1e-14;
//#endregion
//#region src/physics/errors.ts
/**
* Error used when a numerical kernel cannot produce a physically meaningful
* result.  Callers can branch on `code` instead of parsing a message, while the
* ordinary `Error` inheritance keeps existing try/catch integrations working.
*/
var PhysicsEvaluationError = class extends Error {
	code;
	details;
	name = "PhysicsEvaluationError";
	constructor(code, message, details) {
		super(message);
		this.code = code;
		this.details = details;
		Object.setPrototypeOf(this, new.target.prototype);
	}
};
function assertFiniteVector(values, minimumLength, operation) {
	if (!Number.isSafeInteger(values.length) || values.length < minimumLength) throw new PhysicsEvaluationError("INVALID_DIMENSION", `${operation}: expected at least ${minimumLength} components`, {
		operation,
		retryable: false,
		expectedMinimumLength: minimumLength,
		actualLength: values.length
	});
	for (let i = 0; i < minimumLength; i += 1) if (!Number.isFinite(Number(values[i]))) throw new PhysicsEvaluationError("NON_FINITE_INPUT", `${operation}: component ${i} must be finite (non-finite input)`, {
		operation,
		retryable: false,
		component: i,
		value: values[i]
	});
}
function assertPositiveFinite(value, label, operation) {
	if (!(value > 0) || !Number.isFinite(value)) throw new PhysicsEvaluationError("INVALID_PARAMETER", `${operation}: ${label} must be positive and finite`, {
		operation,
		retryable: false,
		parameter: label,
		value
	});
}
function assertFiniteScalar(value, label, operation) {
	if (!Number.isFinite(value)) throw new PhysicsEvaluationError("NON_FINITE_INPUT", `${operation}: ${label} must be finite`, {
		operation,
		retryable: false,
		parameter: label,
		value
	});
}
//#endregion
//#region src/physics/double.ts
function validateDoubleInputs(state, parameters, gamma, outLength, operation) {
	assertFiniteVector(state, 4, operation);
	if (outLength < 4) throw new PhysicsEvaluationError("INVALID_DIMENSION", `${operation}: output must contain at least 4 components`, {
		operation,
		retryable: false,
		expectedMinimumLength: 4,
		actualLength: outLength
	});
	assertPositiveFinite(parameters.m1, "m1", operation);
	assertPositiveFinite(parameters.m2, "m2", operation);
	assertPositiveFinite(parameters.l1, "l1", operation);
	assertPositiveFinite(parameters.l2, "l2", operation);
	assertFiniteScalar(parameters.g, "g", operation);
	if (parameters.g < 0) throw new PhysicsEvaluationError("INVALID_PARAMETER", `${operation}: g must be non-negative`, {
		operation,
		retryable: false,
		parameter: "g",
		value: parameters.g
	});
	assertFiniteScalar(gamma, "gamma", operation);
}
function doubleMassMatrixDiagnostics(state, parameters) {
	assertFiniteVector(state, 2, "doubleMassMatrixDiagnostics");
	assertPositiveFinite(parameters.m1, "m1", "doubleMassMatrixDiagnostics");
	assertPositiveFinite(parameters.m2, "m2", "doubleMassMatrixDiagnostics");
	assertPositiveFinite(parameters.l1, "l1", "doubleMassMatrixDiagnostics");
	assertPositiveFinite(parameters.l2, "l2", "doubleMassMatrixDiagnostics");
	const delta = Number(state[0]) - Number(state[1]);
	const m11 = (parameters.m1 + parameters.m2) * parameters.l1 * parameters.l1;
	const m12 = parameters.m2 * parameters.l1 * parameters.l2 * Math.cos(delta);
	const m22 = parameters.m2 * parameters.l2 * parameters.l2;
	const matrixScale = Math.max(Math.abs(m11), Math.abs(m22));
	if (!(matrixScale > 0) || ![
		m11,
		m12,
		m22,
		matrixScale
	].every(Number.isFinite)) throw new PhysicsEvaluationError("NON_FINITE_INPUT", "doubleMassMatrixDiagnostics: mass matrix overflowed", {
		operation: "doubleMassMatrixDiagnostics",
		retryable: false,
		suggestedAction: "Use finite parameters whose squared length/mass products fit in float64.",
		matrixScale
	});
	const a = m11 / matrixScale;
	const b = m12 / matrixScale;
	const c = m22 / matrixScale;
	const relativeDeterminant = Math.abs(a * c - b * b);
	return {
		determinant: m11 * m22 - m12 * m12,
		relativeDeterminant,
		matrixScale,
		singular: !Number.isFinite(relativeDeterminant) || relativeDeterminant <= 1e-14
	};
}
function assertUsableDoubleMassMatrix(state, parameters, operation) {
	const diagnostics = doubleMassMatrixDiagnostics(state, parameters);
	if (diagnostics.singular) throw new PhysicsEvaluationError("SINGULAR_MASS_MATRIX", `${operation}: double-pendulum mass matrix is singular`, {
		operation,
		retryable: false,
		suggestedAction: "Use strictly positive, comparably scaled masses and lengths.",
		...diagnostics,
		relativeThreshold: MASS_MATRIX_SINGULARITY_THRESHOLD
	});
	return diagnostics;
}
function rhsDouble(state, parameters, gamma, out) {
	validateDoubleInputs(state, parameters, gamma, out.length, "rhsDouble");
	const t1 = Number(state[0] ?? 0);
	const t2 = Number(state[1] ?? 0);
	const w1 = Number(state[2] ?? 0);
	const w2 = Number(state[3] ?? 0);
	const { m1, m2, l1, l2, g } = parameters;
	const delta = t1 - t2;
	const sinDelta = Math.sin(delta);
	const cosDelta = Math.cos(delta);
	const m11 = (m1 + m2) * l1 * l1;
	const m12 = m2 * l1 * l2 * cosDelta;
	const m22 = m2 * l2 * l2;
	const diagnostics = assertUsableDoubleMassMatrix(state, parameters, "rhsDouble");
	const scale = diagnostics.matrixScale;
	const sm11 = m11 / scale;
	const sm12 = m12 / scale;
	const sm22 = m22 / scale;
	const det = sm11 * sm22 - sm12 * sm12;
	const f1 = -m2 * l1 * l2 * sinDelta * w2 * w2 - (m1 + m2) * g * l1 * Math.sin(t1) - gamma * w1;
	const f2 = m2 * l1 * l2 * sinDelta * w1 * w1 - m2 * g * l2 * Math.sin(t2) - gamma * w2;
	const sf1 = f1 / scale;
	const sf2 = f2 / scale;
	const a1 = (sm22 * sf1 - sm12 * sf2) / det;
	const a2 = (-sm12 * sf1 + sm11 * sf2) / det;
	if (![a1, a2].every(Number.isFinite)) throw new PhysicsEvaluationError("NON_FINITE_INPUT", "rhsDouble: acceleration overflowed", {
		operation: "rhsDouble",
		retryable: false,
		suggestedAction: "Reduce the state magnitude or rescale the physical parameters.",
		...diagnostics
	});
	out[0] = w1;
	out[1] = w2;
	out[2] = a1;
	out[3] = a2;
	return out;
}
//#endregion
//#region src/integrations/landingDemoKernel.ts
var DEMO_KERNEL_VERSION = "pendulum-demo-kernel/v3";
function createRk4Work() {
	return {
		k1: /* @__PURE__ */ new Float64Array(4),
		k2: /* @__PURE__ */ new Float64Array(4),
		k3: /* @__PURE__ */ new Float64Array(4),
		k4: /* @__PURE__ */ new Float64Array(4),
		tmp: /* @__PURE__ */ new Float64Array(4)
	};
}
function rhsDoubleInto(state, out, parameters) {
	return rhsDouble(state, parameters, Number.isFinite(parameters.damping) && parameters.damping > 0 ? parameters.damping : 0, out);
}
function stageInto(state, derivative, scale, out) {
	for (let index = 0; index < 4; index += 1) out[index] = Number(state[index]) + Number(derivative[index]) * scale;
}
function rk4StepDouble(state, parameters, dt, work) {
	if (!Number.isFinite(dt) || dt <= 0) throw new RangeError("rk4StepDouble: dt must be positive and finite");
	rhsDoubleInto(state, work.k1, parameters);
	stageInto(state, work.k1, dt * .5, work.tmp);
	rhsDoubleInto(work.tmp, work.k2, parameters);
	stageInto(state, work.k2, dt * .5, work.tmp);
	rhsDoubleInto(work.tmp, work.k3, parameters);
	stageInto(state, work.k3, dt, work.tmp);
	rhsDoubleInto(work.tmp, work.k4, parameters);
	for (let index = 0; index < 4; index += 1) state[index] = state[index] + dt / 6 * (work.k1[index] + 2 * work.k2[index] + 2 * work.k3[index] + work.k4[index]);
	return state;
}
//#endregion
export { DEMO_KERNEL_VERSION, createRk4Work, rhsDoubleInto, rk4StepDouble };
