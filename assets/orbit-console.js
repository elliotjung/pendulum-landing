// Animated double-pendulum trajectory console for the landing page.
// Decorative only: it runs a small local RK4 integration and never calls the app.
(function () {
  'use strict';

  const canvas = document.getElementById('orbit-console');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const readouts = {
    separation: document.querySelector('[data-orbit-readout="separation"]'),
    drift: document.querySelector('[data-orbit-readout="drift"]'),
    trace: document.querySelector('[data-orbit-readout="trace"]'),
    mode: document.querySelector('[data-orbit-readout="mode"]')
  };

  let width = 920;
  let height = 620;
  let dpr = 1;
  let raf = 0;
  let frame = 0;
  let pointerX = 0;
  let pointerY = 0;

  const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
  let primary = [2.18, 2.64, 0, 0];
  let twin = [2.181, 2.64, 0, 0];
  const trailA = [];
  const trailB = [];
  const maxTrail = 520;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(320, rect.width || 920);
    height = Math.max(240, rect.height || width * 620 / 920);
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function deriv(s) {
    const a1 = s[0], a2 = s[1], v1 = s[2], v2 = s[3];
    const m1 = params.m1, m2 = params.m2, l1 = params.l1, l2 = params.l2;
    const g = params.g + pointerY * 0.45;
    const d = a1 - a2;
    const sd = Math.sin(d);
    const cd = Math.cos(d);
    const den = 2 * m1 + m2 - m2 * Math.cos(2 * d);
    const a1acc = (
      -g * (2 * m1 + m2) * Math.sin(a1)
      - m2 * g * Math.sin(a1 - 2 * a2)
      - 2 * sd * m2 * (v2 * v2 * l2 + v1 * v1 * l1 * cd)
    ) / (l1 * den);
    const a2acc = (
      2 * sd * (v1 * v1 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(a1) + v2 * v2 * l2 * m2 * cd)
    ) / (l2 * den);
    return [v1, v2, a1acc, a2acc];
  }

  function rk4(s, dt) {
    const k1 = deriv(s);
    const k2 = deriv(s.map((v, i) => v + k1[i] * dt * 0.5));
    const k3 = deriv(s.map((v, i) => v + k2[i] * dt * 0.5));
    const k4 = deriv(s.map((v, i) => v + k3[i] * dt));
    for (let i = 0; i < 4; i += 1) {
      s[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    s[2] *= 0.9996;
    s[3] *= 0.9996;
    return s;
  }

  function point(s) {
    const scale = Math.min(width, height) * 0.23;
    const cx = width * (0.5 + pointerX * 0.025);
    const cy = height * 0.29;
    const x1 = Math.sin(s[0]) * params.l1;
    const y1 = Math.cos(s[0]) * params.l1;
    const x2 = x1 + Math.sin(s[1]) * params.l2;
    const y2 = y1 + Math.cos(s[1]) * params.l2;
    return {
      pivot: [cx, cy],
      joint: [cx + x1 * scale, cy + y1 * scale],
      bob: [cx + x2 * scale, cy + y2 * scale]
    };
  }

  function pushTrail() {
    trailA.push(point(primary).bob);
    trailB.push(point(twin).bob);
    while (trailA.length > maxTrail) trailA.shift();
    while (trailB.length > maxTrail) trailB.shift();
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
    if (trail.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < trail.length; i += 1) {
      const alpha = i / trail.length;
      ctx.strokeStyle = color.replace('ALPHA', (0.03 + alpha * 0.56).toFixed(3));
      ctx.lineWidth = 1 + alpha * 2.4;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1][0], trail[i - 1][1]);
      ctx.lineTo(trail[i][0], trail[i][1]);
      ctx.stroke();
    }
  }

  function drawPendulum(s, color) {
    const p = point(s);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p.pivot[0], p.pivot[1]);
    ctx.lineTo(p.joint[0], p.joint[1]);
    ctx.lineTo(p.bob[0], p.bob[1]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.joint[0], p.joint[1], 4.2, 0, Math.PI * 2);
    ctx.arc(p.bob[0], p.bob[1], 7.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function updateReadouts() {
    const pa = point(primary).bob;
    const pb = point(twin).bob;
    const drift = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
    const sep = Math.abs(primary[0] - twin[0]);
    if (readouts.separation) readouts.separation.textContent = sep.toExponential(2) + ' rad';
    if (readouts.drift) readouts.drift.textContent = drift.toFixed(2) + ' px';
    if (readouts.trace) readouts.trace.textContent = trailA.length + ' pts';
    if (readouts.mode) readouts.mode.textContent = reduced ? 'static' : 'live';
  }

  function draw() {
    drawGrid();
    drawTrail(trailA, 'rgba(24,212,248,ALPHA)');
    drawTrail(trailB, 'rgba(255,95,143,ALPHA)');
    drawPendulum(primary, 'rgba(24,212,248,.92)');
    drawPendulum(twin, 'rgba(255,95,143,.86)');
    ctx.fillStyle = 'rgba(244,248,255,.86)';
    const pivot = point(primary).pivot;
    ctx.beginPath();
    ctx.arc(pivot[0], pivot[1], 4.6, 0, Math.PI * 2);
    ctx.fill();
    window.__orbitConsolePainted = true;
  }

  function tick() {
    raf = window.requestAnimationFrame(tick);
    for (let i = 0; i < 3; i += 1) {
      primary = rk4(primary, 1 / 150);
      twin = rk4(twin, 1 / 150);
      pushTrail();
    }
    draw();
    frame += 1;
    if (frame % 10 === 0) updateReadouts();
  }

  function start() {
    if (!raf) raf = window.requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
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

  window.addEventListener('resize', () => {
    resize();
    draw();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (!reduced) start();
  });

  resize();
  for (let i = 0; i < (reduced ? 360 : 80); i += 1) {
    primary = rk4(primary, 1 / 150);
    twin = rk4(twin, 1 / 150);
    pushTrail();
  }
  draw();
  updateReadouts();
  if (!reduced) start();
})();
