import { createRk4Work, rk4StepDouble } from './pendulum-demo-kernel.js';

// Interactive double-pendulum trajectory instrument for the landing page. It
// runs locally and transfers its exact initial state to the full application.
(function () {
  'use strict';

  const canvas = document.getElementById('orbit-console');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const queryFlag = (name) => /^(?:1|true|yes)$/i.test(new URLSearchParams(window.location.search).get(name) || '');
  const captureMode = queryFlag('captureHero');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMotionQuery.matches || captureMode;
  const korean = document.documentElement.lang === 'ko';
  const radiansToDegrees = 180 / Math.PI;
  const minimumHandoffSeparation = 1e-7;
  const maximumHandoffSeparation = 1e-2;
  const labels = korean ? {
    warming: '준비 중', paused: '일시정지', static: '정적', live: '실시간', standby: '대기',
    pause: '움직임 일시정지', resume: '움직임 재개', reduced: '동작 줄임', points: '점',
    angleValue: (value, unit) => `${value} ${unit === 'deg' ? '도' : '라디안'}`,
    separationCaption: (value, unit) => `${value} ${unit === 'deg' ? '도' : '라디안'} 간격`,
    dampingValue: (value) => `감쇠 계수 ${value}`,
    exactStatus: '전체 정밀도 라디안 값과 Δθ₁이 랩으로 그대로 이어집니다.'
  } : {
    warming: 'warming', paused: 'paused', static: 'static', live: 'live', standby: 'standby',
    pause: 'Pause motion', resume: 'Resume motion', reduced: 'Motion reduced', points: 'pts',
    angleValue: (value, unit) => `${value} ${unit === 'deg' ? 'degrees' : 'radians'}`,
    separationCaption: (value, unit) => `${value} ${unit === 'deg' ? 'deg' : 'rad'} apart`,
    dampingValue: (value) => `${value} damping`,
    exactStatus: 'Full-precision radians and Δθ₁ will continue into the Lab.'
  };
  const lowPower = window.matchMedia('(max-width: 720px), (pointer: coarse)').matches
    || navigator.connection?.saveData === true
    || (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4)
    || (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4);
  const targetFps = lowPower ? 30 : 60;
  const frameInterval = 1000 / targetFps;
  const experimentContract = Object.freeze({ method: 'rk4', dt: 0.001 });
  const fixedStep = experimentContract.dt;
  const maximumFrameElapsed = 0.08;
  const maximumPhysicsSteps = Math.ceil(maximumFrameElapsed / fixedStep);
  // Integration follows the exact Lab handoff dt. Trail sampling remains a
  // presentation concern so the denser solver steps do not crowd the canvas.
  const trailSampleInterval = 1 / 150;
  const trailStride = lowPower ? 3 : 2;
  const readouts = {
    separation: document.querySelector('[data-orbit-readout="separation"]'),
    drift: document.querySelector('[data-orbit-readout="drift"]'),
    trace: document.querySelector('[data-orbit-readout="trace"]'),
    mode: document.querySelector('[data-orbit-readout="mode"]')
  };
  const controls = {
    theta: document.querySelector('[data-orbit-control="theta"]'),
    thetaTwo: document.querySelector('[data-orbit-control="thetaTwo"]'),
    separation: document.querySelector('[data-orbit-control="separation"]'),
    damping: document.querySelector('[data-orbit-control="damping"]'),
    thetaNumber: document.querySelector('[data-orbit-number="theta"]'),
    thetaTwoNumber: document.querySelector('[data-orbit-number="thetaTwo"]'),
    separationNumber: document.querySelector('[data-orbit-number="separation"]'),
    dampingNumber: document.querySelector('[data-orbit-number="damping"]'),
    angleUnit: document.querySelector('[data-orbit-unit]'),
    unitLabels: document.querySelectorAll('[data-orbit-unit-label]'),
    thetaOutput: document.querySelector('[data-orbit-output="theta"]'),
    thetaTwoOutput: document.querySelector('[data-orbit-output="thetaTwo"]'),
    separationOutput: document.querySelector('[data-orbit-output="separation"]'),
    dampingOutput: document.querySelector('[data-orbit-output="damping"]'),
    separationCaption: document.querySelector('[data-orbit-caption="separation"]'),
    referenceState: document.querySelector('[data-orbit-state="reference"]'),
    perturbedState: document.querySelector('[data-orbit-state="perturbed"]'),
    stateStatus: document.querySelector('[data-orbit-state-status]'),
    reset: document.querySelector('[data-orbit-reset]'),
    toggle: document.querySelector('[data-orbit-toggle]'),
    launch: document.querySelector('[data-orbit-launch]'),
    next: document.querySelector('[data-orbit-next]')
  };

  let width = 920;
  let height = 620;
  let dpr = 1;
  let raf = 0;
  let frame = 0;
  let pointerX = 0;
  let visible = false;
  let paused = false;
  let lastTick = 0;
  let lastDraw = 0;
  let physicsAccumulator = 0;
  let trailSampleAccumulator = 0;
  let warming = false;
  let resetGeneration = 0;
  let resetRaf = 0;
  let cancelWarmChunk = null;
  let runtimeController = null;
  let consoleResizeObserver = null;
  let visibilityObserver = null;
  let suspended = false;
  let resetAfterResume = false;

  const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
  const runtimeParams = { ...params, damping: 0 };
  const primary = [2.18, 2.64, 0, 0];
  const twin = [2.181, 2.64, 0, 0];
  // A user can move a control while this below-the-fold module is still
  // downloading. Seed from the live form values so that first intent is never
  // overwritten by the deferred initializer.
  const initialQuery = new URLSearchParams(window.location.search);
  const finiteQuery = (name, fallback, minimum, maximum) => {
    const raw = initialQuery.get(name);
    if (raw === null || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
  };
  const exactFormValue = (numberInput, rangeInput, fallback, minimum, maximum) => {
    const raw = numberInput instanceof HTMLInputElement
      ? numberInput.value
      : rangeInput instanceof HTMLInputElement
        ? rangeInput.value
        : '';
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
  };
  let angleUnit = initialQuery.get('angleUnit') === 'deg' ? 'deg' : 'rad';
  let initialTheta = finiteQuery(
    'th1',
    exactFormValue(controls.thetaNumber, controls.theta, 2.18, -Math.PI, Math.PI),
    -Math.PI,
    Math.PI
  );
  let initialThetaTwo = finiteQuery(
    'th2',
    exactFormValue(controls.thetaTwoNumber, controls.thetaTwo, 2.64, -Math.PI, Math.PI),
    -Math.PI,
    Math.PI
  );
  let initialSeparation = finiteQuery(
    'deltaTheta',
    exactFormValue(
      controls.separationNumber,
      controls.separation,
      0.001,
      minimumHandoffSeparation,
      maximumHandoffSeparation
    ),
    minimumHandoffSeparation,
    maximumHandoffSeparation
  );
  let damping = finiteQuery(
    'gamma',
    exactFormValue(controls.dampingNumber, controls.damping, 0.06, 0, 10),
    0,
    10
  );
  const maxTrail = lowPower ? 300 : 420;
  const trailA = makeTrail(maxTrail);
  const trailB = makeTrail(maxTrail);
  const workA = createRk4Work();
  const workB = createRk4Work();
  const pointA = makePoint();
  const pointB = makePoint();
  const pointDraw = makePoint();

  function makePoint() {
    return { px: 0, py: 0, jx: 0, jy: 0, bx: 0, by: 0 };
  }

  function makeTrail(capacity) {
    return { x: new Float32Array(capacity), y: new Float32Array(capacity), head: 0, len: 0, capacity };
  }

  function pushTrailPoint(trail, x, y) {
    trail.x[trail.head] = x;
    trail.y[trail.head] = y;
    trail.head = (trail.head + 1) % trail.capacity;
    trail.len = Math.min(trail.capacity, trail.len + 1);
  }

  function trailIndex(trail, offset) {
    return (trail.head - trail.len + offset + trail.capacity) % trail.capacity;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(320, rect.width || 920);
    height = Math.max(240, rect.height || width * 620 / 920);
    const pixelBudget = lowPower ? 720_000 : 1_450_000;
    const budgetDpr = Math.sqrt(pixelBudget / Math.max(1, width * height));
    dpr = Math.max(0.8, Math.min(window.devicePixelRatio || 1, lowPower ? 1.2 : 1.6, budgetDpr));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    window.__orbitConsoleQuality = { dpr, targetFps, maxTrail, lowPower };
  }

  function rk4Into(s, work) {
    runtimeParams.g = params.g;
    runtimeParams.damping = damping;
    rk4StepDouble(s, runtimeParams, experimentContract.dt, work);
  }

  function advanceSimulation() {
    rk4Into(primary, workA);
    rk4Into(twin, workB);
    trailSampleAccumulator += experimentContract.dt;
    if (trailSampleAccumulator >= trailSampleInterval) {
      pushTrail();
      trailSampleAccumulator %= trailSampleInterval;
    }
  }

  function pointInto(s, out) {
    const scale = Math.min(width, height) * 0.23;
    const cx = width * (0.5 + pointerX * 0.025);
    const cy = height * 0.29;
    const x1 = Math.sin(s[0]) * params.l1;
    const y1 = Math.cos(s[0]) * params.l1;
    const x2 = x1 + Math.sin(s[1]) * params.l2;
    const y2 = y1 + Math.cos(s[1]) * params.l2;
    out.px = cx;
    out.py = cy;
    out.jx = cx + x1 * scale;
    out.jy = cy + y1 * scale;
    out.bx = cx + x2 * scale;
    out.by = cy + y2 * scale;
    return out;
  }

  function pushTrail() {
    pointInto(primary, pointA);
    pointInto(twin, pointB);
    pushTrailPoint(trailA, pointA.bx, pointA.by);
    pushTrailPoint(trailB, pointB.bx, pointB.by);
  }

  function drawGrid() {
    ctx.fillStyle = '#02040b';
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(117,184,199,.08)';
    for (let x = 0; x <= width; x += 46) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 46) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,190,85,.12)';
    ctx.beginPath();
    ctx.moveTo(width * 0.08, height * 0.77);
    ctx.lineTo(width * 0.92, height * 0.77);
    ctx.stroke();
  }

  function drawTrail(trail, color) {
    if (trail.len < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = trailStride; i < trail.len; i += trailStride) {
      const alpha = i / trail.len;
      const prev = trailIndex(trail, i - trailStride);
      const curr = trailIndex(trail, i);
      ctx.strokeStyle = color.replace('ALPHA', (0.03 + alpha * 0.56).toFixed(3));
      ctx.lineWidth = 1 + alpha * 2.4;
      ctx.beginPath();
      ctx.moveTo(trail.x[prev], trail.y[prev]);
      ctx.lineTo(trail.x[curr], trail.y[curr]);
      ctx.stroke();
    }
  }

  function drawPendulum(s, color) {
    const p = pointInto(s, pointDraw);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p.px, p.py);
    ctx.lineTo(p.jx, p.jy);
    ctx.lineTo(p.bx, p.by);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.jx, p.jy, 4.2, 0, Math.PI * 2);
    ctx.arc(p.bx, p.by, 7.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function updateReadouts() {
    pointInto(primary, pointA);
    pointInto(twin, pointB);
    const drift = Math.hypot(pointA.bx - pointB.bx, pointA.by - pointB.by);
    const delta = primary[0] - twin[0];
    const sep = Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
    if (readouts.separation) readouts.separation.textContent = `${sep.toExponential(2)}${korean ? ' 라디안' : ' rad'}`;
    if (readouts.drift) readouts.drift.textContent = drift.toFixed(2) + ' px';
    if (readouts.trace) readouts.trace.textContent = `${trailA.len} ${labels.points}`;
    if (readouts.mode) readouts.mode.textContent = warming
      ? labels.warming
      : paused
        ? labels.paused
        : reduced
          ? labels.static
          : visible && !document.hidden ? labels.live : labels.standby;
  }

  function canonicalNumber(value) {
    return Object.is(value, -0) ? '0' : String(value);
  }

  function displayValue(radians, { scientific = false } = {}) {
    const value = angleUnit === 'deg' ? radians * radiansToDegrees : radians;
    if (scientific && Math.abs(value) < 0.01) return value.toExponential(6).replace(/\.?0+(?=e)/, '');
    return Number(value.toPrecision(15)).toString();
  }

  function exactDisplayValue(radians) {
    const value = angleUnit === 'deg' ? radians * radiansToDegrees : radians;
    const nearestInteger = Math.round(value);
    if (Math.abs(value - nearestInteger) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 2) {
      return canonicalNumber(nearestInteger);
    }
    return canonicalNumber(value);
  }

  function updateAngleSlider(input, radians) {
    if (!(input instanceof HTMLInputElement)) return;
    const minRadians = input === controls.separation ? 0.0001 : -Math.PI;
    const maxRadians = input === controls.separation ? maximumHandoffSeparation : Math.PI;
    const value = Math.min(maxRadians, Math.max(minRadians, radians));
    // A numeric `step` makes browsers coerce values onto a grid anchored at
    // `min`. For bounds such as -π, that silently changes exact authored
    // values before this module can read them. Keep the range unconstrained
    // and provide an explicit step only for our keyboard handler.
    input.step = 'any';
    if (angleUnit === 'deg') {
      input.min = canonicalNumber(minRadians * radiansToDegrees);
      input.max = canonicalNumber(maxRadians * radiansToDegrees);
      input.dataset.orbitKeyboardStep = input === controls.separation ? '0.001' : '0.1';
      input.value = canonicalNumber(value * radiansToDegrees);
    } else {
      input.min = canonicalNumber(minRadians);
      input.max = canonicalNumber(maxRadians);
      input.dataset.orbitKeyboardStep = input === controls.separation ? '0.0001' : '0.01';
      input.value = canonicalNumber(value);
    }
  }

  function handleRangeKeydown(input, event) {
    if (!(input instanceof HTMLInputElement)) return;
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? -1
        : 0;
    if (!direction) return;
    const current = Number(input.value);
    const minimum = Number(input.min);
    const maximum = Number(input.max);
    const authoredStep = Number(input.dataset.orbitKeyboardStep);
    if (![current, minimum, maximum, authoredStep].every(Number.isFinite) || authoredStep <= 0) return;
    event.preventDefault();
    const multiplier = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
    const next = Math.min(maximum, Math.max(
      minimum,
      Number((current + direction * authoredStep * multiplier).toPrecision(15))
    ));
    input.value = canonicalNumber(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setNumberInput(input, value) {
    if (!(input instanceof HTMLInputElement) || document.activeElement === input) return;
    input.value = value;
    input.removeAttribute('aria-invalid');
  }

  function updateDirectAngleBounds(input) {
    if (!(input instanceof HTMLInputElement)) return;
    input.min = angleUnit === 'deg' ? '-180' : canonicalNumber(-Math.PI);
    input.max = angleUnit === 'deg' ? '180' : canonicalNumber(Math.PI);
  }

  function updateDirectSeparationBounds(input) {
    if (!(input instanceof HTMLInputElement)) return;
    const factor = angleUnit === 'deg' ? radiansToDegrees : 1;
    input.min = canonicalNumber(minimumHandoffSeparation * factor);
    input.max = canonicalNumber(maximumHandoffSeparation * factor);
  }

  function updateExperimentLink(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return;
    try {
      const url = new URL(anchor.href);
      const contract = {
        experiment: 'sensitive-dependence',
        experimentSchema: 'pendulum-sensitive-dependence/v1',
        workflowStep: 'measure',
        trajectoryStage: 'perturbed',
        angleUnit,
        perturbationVar: 'th1',
        perturbationPattern: 'symmetric',
        perturbationSeed: '20260826',
        deltaTheta: canonicalNumber(initialSeparation),
        ensembleCount: '12',
        sysType: 'double',
        th1: canonicalNumber(initialTheta),
        th2: canonicalNumber(initialThetaTwo),
        iw1: '0',
        iw2: '0',
        m1: '1',
        m2: '1',
        l1: '1',
        l2: '1',
        g: canonicalNumber(params.g),
        gamma: canonicalNumber(damping),
        method: experimentContract.method,
        dt: canonicalNumber(experimentContract.dt)
      };
      Object.entries(contract).forEach(([name, value]) => url.searchParams.set(name, value));
      anchor.href = url.toString();
    } catch {
      /* keep the static fallback URL */
    }
  }

  function syncLandingExperimentUrl() {
    try {
      const url = new URL(window.location.href);
      const state = {
        experiment: 'sensitive-dependence',
        experimentSchema: 'pendulum-sensitive-dependence/v1',
        workflowStep: 'measure',
        trajectoryStage: 'perturbed',
        angleUnit,
        perturbationVar: 'th1',
        perturbationPattern: 'symmetric',
        perturbationSeed: '20260826',
        deltaTheta: canonicalNumber(initialSeparation),
        ensembleCount: '12',
        th1: canonicalNumber(initialTheta),
        th2: canonicalNumber(initialThetaTwo),
        gamma: canonicalNumber(damping),
        method: experimentContract.method,
        dt: canonicalNumber(experimentContract.dt)
      };
      Object.entries(state).forEach(([name, value]) => url.searchParams.set(name, value));
      window.history.replaceState(window.history.state, '', url);
      window.dispatchEvent(new CustomEvent('pendulum:experiment-state'));
    } catch {
      /* the state remains valid even when history is unavailable */
    }
  }

  function updateControlSurface({ syncUrl = false } = {}) {
    const thetaText = displayValue(initialTheta);
    const thetaTwoText = displayValue(initialThetaTwo);
    const separationText = displayValue(initialSeparation, { scientific: true });
    const thetaInputText = exactDisplayValue(initialTheta);
    const thetaTwoInputText = exactDisplayValue(initialThetaTwo);
    const separationInputText = exactDisplayValue(initialSeparation);
    const dampingText = canonicalNumber(damping);
    const shortUnit = angleUnit === 'deg' ? 'deg' : 'rad';
    const localizedUnit = korean && angleUnit === 'deg' ? '도' : korean ? ' 라디안'.trim() : shortUnit;
    if (controls.angleUnit instanceof HTMLSelectElement) controls.angleUnit.value = angleUnit;
    controls.unitLabels.forEach((label) => { label.textContent = localizedUnit; });
    if (controls.thetaOutput) controls.thetaOutput.textContent = `${thetaText} ${localizedUnit}`;
    if (controls.thetaTwoOutput) controls.thetaTwoOutput.textContent = `${thetaTwoText} ${localizedUnit}`;
    if (controls.separationOutput) controls.separationOutput.textContent = `${separationText} ${localizedUnit}`;
    if (controls.dampingOutput) controls.dampingOutput.textContent = dampingText;
    updateAngleSlider(controls.theta, initialTheta);
    updateAngleSlider(controls.thetaTwo, initialThetaTwo);
    updateAngleSlider(controls.separation, initialSeparation);
    updateDirectAngleBounds(controls.thetaNumber);
    updateDirectAngleBounds(controls.thetaTwoNumber);
    updateDirectSeparationBounds(controls.separationNumber);
    if (controls.damping instanceof HTMLInputElement) {
      controls.damping.step = 'any';
      controls.damping.dataset.orbitKeyboardStep = '0.01';
      controls.damping.value = canonicalNumber(Math.min(0.8, damping));
    }
    setNumberInput(controls.thetaNumber, thetaInputText);
    setNumberInput(controls.thetaTwoNumber, thetaTwoInputText);
    setNumberInput(controls.separationNumber, separationInputText);
    setNumberInput(controls.dampingNumber, dampingText);
    controls.theta?.setAttribute('aria-valuetext', labels.angleValue(thetaText, angleUnit));
    controls.thetaTwo?.setAttribute('aria-valuetext', labels.angleValue(thetaTwoText, angleUnit));
    controls.separation?.setAttribute('aria-valuetext', labels.angleValue(separationText, angleUnit));
    controls.damping?.setAttribute('aria-valuetext', labels.dampingValue(dampingText));
    if (controls.separationCaption) controls.separationCaption.textContent = labels.separationCaption(separationText, angleUnit);
    const perturbedTheta = initialTheta + initialSeparation;
    const omegaText = korean ? 'ω₁ 0 · ω₂ 0' : 'ω₁ 0 · ω₂ 0';
    const exactAngle = (radians) => angleUnit === 'deg'
      ? `${displayValue(radians)} deg (${canonicalNumber(radians)} rad)`
      : `${canonicalNumber(radians)} rad`;
    if (controls.referenceState) {
      controls.referenceState.textContent = `θ₁ ${exactAngle(initialTheta)} · θ₂ ${exactAngle(initialThetaTwo)} · ${omegaText}`;
    }
    if (controls.perturbedState) {
      controls.perturbedState.textContent = `θ₁ ${exactAngle(perturbedTheta)} · θ₂ ${exactAngle(initialThetaTwo)} · ${omegaText}`;
    }
    if (controls.stateStatus) controls.stateStatus.textContent = labels.exactStatus;
    updateExperimentLink(controls.launch);
    updateExperimentLink(controls.next);
    if (syncUrl) syncLandingExperimentUrl();
  }

  function clearTrail(trail) {
    trail.head = 0;
    trail.len = 0;
  }

  function scheduleWarmChunk(callback) {
    cancelWarmChunk?.();
    if (suspended) return;
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(callback, { timeout: 80 });
      cancelWarmChunk = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 8 }), 0);
      cancelWarmChunk = () => window.clearTimeout(id);
    }
  }

  function resetSimulation() {
    const generation = ++resetGeneration;
    cancelWarmChunk?.();
    cancelWarmChunk = null;
    stop();
    warming = true;
    primary[0] = initialTheta;
    primary[1] = initialThetaTwo;
    primary[2] = 0;
    primary[3] = 0;
    twin[0] = initialTheta + initialSeparation;
    twin[1] = initialThetaTwo;
    twin[2] = 0;
    twin[3] = 0;
    clearTrail(trailA);
    clearTrail(trailB);
    frame = 0;
    physicsAccumulator = 0;
    trailSampleAccumulator = 0;
    lastTick = 0;
    lastDraw = 0;
    const warmupSteps = Math.ceil((reduced ? 180 : 80) * trailSampleInterval / fixedStep);
    let completed = 0;
    updateControlSurface();
    window.__orbitConsoleState = {
      angleUnit,
      initialTheta,
      initialThetaTwo,
      initialSeparation,
      damping,
      method: experimentContract.method,
      dt: experimentContract.dt,
      reference: [initialTheta, initialThetaTwo, 0, 0],
      perturbed: [initialTheta + initialSeparation, initialThetaTwo, 0, 0]
    };
    // Do not leave the instrument as a black rectangle while low-priority
    // warmup yields to a busy renderer. The initial physical state, grid, and
    // first trace sample are truthful immediately; richer history arrives in
    // bounded idle chunks below.
    pushTrail();
    draw();
    updateReadouts();

    function warmChunk(deadline) {
      cancelWarmChunk = null;
      if (generation !== resetGeneration) return;
      const chunkStart = performance.now();
      while (completed < warmupSteps
        && (deadline.didTimeout || deadline.timeRemaining() > 1)
        && performance.now() - chunkStart < 6) {
        advanceSimulation();
        completed += 1;
      }
      if (completed < warmupSteps) {
        scheduleWarmChunk(warmChunk);
        return;
      }
      warming = false;
      draw();
      updateReadouts();
      if (visible && !paused && !reduced && !document.hidden) start();
    }
    scheduleWarmChunk(warmChunk);
  }

  function scheduleReset() {
    updateControlSurface({ syncUrl: true });
    window.__orbitConsoleState = {
      angleUnit,
      initialTheta,
      initialThetaTwo,
      initialSeparation,
      damping,
      method: experimentContract.method,
      dt: experimentContract.dt,
      reference: [initialTheta, initialThetaTwo, 0, 0],
      perturbed: [initialTheta + initialSeparation, initialThetaTwo, 0, 0]
    };
    if (suspended) {
      resetAfterResume = true;
      return;
    }
    if (resetRaf) return;
    resetRaf = window.requestAnimationFrame(() => {
      resetRaf = 0;
      resetSimulation();
    });
  }

  function draw() {
    drawGrid();
    drawTrail(trailA, 'rgba(117,184,199,ALPHA)');
    drawTrail(trailB, 'rgba(210,169,104,ALPHA)');
    drawPendulum(primary, 'rgba(117,184,199,.92)');
    drawPendulum(twin, 'rgba(210,169,104,.88)');
    ctx.fillStyle = 'rgba(244,248,255,.86)';
    pointInto(primary, pointA);
    ctx.beginPath();
    ctx.arc(pointA.px, pointA.py, 4.6, 0, Math.PI * 2);
    ctx.fill();
    window.__orbitConsolePainted = true;
  }

  function tick(timestamp) {
    raf = 0;
    if (suspended || reduced || !visible || document.hidden || warming) {
      updateReadouts();
      return;
    }
    raf = window.requestAnimationFrame(tick);
    const elapsed = lastTick ? Math.min((timestamp - lastTick) / 1000, maximumFrameElapsed) : 0;
    lastTick = timestamp;
    physicsAccumulator += elapsed;
    let steps = 0;
    while (physicsAccumulator >= fixedStep && steps < maximumPhysicsSteps) {
      advanceSimulation();
      physicsAccumulator -= fixedStep;
      steps += 1;
    }
    if (steps === maximumPhysicsSteps) physicsAccumulator = 0;
    if (lastDraw && timestamp - lastDraw < frameInterval) return;
    lastDraw = timestamp;
    draw();
    frame += 1;
    if (frame % 10 === 0) updateReadouts();
  }

  function start() {
    if (!suspended && !paused && !warming && !raf) {
      lastTick = 0;
      lastDraw = 0;
      raf = window.requestAnimationFrame(tick);
    }
  }

  function stop() {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function setVisible(nextVisible) {
    visible = nextVisible;
    if (visible && !reduced && !warming && !document.hidden) start();
    else stop();
    updateReadouts();
  }

  function setPaused(nextPaused) {
    paused = nextPaused;
    if (controls.toggle instanceof HTMLButtonElement) {
      controls.toggle.setAttribute('aria-pressed', String(paused));
      controls.toggle.textContent = reduced ? labels.reduced : paused ? labels.resume : labels.pause;
      controls.toggle.disabled = reduced;
    }
    if (paused) stop();
    else if (visible && !reduced && !warming && !document.hidden) start();
    updateReadouts();
  }

  // Cache the canvas rect so pointer tracking never forces a reflow per move;
  // invalidate it whenever the canvas can shift (scroll/resize).
  let canvasRect = null;
  let resizeRaf = 0;

  function scheduleCanvasResize() {
    canvasRect = null;
    if (resizeRaf || suspended) return;
    resizeRaf = window.requestAnimationFrame(() => {
      resizeRaf = 0;
      if (suspended) return;
      resize();
      draw();
    });
  }

  function handlePointerMove(event) {
    if (!canvasRect) canvasRect = canvas.getBoundingClientRect();
    if (canvasRect.width <= 0) return;
    pointerX = ((event.clientX - canvasRect.left) / canvasRect.width - 0.5) * 2;
  }

  function handleThetaInput() {
    const display = Number.parseFloat(controls.theta.value);
    if (!Number.isFinite(display)) return;
    initialTheta = angleUnit === 'deg' ? display / radiansToDegrees : display;
    scheduleReset();
  }

  function handleThetaTwoInput() {
    const display = Number.parseFloat(controls.thetaTwo.value);
    if (!Number.isFinite(display)) return;
    initialThetaTwo = angleUnit === 'deg' ? display / radiansToDegrees : display;
    scheduleReset();
  }

  function handleSeparationInput() {
    const display = Number.parseFloat(controls.separation.value);
    if (!Number.isFinite(display)) return;
    const radians = angleUnit === 'deg' ? display / radiansToDegrees : display;
    initialSeparation = Math.max(minimumHandoffSeparation, Math.min(maximumHandoffSeparation, radians));
    scheduleReset();
  }

  function handleDampingInput() {
    const value = Number.parseFloat(controls.damping.value);
    if (!Number.isFinite(value)) return;
    damping = Math.max(0, Math.min(10, value));
    scheduleReset();
  }

  function handleDirectInput(input, apply, { angle = false, minimum = -1e12, maximum = 1e12 } = {}) {
    if (!(input instanceof HTMLInputElement)) return;
    const raw = input.value.trim();
    if (!raw) {
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    const display = Number(raw);
    const radians = angle && angleUnit === 'deg' ? display / radiansToDegrees : display;
    if (!Number.isFinite(radians) || radians < minimum || radians > maximum) {
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    input.removeAttribute('aria-invalid');
    apply(radians);
    scheduleReset();
  }

  function restoreDirectInputs() {
    updateControlSurface();
  }

  function handleAngleUnitChange() {
    if (!(controls.angleUnit instanceof HTMLSelectElement)) return;
    angleUnit = controls.angleUnit.value === 'deg' ? 'deg' : 'rad';
    updateControlSurface({ syncUrl: true });
    window.__orbitConsoleState = {
      angleUnit,
      initialTheta,
      initialThetaTwo,
      initialSeparation,
      damping,
      method: experimentContract.method,
      dt: experimentContract.dt,
      reference: [initialTheta, initialThetaTwo, 0, 0],
      perturbed: [initialTheta + initialSeparation, initialThetaTwo, 0, 0]
    };
  }

  function handleVisibilityChange() {
    if (document.hidden) stop();
    else if (visible && !reduced && !warming) start();
    updateReadouts();
  }

  function handleReducedMotionChange() {
    reduced = reducedMotionQuery.matches || captureMode;
    if (reduced) stop();
    else if (visible && !warming && !paused && !document.hidden) start();
    updateReadouts();
    setPaused(paused);
  }

  function bindRuntime() {
    if (runtimeController) return;
    runtimeController = new AbortController();
    const { signal } = runtimeController;
    const listen = (target, type, listener, options = {}) => {
      target?.addEventListener?.(type, listener, { ...options, signal });
    };

    listen(canvas, 'pointermove', handlePointerMove, { passive: true });
    listen(canvas, 'pointerleave', () => { pointerX = 0; });
    listen(window, 'scroll', () => { canvasRect = null; }, { passive: true });
    listen(controls.theta, 'input', handleThetaInput);
    listen(controls.thetaTwo, 'input', handleThetaTwoInput);
    listen(controls.separation, 'input', handleSeparationInput);
    listen(controls.damping, 'input', handleDampingInput);
    for (const input of [controls.theta, controls.thetaTwo, controls.separation, controls.damping]) {
      listen(input, 'keydown', (event) => handleRangeKeydown(input, event));
    }
    listen(controls.thetaNumber, 'input', () => handleDirectInput(
      controls.thetaNumber,
      (value) => { initialTheta = value; },
      { angle: true, minimum: -Math.PI, maximum: Math.PI }
    ));
    listen(controls.thetaTwoNumber, 'input', () => handleDirectInput(
      controls.thetaTwoNumber,
      (value) => { initialThetaTwo = value; },
      { angle: true, minimum: -Math.PI, maximum: Math.PI }
    ));
    listen(controls.separationNumber, 'input', () => handleDirectInput(
      controls.separationNumber,
      (value) => { initialSeparation = value; },
      { angle: true, minimum: minimumHandoffSeparation, maximum: maximumHandoffSeparation }
    ));
    listen(controls.dampingNumber, 'input', () => handleDirectInput(
      controls.dampingNumber,
      (value) => { damping = value; },
      { minimum: 0, maximum: 10 }
    ));
    for (const input of [controls.thetaNumber, controls.thetaTwoNumber, controls.separationNumber, controls.dampingNumber]) {
      listen(input, 'change', restoreDirectInputs);
    }
    listen(controls.angleUnit, 'change', handleAngleUnitChange);
    listen(controls.reset, 'click', scheduleReset);
    listen(controls.toggle, 'click', () => setPaused(!paused));
    listen(window, 'resize', scheduleCanvasResize, { passive: true });
    listen(window.visualViewport, 'resize', scheduleCanvasResize, { passive: true });
    listen(document, 'visibilitychange', handleVisibilityChange);
    listen(reducedMotionQuery, 'change', handleReducedMotionChange);

    consoleResizeObserver = 'ResizeObserver' in window
      ? new ResizeObserver(scheduleCanvasResize)
      : null;
    consoleResizeObserver?.observe(canvas);

    if ('IntersectionObserver' in window) {
      visibilityObserver = new IntersectionObserver((entries) => {
        setVisible(entries.some((entry) => entry.isIntersecting));
      }, { rootMargin: '280px 0px' });
      visibilityObserver.observe(canvas);
    } else {
      setVisible(true);
    }
  }

  function suspendRuntime() {
    if (suspended) return;
    suspended = true;
    resetAfterResume ||= warming || Boolean(resetRaf) || Boolean(cancelWarmChunk);
    resetGeneration += 1;
    cancelWarmChunk?.();
    cancelWarmChunk = null;
    warming = false;
    stop();
    if (resetRaf) window.cancelAnimationFrame(resetRaf);
    if (resizeRaf) window.cancelAnimationFrame(resizeRaf);
    resetRaf = 0;
    resizeRaf = 0;
    runtimeController?.abort();
    runtimeController = null;
    consoleResizeObserver?.disconnect();
    consoleResizeObserver = null;
    visibilityObserver?.disconnect();
    visibilityObserver = null;
    canvasRect = null;
    visible = false;
  }

  function resumeRuntime() {
    if (!suspended) return;
    suspended = false;
    reduced = reducedMotionQuery.matches || captureMode;
    bindRuntime();
    resize();
    draw();
    if (resetAfterResume) {
      resetAfterResume = false;
      resetSimulation();
    } else {
      updateControlSurface();
      setPaused(paused);
      updateReadouts();
    }
  }

  function handlePageHide() {
    suspendRuntime();
  }

  function handlePageShow(event) {
    if (event.persisted) resumeRuntime();
  }

  // These two root lifecycle listeners intentionally survive suspension: a
  // bfcache-restored document does not re-evaluate this module, so pageshow is
  // the only safe point at which to rebuild its abortable listener graph.
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('pageshow', handlePageShow);

  window.__orbitConsoleLifecycle = {
    get active() { return Boolean(runtimeController); },
    get suspended() { return suspended; },
    get pendingWork() { return Boolean(raf || resetRaf || resizeRaf || cancelWarmChunk); },
    get observing() { return Boolean(consoleResizeObserver || visibilityObserver); }
  };

  bindRuntime();
  resize();
  resetSimulation();
  setPaused(false);
})();
