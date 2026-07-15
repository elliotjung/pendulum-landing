import { createRk4Work, rk4StepDouble } from './pendulum-demo-kernel.js';

// Animated double-pendulum trajectory console for the landing page.
// Decorative only: it runs a small local RK4 integration and never calls the app.
(function () {
  'use strict';

  const canvas = document.getElementById('orbit-console');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const captureMode = new URLSearchParams(window.location.search).has('captureHero');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || captureMode;
  const korean = document.documentElement.lang === 'ko';
  const lowPower = window.matchMedia('(max-width: 720px), (pointer: coarse)').matches
    || navigator.connection?.saveData === true
    || (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4)
    || (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4);
  const targetFps = lowPower ? 30 : 60;
  const frameInterval = 1000 / targetFps;
  const physicsStepsPerFrame = lowPower ? 6 : 3;
  const trailStride = lowPower ? 3 : 2;
  const readouts = {
    separation: document.querySelector('[data-orbit-readout="separation"]'),
    drift: document.querySelector('[data-orbit-readout="drift"]'),
    trace: document.querySelector('[data-orbit-readout="trace"]'),
    mode: document.querySelector('[data-orbit-readout="mode"]')
  };
  const controls = {
    theta: document.querySelector('[data-orbit-control="theta"]'),
    damping: document.querySelector('[data-orbit-control="damping"]'),
    thetaOutput: document.querySelector('[data-orbit-output="theta"]'),
    dampingOutput: document.querySelector('[data-orbit-output="damping"]'),
    reset: document.querySelector('[data-orbit-reset]'),
    toggle: document.querySelector('[data-orbit-toggle]'),
    launch: document.querySelector('[data-orbit-launch]')
  };

  let width = 920;
  let height = 620;
  let dpr = 1;
  let raf = 0;
  let frame = 0;
  let pointerX = 0;
  let pointerY = 0;
  let visible = false;
  let paused = false;
  let lastTick = 0;

  const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
  const runtimeParams = { ...params };
  const primary = [2.18, 2.64, 0, 0];
  const twin = [2.181, 2.64, 0, 0];
  let initialTheta = 2.18;
  let damping = 0.06;
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

  function rk4Into(s, work, dt) {
    runtimeParams.g = params.g + pointerY * 0.45;
    rk4StepDouble(s, runtimeParams, dt, work);
    const decay = Math.exp(-damping * dt);
    s[2] *= decay;
    s[3] *= decay;
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
    ctx.strokeStyle = 'rgba(24,212,248,.07)';
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
    const sep = Math.abs(primary[0] - twin[0]);
    if (readouts.separation) readouts.separation.textContent = sep.toExponential(2) + ' rad';
    if (readouts.drift) readouts.drift.textContent = drift.toFixed(2) + ' px';
    if (readouts.trace) readouts.trace.textContent = trailA.len + ' pts';
    if (readouts.mode) readouts.mode.textContent = paused ? 'paused' : reduced ? 'static' : visible && !document.hidden ? 'live' : 'standby';
  }

  function updateControlSurface() {
    if (controls.thetaOutput) controls.thetaOutput.textContent = `${initialTheta.toFixed(2)} rad`;
    if (controls.dampingOutput) controls.dampingOutput.textContent = damping.toFixed(2);
    if (controls.launch instanceof HTMLAnchorElement) {
      try {
        const url = new URL(controls.launch.href);
        url.searchParams.set('th1', initialTheta.toFixed(2));
        url.searchParams.set('gamma', damping.toFixed(2));
        controls.launch.href = url.toString();
      } catch {
        /* keep the static fallback URL */
      }
    }
  }

  function clearTrail(trail) {
    trail.head = 0;
    trail.len = 0;
  }

  function resetSimulation() {
    primary[0] = initialTheta;
    primary[1] = 2.64;
    primary[2] = 0;
    primary[3] = 0;
    twin[0] = initialTheta + 0.001;
    twin[1] = 2.64;
    twin[2] = 0;
    twin[3] = 0;
    clearTrail(trailA);
    clearTrail(trailB);
    frame = 0;
    const warmupSteps = reduced ? 180 : 80;
    for (let i = 0; i < warmupSteps; i += 1) {
      rk4Into(primary, workA, 1 / 150);
      rk4Into(twin, workB, 1 / 150);
      pushTrail();
    }
    draw();
    updateReadouts();
    updateControlSurface();
    window.__orbitConsoleState = { initialTheta, damping };
  }

  function draw() {
    drawGrid();
    drawTrail(trailA, 'rgba(24,212,248,ALPHA)');
    drawTrail(trailB, 'rgba(255,95,143,ALPHA)');
    drawPendulum(primary, 'rgba(24,212,248,.92)');
    drawPendulum(twin, 'rgba(255,95,143,.86)');
    ctx.fillStyle = 'rgba(244,248,255,.86)';
    pointInto(primary, pointA);
    ctx.beginPath();
    ctx.arc(pointA.px, pointA.py, 4.6, 0, Math.PI * 2);
    ctx.fill();
    window.__orbitConsolePainted = true;
  }

  function tick(timestamp) {
    raf = 0;
    if (reduced || !visible || document.hidden) {
      updateReadouts();
      return;
    }
    raf = window.requestAnimationFrame(tick);
    if (lastTick && timestamp - lastTick < frameInterval) return;
    lastTick = timestamp;
    for (let i = 0; i < physicsStepsPerFrame; i += 1) {
      rk4Into(primary, workA, 1 / 150);
      rk4Into(twin, workB, 1 / 150);
      pushTrail();
    }
    draw();
    frame += 1;
    if (frame % 10 === 0) updateReadouts();
  }

  function start() {
    if (!paused && !raf) {
      lastTick = 0;
      raf = window.requestAnimationFrame(tick);
    }
  }

  function stop() {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function setVisible(nextVisible) {
    visible = nextVisible;
    if (visible && !reduced && !document.hidden) start();
    else stop();
    updateReadouts();
  }

  function setPaused(nextPaused) {
    paused = nextPaused;
    if (controls.toggle instanceof HTMLButtonElement) {
      controls.toggle.setAttribute('aria-pressed', String(paused));
      controls.toggle.textContent = paused
        ? korean ? '움직임 재개' : 'Resume motion'
        : korean ? '움직임 일시정지' : 'Pause motion';
    }
    if (paused) stop();
    else if (visible && !reduced && !document.hidden) start();
    updateReadouts();
  }

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  }, { passive: true });
  canvas.addEventListener('pointerleave', () => {
    pointerX = 0;
    pointerY = 0;
  });
  controls.theta?.addEventListener('input', () => {
    initialTheta = Number.parseFloat(controls.theta.value) || 2.18;
    resetSimulation();
  });
  controls.damping?.addEventListener('input', () => {
    damping = Math.max(0, Number.parseFloat(controls.damping.value) || 0);
    resetSimulation();
  });
  controls.reset?.addEventListener('click', resetSimulation);
  controls.toggle?.addEventListener('click', () => setPaused(!paused));

  window.addEventListener('resize', () => {
    resize();
    draw();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (visible && !reduced) start();
    updateReadouts();
  });

  resize();
  resetSimulation();

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      setVisible(entries.some((entry) => entry.isIntersecting));
    }, { rootMargin: '280px 0px' });
    observer.observe(canvas);
  } else {
    setVisible(true);
  }
})();
