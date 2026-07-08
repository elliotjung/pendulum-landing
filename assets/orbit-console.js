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
  let visible = false;

  const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
  const primary = [2.18, 2.64, 0, 0];
  const twin = [2.181, 2.64, 0, 0];
  const maxTrail = 520;
  const trailA = makeTrail(maxTrail);
  const trailB = makeTrail(maxTrail);
  const workA = makeWork();
  const workB = makeWork();
  const pointA = makePoint();
  const pointB = makePoint();
  const pointDraw = makePoint();

  function makeWork() {
    return {
      k1: [0, 0, 0, 0],
      k2: [0, 0, 0, 0],
      k3: [0, 0, 0, 0],
      k4: [0, 0, 0, 0],
      tmp: [0, 0, 0, 0]
    };
  }

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
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function derivInto(s, out) {
    const a1 = s[0], a2 = s[1], v1 = s[2], v2 = s[3];
    const m1 = params.m1, m2 = params.m2, l1 = params.l1, l2 = params.l2;
    const g = params.g + pointerY * 0.45;
    const d = a1 - a2;
    const sd = Math.sin(d);
    const cd = Math.cos(d);
    const den = 2 * m1 + m2 - m2 * Math.cos(2 * d);
    out[0] = v1;
    out[1] = v2;
    out[2] = (
      -g * (2 * m1 + m2) * Math.sin(a1)
      - m2 * g * Math.sin(a1 - 2 * a2)
      - 2 * sd * m2 * (v2 * v2 * l2 + v1 * v1 * l1 * cd)
    ) / (l1 * den);
    out[3] = (
      2 * sd * (v1 * v1 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(a1) + v2 * v2 * l2 * m2 * cd)
    ) / (l2 * den);
  }

  function stageInto(s, k, scale, out) {
    out[0] = s[0] + k[0] * scale;
    out[1] = s[1] + k[1] * scale;
    out[2] = s[2] + k[2] * scale;
    out[3] = s[3] + k[3] * scale;
  }

  function rk4Into(s, work, dt) {
    derivInto(s, work.k1);
    stageInto(s, work.k1, dt * 0.5, work.tmp);
    derivInto(work.tmp, work.k2);
    stageInto(s, work.k2, dt * 0.5, work.tmp);
    derivInto(work.tmp, work.k3);
    stageInto(s, work.k3, dt, work.tmp);
    derivInto(work.tmp, work.k4);
    for (let i = 0; i < 4; i += 1) {
      s[i] += (dt / 6) * (work.k1[i] + 2 * work.k2[i] + 2 * work.k3[i] + work.k4[i]);
    }
    s[2] *= 0.9996;
    s[3] *= 0.9996;
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
    for (let i = 1; i < trail.len; i += 1) {
      const alpha = i / trail.len;
      const prev = trailIndex(trail, i - 1);
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
    if (readouts.mode) readouts.mode.textContent = reduced ? 'static' : visible && !document.hidden ? 'live' : 'standby';
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

  function tick() {
    raf = 0;
    if (reduced || !visible || document.hidden) {
      updateReadouts();
      return;
    }
    raf = window.requestAnimationFrame(tick);
    for (let i = 0; i < 3; i += 1) {
      rk4Into(primary, workA, 1 / 150);
      rk4Into(twin, workB, 1 / 150);
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

  function setVisible(nextVisible) {
    visible = nextVisible;
    if (visible && !reduced && !document.hidden) start();
    else stop();
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
  for (let i = 0; i < (reduced ? 360 : 80); i += 1) {
    rk4Into(primary, workA, 1 / 150);
    rk4Into(twin, workB, 1 / 150);
    pushTrail();
  }
  draw();
  updateReadouts();

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      setVisible(entries.some((entry) => entry.isIntersecting));
    }, { rootMargin: '280px 0px' });
    observer.observe(canvas);
  } else {
    setVisible(true);
  }
})();
