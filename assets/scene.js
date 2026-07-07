// ============================================================================
// PENDULUM LAB — Hero sculpture
// A cinematic 3D "order → chaos" data sculpture. It does NOT run the simulator:
// one chaotic double-pendulum trajectory is baked a single time at startup, and
// scrolling MORPHS a luminous ribbon from an ordered ring into that frozen
// chaotic tangle. Bloom + drifting particles + dynamic cyan/violet lights +
// mouse-parallax / drag-orbit camera. Pure decoration, scroll-reactive.
// ============================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const CY = new THREE.Color('#18d4f8');
const VI = new THREE.Color('#9d78ff');

const canvas = document.getElementById('hero-canvas');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (canvas) canvas.setAttribute('aria-hidden', 'true');

let renderer, scene, camera, composer, bloom;
let pivot, ribbon, coreLine, particles, light1, light2;
let W = window.innerWidth, H = window.innerHeight;

const N = reduced ? 150 : 260;          // points along the sculpture
let ordered = [], chaos = [];            // two baked target shapes (Vector3[])
let morph = 0, morphTarget = 0;          // 0 = order, 1 = chaos
let lastBuilt = -1;
let ribbonGeo = null;

// ---- bake the two shapes ---------------------------------------------------
function bakeShapes() {
  // ORDERED: a clean ring with a gentle vertical wave — "order"
  const R = 1.7;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    ordered.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R * 0.62, Math.sin(a * 2) * 0.45));
  }

  // CHAOS: one double-pendulum trajectory, integrated ONCE and frozen.
  const P = { a1: 2.4, a2: 2.7, v1: 0, v2: 0, l1: 1.1, l2: 0.95, g: 9.81 };
  const raw = [];
  const dt = 1 / 240;
  const deriv = (a1, a2, v1, v2) => {
    const m1 = 1, m2 = 1, l1 = P.l1, l2 = P.l2, g = P.g;
    const d = a1 - a2, sd = Math.sin(d), cd = Math.cos(d);
    const den1 = l1 * (2 * m1 + m2 - m2 * Math.cos(2 * d));
    const den2 = l2 * (2 * m1 + m2 - m2 * Math.cos(2 * d));
    const a1a = (-g * (2 * m1 + m2) * Math.sin(a1) - m2 * g * Math.sin(a1 - 2 * a2) - 2 * sd * m2 * (v2 * v2 * l2 + v1 * v1 * l1 * cd)) / den1;
    const a2a = (2 * sd * (v1 * v1 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(a1) + v2 * v2 * l2 * m2 * cd)) / den2;
    return [v1, v2, a1a, a2a];
  };
  let a1 = P.a1, a2 = P.a2, v1 = P.v1, v2 = P.v2;
  const sampleEvery = 8;
  for (let s = 0; s < N * sampleEvery; s++) {
    const k1 = deriv(a1, a2, v1, v2);
    const k2 = deriv(a1 + k1[0] * dt / 2, a2 + k1[1] * dt / 2, v1 + k1[2] * dt / 2, v2 + k1[3] * dt / 2);
    const k3 = deriv(a1 + k2[0] * dt / 2, a2 + k2[1] * dt / 2, v1 + k2[2] * dt / 2, v2 + k2[3] * dt / 2);
    const k4 = deriv(a1 + k3[0] * dt, a2 + k3[1] * dt, v1 + k3[2] * dt, v2 + k3[3] * dt);
    a1 += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    a2 += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    v1 += dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    v2 += dt / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
    if (s % sampleEvery === 0) {
      const x1 = P.l1 * Math.sin(a1), y1 = -P.l1 * Math.cos(a1);
      const x2 = x1 + P.l2 * Math.sin(a2), y2 = y1 - P.l2 * Math.cos(a2);
      raw.push(new THREE.Vector3(x2, y2, x1 * 0.85)); // x1 → depth ⇒ a 3D tangle
    }
  }
  // center + scale the chaotic cloud to match the ring footprint
  const box = new THREE.Box3().setFromPoints(raw);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const sc = 3.4 / Math.max(size.x, size.y, size.z);
  chaos = raw.slice(0, N).map((p) => p.clone().sub(c).multiplyScalar(sc));
  while (chaos.length < N) chaos.push(chaos[chaos.length - 1].clone());
}

// ---- ribbon build (morphed) ------------------------------------------------
const _a = new THREE.Vector3();
function morphedPoints(t) {
  const ease = t * t * (3 - 2 * t);
  const pts = [];
  for (let i = 0; i < N; i++) {
    _a.copy(ordered[i]).lerp(chaos[i], ease);
    pts.push(_a.clone());
  }
  return pts;
}

function buildRibbon(t) {
  const pts = morphedPoints(t);
  const closed = t < 0.04;
  const curve = new THREE.CatmullRomCurve3(pts, closed);
  const seg = N;
  const radius = 0.05 + t * 0.012;
  const geo = new THREE.TubeGeometry(curve, seg, radius, 8, closed);
  const rings = seg + 1, radial = 9;
  const colors = new Float32Array(geo.attributes.position.count * 3);
  let p = 0;
  for (let i = 0; i < rings; i++) {
    const u = i / (rings - 1);
    const col = VI.clone().lerp(CY, u);
    col.multiplyScalar(0.7 + 0.6 * Math.sin(u * Math.PI));
    for (let r = 0; r < radial; r++) { colors[p++] = col.r; colors[p++] = col.g; colors[p++] = col.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (ribbonGeo) ribbonGeo.dispose();
  ribbon.geometry = geo;
  ribbonGeo = geo;

  // crisp additive core line
  const cpos = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) { cpos[i * 3] = pts[i].x; cpos[i * 3 + 1] = pts[i].y; cpos[i * 3 + 2] = pts[i].z; }
  coreLine.geometry.dispose();
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(cpos, 3));
  coreLine.geometry = cg;
}

// ---- scene -----------------------------------------------------------------
function init() {
  bakeShapes();

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060f, 0.055);

  camera = new THREE.PerspectiveCamera(46, W / H, 0.1, 100);
  camera.position.set(0, 0.2, 8.2);

  scene.add(new THREE.AmbientLight(0x223052, 0.7));
  const key = new THREE.DirectionalLight(0x8fb4ff, 0.5); key.position.set(3, 5, 4); scene.add(key);
  light1 = new THREE.PointLight(CY, 10, 11, 2); light1.position.set(-2, 1, 2); scene.add(light1);
  light2 = new THREE.PointLight(VI, 9, 11, 2); light2.position.set(2, -1, -1); scene.add(light2);

  pivot = new THREE.Group();
  scene.add(pivot);

  ribbon = new THREE.Mesh(new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .96, blending: THREE.AdditiveBlending, depthWrite: false }));
  pivot.add(ribbon);
  coreLine = new THREE.Line(new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xeafcff, transparent: true, opacity: .4, blending: THREE.AdditiveBlending, depthWrite: false }));
  pivot.add(coreLine);

  buildParticles();
  buildRibbon(0); lastBuilt = 0;

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.05, 0.6, 0.06);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  bindInteraction();
  window.addEventListener('resize', onResize);
}

function buildParticles() {
  const M = reduced ? 700 : 1900;
  const pos = new Float32Array(M * 3), col = new Float32Array(M * 3);
  for (let i = 0; i < M; i++) {
    const r = 5 + Math.random() * 18;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th) * 0.75;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 2] = r * Math.cos(ph) - 4;
    const cc = Math.random() < 0.5 ? CY : VI;
    const f = 0.2 + Math.random() * 0.6;
    col[i * 3] = cc.r * f; col[i * 3 + 1] = cc.g * f; col[i * 3 + 2] = cc.b * f;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  particles = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(particles);
}

// ---- interaction -----------------------------------------------------------
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
let dragging = false, lastX = 0, dragVel = 0, manualRot = 0;

function bindInteraction() {
  window.addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / W - 0.5); mouse.ty = (e.clientY / H - 0.5);
    if (dragging) { dragVel = (e.clientX - lastX) * 0.007; manualRot += dragVel; lastX = e.clientX; }
  });
  canvas.style.pointerEvents = 'auto'; canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.style.cursor = 'grabbing'; });
  window.addEventListener('pointerup', () => { dragging = false; canvas.style.cursor = 'grab'; });
}

window.__hero = { /* reserved */ };

function onResize() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix();
  composer.setSize(W, H); bloom.setSize(W, H);
}

// ---- loop ------------------------------------------------------------------
let last = performance.now();
let auto = 0;
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05); last = now;

  const sy = window.scrollY || 0, vh = window.innerHeight || H;
  const heroP = Math.min(1, sy / (vh * 0.95));
  morphTarget = Math.min(1, sy / (vh * 1.55));          // morph completes ~1.5 screens in
  morph += (morphTarget - morph) * (reduced ? 1 : 0.06);

  // rebuild the ribbon only when the morph actually changed (cheap when idle)
  if (Math.abs(morph - lastBuilt) > 0.004) { buildRibbon(morph); lastBuilt = morph; }

  // rotation: gentle auto-orbit + inertial drag + scroll spin
  auto += dt * 0.16;
  manualRot += dragVel; dragVel *= 0.92;
  pivot.rotation.y = auto + manualRot + heroP * 1.2;
  pivot.rotation.x = Math.sin(auto * 0.5) * 0.14 - 0.04 + heroP * 0.25;

  // the sculpture drifts + shrinks slightly as you scroll into the content
  const driftX = heroP * 1.4;
  pivot.position.x += (driftX - pivot.position.x) * 0.05;
  const s = 1 - heroP * 0.18;
  pivot.scale.setScalar(s + (1 - s) * 0 + (0.96 + 0.04 * Math.sin(auto)) * 0); // base
  pivot.scale.setScalar(s);

  // lights breathe
  light1.intensity = 9 + Math.sin(auto * 1.3) * 2;
  light2.intensity = 8 + Math.cos(auto * 1.1) * 2;

  particles.rotation.y += dt * 0.014;
  particles.rotation.x = mouse.y * 0.06;

  // camera parallax + scroll dolly
  mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
  camera.position.x += (mouse.x * 1.6 - camera.position.x) * 0.04;
  camera.position.y += ((-mouse.y * 1.0 + 0.2) - camera.position.y) * 0.04;
  camera.position.z += ((8.2 + heroP * 2.2) - camera.position.z) * 0.04;
  camera.lookAt(pivot.position.x * 0.5, 0, 0);

  composer.render();
  window.__heroPainted = true;
}

try {
  if (reduced) {
    if (canvas) canvas.style.display = 'none';
    document.body.classList.add('reduced-motion-hero');
  } else {
    init();
    animate();
  }
}
catch (err) {
  console.warn('[hero] WebGL unavailable, static fallback', err);
  if (canvas) canvas.style.display = 'none';
  document.body.classList.add('no-webgl');
}
