// ============================================================================
// PENDULUM LAB — live hero instrument
// A physically integrated double pendulum, rendered as a chrome sculpture with
// cyan/violet trajectory memory, glitter dust, and an anchor glint — the same
// composition as the static hero artwork, but alive. The canvas is decorative,
// yet the motion is not arbitrary: both the visible pendulum and its nearby
// shadow trajectory advance through the shared RK4 kernel used by the mini lab.
// ============================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createRk4Work, rk4StepDouble } from './pendulum-demo-kernel.js';

const CYAN = new THREE.Color('#2fe0ff');
const VIOLET = new THREE.Color('#8f5bff');
const ICE = new THREE.Color('#dff8ff');
const canvas = document.getElementById('hero-canvas');
const query = new URLSearchParams(window.location.search);
const queryFlag = (name) => /^(?:1|true|yes)$/i.test(query.get(name) || '');
const captureMode = queryFlag('captureHero') || window.__PENDULUM_CAPTURE_HERO === true;
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedDataQuery = window.matchMedia('(prefers-reduced-data: reduce)');
const compactQuery = window.matchMedia('(max-width: 720px), (pointer: coarse)');
let reducedMotion = reducedMotionQuery.matches;
let reducedData = reducedDataQuery.matches || navigator.connection?.saveData === true;
let compact = compactQuery.matches;
const lowMemory = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 2;

if (!canvas) throw new Error('hero canvas is missing');
canvas.setAttribute('aria-hidden', 'true');

let renderer;
let scene;
let camera;
let composer;
let bloom;
let stage;
let particles;
let primary;
let shadow;
let firstTrail;
let secondTrail;
let shadowTrail;
let cyanDust;
let violetDust;
let glint;
let cyanLight;
let violetLight;
let width = window.innerWidth;
let height = window.innerHeight;
let running = false;
let visible = true;
let scrollActive = false;
let frameId = 0;
let lastFrame = performance.now();
let simulationAccumulator = 0;
let simulationTime = 0;
let trailTick = 0;
let trailsDirty = false;
let trailSyncElapsed = 0;
let stageBaseX = 0;
let stageBaseY = 0;
let stageBaseScale = 1;
let lastTelemetryAt = 0;
let coordinateActiveLastFrame = false;
let userPaused = window.__heroUserPaused === true;
let resizeFrame = 0;
let qualityTier = compact ? 'compact' : 'cinematic';
let renderCostEma = 0;
let renderSamples = 0;
let slowWindows = 0;
const coordinateReadout = document.querySelector('[data-descent-coordinate]');

const params = Object.freeze({ m1: 1, m2: 1, l1: 1.14, l2: 1.02, g: 9.81 });
const state = [2.34, 2.72, 0, 0];
const shadowState = [2.3408, 2.72, 0, 0];
const work = createRk4Work();
const shadowWork = createRk4Work();
const anchor = new THREE.Vector3(0, 1.55, 0);
const yAxis = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const midpoint = new THREE.Vector3();
const currentPoints = { first: new THREE.Vector3(), second: new THREE.Vector3() };
const nearbyPoints = { first: new THREE.Vector3(), second: new THREE.Vector3() };
const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
let dragging = false;
let dragStart = 0;
let manualRotation = 0;
let dragVelocity = 0;
let lastPaint = 0;
let regionObserver = null;
let lifecycleGeneration = 0;
let initializationPromise = null;
let cancelActivePrewarm = null;
let lifecyclePhase = 'idle';
let lifecycleUnavailable = false;
let contextLost = false;
let initialized = false;
let lifecycleListenersBound = false;
let interactionBound = false;
let interactionController = null;
let visibilityBound = false;
let disposed = false;

function publishHeroState(nextState) {
  window.dispatchEvent(new CustomEvent('pendulum:hero-state', { detail: { state: nextState } }));
}

function deterministicRandom(seed = 0x51f15e) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

// Soft round sprite shared by every additive point cloud — square GL points
// read as pixels; a radial falloff reads as light.
let glowTexture;
function makeGlowTexture() {
  if (glowTexture) return glowTexture;
  const size = 64;
  const surface = document.createElement('canvas');
  surface.width = size;
  surface.height = size;
  const ctx = surface.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.32, 'rgba(255,255,255,.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(surface);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

// Four-point star flare for the anchor mount — the artwork's signature glint.
function makeGlintTexture() {
  const size = 128;
  const surface = document.createElement('canvas');
  surface.width = size;
  surface.height = size;
  const ctx = surface.getContext('2d');
  const c = size / 2;
  const core = ctx.createRadialGradient(c, c, 0, c, c, c * 0.42);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.4, 'rgba(214,240,255,.55)');
  core.addColorStop(1, 'rgba(214,240,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  [[c, 4, 0], [4, c, Math.PI / 2]].forEach(([, , angle]) => {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(angle);
    const beam = ctx.createLinearGradient(-c, 0, c, 0);
    beam.addColorStop(0, 'rgba(190,230,255,0)');
    beam.addColorStop(0.5, 'rgba(240,250,255,.9)');
    beam.addColorStop(1, 'rgba(190,230,255,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(-c, -1.6, size, 3.2);
    ctx.restore();
  });
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createTrail(color, capacity, opacity) {
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const sprite = makeGlowTexture();
  const sparks = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: sprite,
      vertexColors: true,
      transparent: true,
      opacity: opacity * 0.6,
      size: compact ? 0.034 : 0.05,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  // Two wider passes over the same geometry wrap the line in the hazy neon
  // envelope of the reference artwork — no extra buffers, only draw calls.
  const halo = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: sprite,
      vertexColors: true,
      transparent: true,
      opacity: opacity * 0.24,
      size: compact ? 0.1 : 0.15,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const haze = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: sprite,
      vertexColors: true,
      transparent: true,
      opacity: opacity * 0.085,
      size: compact ? 0.26 : 0.4,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const ring = Array.from({ length: capacity }, () => new THREE.Vector3());
  let cursor = 0;
  let count = 0;

  return {
    line,
    sparks,
    halo,
    haze,
    push(point) {
      ring[cursor].copy(point);
      cursor = (cursor + 1) % capacity;
      count = Math.min(count + 1, capacity);
    },
    sync() {
      const start = (cursor - count + capacity) % capacity;
      for (let i = 0; i < count; i += 1) {
        const point = ring[(start + i) % capacity];
        const offset = i * 3;
        const fade = Math.pow((i + 1) / count, 1.65);
        positions[offset] = point.x;
        positions[offset + 1] = point.y;
        positions[offset + 2] = point.z;
        colors[offset] = color.r * fade;
        colors[offset + 1] = color.g * fade;
        colors[offset + 2] = color.b * fade;
      }
      geometry.setDrawRange(0, count);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
  };
}

// Glitter dust: a deterministic scatter of short-lived sparkles hugging each
// trajectory ribbon, like powdered light shaken off the moving bob.
function createDust(color, capacity, size, spread) {
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const energies = new Float32Array(capacity);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: makeGlowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      size,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const ring = Array.from({ length: capacity }, () => new THREE.Vector3());
  let cursor = 0;
  let count = 0;

  return {
    points,
    push(point, rng) {
      ring[cursor].set(
        point.x + (rng() - 0.5) * spread,
        point.y + (rng() - 0.5) * spread,
        point.z + (rng() - 0.5) * spread * 0.8,
      );
      energies[cursor] = 0.3 + rng() * 0.7;
      cursor = (cursor + 1) % capacity;
      count = Math.min(count + 1, capacity);
    },
    sync() {
      const start = (cursor - count + capacity) % capacity;
      for (let i = 0; i < count; i += 1) {
        const slot = (start + i) % capacity;
        const point = ring[slot];
        const offset = i * 3;
        const fade = Math.pow((i + 1) / count, 1.9) * energies[slot];
        positions[offset] = point.x;
        positions[offset + 1] = point.y;
        positions[offset + 2] = point.z;
        colors[offset] = color.r * fade;
        colors[offset + 1] = color.g * fade;
        colors[offset + 2] = color.b * fade;
      }
      geometry.setDrawRange(0, count);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
  };
}

const dustRandom = deterministicRandom(0x9e3779b9);

function createPendulum({ ghost = false } = {}) {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color: ghost ? 0x8970d9 : 0xd9e4f2,
    metalness: 1,
    roughness: ghost ? 0.24 : 0.12,
    transparent: ghost,
    opacity: ghost ? 0.18 : 1,
    emissive: ghost ? 0x422a8f : 0x0d1626,
    emissiveIntensity: ghost ? 0.38 : 0.1,
  });
  const firstMass = new THREE.MeshPhysicalMaterial({
    color: ghost ? 0x7b63cb : 0x53e4ff,
    metalness: 0.72,
    roughness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: ghost ? 0x392273 : 0x0a90b6,
    emissiveIntensity: ghost ? 0.35 : 0.95,
    transparent: ghost,
    opacity: ghost ? 0.16 : 1,
  });
  const secondMass = new THREE.MeshPhysicalMaterial({
    color: ghost ? 0x574696 : 0x9d6bff,
    metalness: 0.78,
    roughness: 0.09,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: 0x4c27b8,
    emissiveIntensity: ghost ? 0.24 : 0.88,
    transparent: ghost,
    opacity: ghost ? 0.14 : 1,
  });

  const rodGeometry = new THREE.CylinderGeometry(ghost ? 0.016 : 0.025, ghost ? 0.016 : 0.025, 1, 12);
  const ballGeometry = new THREE.SphereGeometry(ghost ? 0.085 : 0.13, compact ? 18 : 30, compact ? 12 : 22);
  const rod1 = new THREE.Mesh(rodGeometry, metal);
  const rod2 = new THREE.Mesh(rodGeometry, metal);
  const bob1 = new THREE.Mesh(ballGeometry, firstMass);
  const bob2 = new THREE.Mesh(ballGeometry, secondMass);
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(ghost ? 0.045 : 0.062, 18, 12), metal);
  group.add(rod1, rod2, bob1, bob2, elbow);
  return { group, rod1, rod2, bob1, bob2, elbow };
}

function setRod(mesh, from, to) {
  direction.copy(to).sub(from);
  const length = direction.length();
  midpoint.copy(from).addScaledVector(direction, 0.5);
  mesh.position.copy(midpoint);
  mesh.scale.set(1, length, 1);
  mesh.quaternion.setFromUnitVectors(yAxis, direction.normalize());
}

function pointsFromState(source, points) {
  const theta1 = source[0];
  const theta2 = source[1];
  points.first.set(
    anchor.x + params.l1 * Math.sin(theta1),
    anchor.y - params.l1 * Math.cos(theta1),
    0,
  );
  points.second.set(
    points.first.x + params.l2 * Math.sin(theta2),
    points.first.y - params.l2 * Math.cos(theta2),
    0,
  );
  return points;
}

function updatePendulum(model, points) {
  setRod(model.rod1, anchor, points.first);
  setRod(model.rod2, points.first, points.second);
  model.bob1.position.copy(points.first);
  model.bob2.position.copy(points.second);
  model.elbow.position.copy(points.first);
}

function buildAnchor() {
  const hub = new THREE.Group();
  const torusMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4e2f2,
    metalness: 1,
    roughness: 0.1,
    emissive: 0x16263f,
    emissiveIntensity: 0.3,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 14, 42), torusMaterial);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 24, 16),
    new THREE.MeshPhysicalMaterial({ color: 0xeaf7ff, metalness: 0.9, roughness: 0.08, clearcoat: 1 }),
  );
  hub.add(ring, core);
  hub.position.copy(anchor);

  glint = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlintTexture(),
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  glint.position.copy(anchor);
  glint.scale.set(0.92, 0.92, 1);
  stage.add(glint);
  return hub;
}

function buildGrid() {
  const grid = new THREE.GridHelper(9, 24, 0x14516e, 0x10243a);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.8;
  grid.material.transparent = true;
  grid.material.opacity = compact ? 0.08 : 0.13;
  grid.material.depthWrite = false;
  stage.add(grid);

  [1.15, 2.18].forEach((radius, index) => {
    const points = [];
    for (let i = 0; i <= 128; i += 1) {
      const angle = (i / 128) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, anchor.y + Math.sin(angle) * radius, -0.65));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const orbit = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: index === 0 ? CYAN : VIOLET,
        transparent: true,
        opacity: index === 0 ? 0.08 : 0.055,
        depthWrite: false,
      }),
    );
    stage.add(orbit);
  });

  // The artwork's wide dashed survey orbit, swept below the mount.
  const dashPoints = [];
  for (let i = 0; i <= 180; i += 1) {
    const angle = (i / 180) * Math.PI * 2;
    dashPoints.push(new THREE.Vector3(Math.cos(angle) * 2.95, anchor.y - 0.25 + Math.sin(angle) * 2.5, -0.72));
  }
  const dashed = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(dashPoints),
    new THREE.LineDashedMaterial({
      color: 0x9db8dc,
      transparent: true,
      opacity: compact ? 0.12 : 0.18,
      dashSize: 0.085,
      gapSize: 0.16,
      depthWrite: false,
    }),
  );
  dashed.computeLineDistances();
  dashed.rotation.z = 0.32;
  stage.add(dashed);
}

function buildParticles() {
  const random = deterministicRandom();
  const count = compact ? 620 : 1450;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const radius = 1.2 + Math.pow(random(), 0.68) * 6.4;
    const angle = random() * Math.PI * 2;
    const offset = i * 3;
    positions[offset] = Math.cos(angle) * radius + 0.8;
    positions[offset + 1] = Math.sin(angle) * radius * 0.7 + 0.2;
    positions[offset + 2] = (random() - 0.5) * 3.6 - 0.6;
    const color = random() > 0.46 ? CYAN : VIOLET;
    const energy = 0.16 + random() * 0.64;
    colors[offset] = color.r * energy;
    colors[offset + 1] = color.g * energy;
    colors[offset + 2] = color.b * energy;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  particles = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: makeGlowTexture(),
      size: compact ? 0.024 : 0.036,
      vertexColors: true,
      transparent: true,
      opacity: compact ? 0.5 : 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  stage.add(particles);
}

function pushCurrentTrail() {
  const current = pointsFromState(state, currentPoints);
  const nearby = pointsFromState(shadowState, nearbyPoints);
  firstTrail.push(current.first);
  secondTrail.push(current.second);
  shadowTrail.push(nearby.second);
  cyanDust.push(current.first, dustRandom);
  violetDust.push(current.second, dustRandom);
  violetDust.push(current.second, dustRandom);
  updatePendulum(primary, current);
  updatePendulum(shadow, nearby);
  trailsDirty = true;
}

function stepSimulation(fixedStep) {
  rk4StepDouble(state, params, fixedStep, work);
  rk4StepDouble(shadowState, params, fixedStep, shadowWork);
  simulationTime += fixedStep;
  trailTick += 1;
  if (trailTick % (compact ? 4 : 3) === 0) pushCurrentTrail();
}

function syncTrails() {
  firstTrail.sync();
  secondTrail.sync();
  shadowTrail.sync();
  cyanDust.sync();
  violetDust.sync();
  trailsDirty = false;
  trailSyncElapsed = 0;
}

function prewarm(generation) {
  const fixedStep = 1 / 240;
  // Land the deterministic capture on a legible, downward-opening pose while
  // retaining enough history to show the preceding chaotic loops.
  // 1,440 steps still fill the longest live trail while halving the number
  // of idle slices on busy devices. Capture mode keeps its exact art-directed
  // pose and history for deterministic screenshots.
  const steps = captureMode ? 3112 : 1440;
  if (captureMode) {
    if (generation !== lifecycleGeneration || contextLost || prefersStaticHero()) return Promise.resolve(false);
    for (let i = 0; i < steps; i += 1) stepSimulation(fixedStep);
    pushCurrentTrail();
    syncTrails();
    return Promise.resolve(generation === lifecycleGeneration && !contextLost && !prefersStaticHero());
  }

  // Warm the deterministic history in short idle slices to avoid a startup
  // long task on slower phones while preserving the exact same trajectory.
  return new Promise((resolve) => {
    let completed = 0;
    let settled = false;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      if (cancelActivePrewarm === cancel) cancelActivePrewarm = null;
      resolve(ready);
    };
    const cancel = () => finish(false);
    cancelActivePrewarm?.();
    cancelActivePrewarm = cancel;
    const schedule = (callback) => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(callback, { timeout: 48 });
      else window.setTimeout(() => callback(null), 0);
    };
    const chunk = (deadline) => {
      if (settled) return;
      if (generation !== lifecycleGeneration || contextLost || prefersStaticHero()) {
        finish(false);
        return;
      }
      const started = performance.now();
      do {
        const batchEnd = Math.min(completed + 64, steps);
        while (completed < batchEnd) {
          stepSimulation(fixedStep);
          completed += 1;
        }
      } while (
        completed < steps
        && performance.now() - started < 7
        && (!deadline || deadline.timeRemaining() > 1)
      );
      if (completed < steps) {
        schedule(chunk);
        return;
      }
      pushCurrentTrail();
      syncTrails();
      finish(generation === lifecycleGeneration && !contextLost && !prefersStaticHero());
    };
    schedule(chunk);
  });
}

function buildScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x02050d, 0.038);
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 80);
  camera.position.set(0, 0.12, 8.4);

  const contextAttributes = {
    alpha: true,
    antialias: !compact,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: captureMode,
    failIfMajorPerformanceCaveat: false,
  };
  const preventContextNoise = (event) => event.preventDefault();
  canvas.addEventListener('webglcontextcreationerror', preventContextNoise);
  let context = null;
  try {
    context = canvas.getContext('webgl2', contextAttributes);
  } catch {
    context = null;
  } finally {
    canvas.removeEventListener('webglcontextcreationerror', preventContextNoise);
  }
  if (!context) return false;

  renderer = new THREE.WebGLRenderer({
    canvas,
    context,
    alpha: true,
    antialias: !compact,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: captureMode,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1.2 : 1.55));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  // Chrome comes from analytic lights alone: an IBL/PMREM pass looked richer
  // but its per-load shader-compile burst blew the mobile TBT budget, so a
  // cool key light plus a violet rim stand in for the environment.
  scene.add(new THREE.HemisphereLight(0x5277a9, 0x02040b, 1.2));
  const keyLight = new THREE.DirectionalLight(0xd7e9ff, 3.0);
  keyLight.position.set(-3, 5, 5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x9d78ff, 1.4);
  rimLight.position.set(5.5, -2, -3.5);
  scene.add(rimLight);
  cyanLight = new THREE.PointLight(CYAN, 18, 8, 2);
  cyanLight.position.set(1.4, 1.2, 2.2);
  scene.add(cyanLight);
  violetLight = new THREE.PointLight(VIOLET, 17, 8, 2);
  violetLight.position.set(3.2, -1.3, 1.6);
  scene.add(violetLight);

  stage = new THREE.Group();
  scene.add(stage);
  buildGrid();
  buildParticles();

  firstTrail = createTrail(CYAN, compact ? 190 : 340, 0.82);
  secondTrail = createTrail(VIOLET, compact ? 260 : 520, 0.94);
  shadowTrail = createTrail(ICE, compact ? 170 : 300, 0.3);
  [firstTrail, secondTrail, shadowTrail].forEach((trail) => {
    stage.add(trail.line, trail.sparks, trail.halo, trail.haze);
  });
  cyanDust = createDust(CYAN, compact ? 200 : 380, compact ? 0.05 : 0.062, 0.15);
  violetDust = createDust(VIOLET, compact ? 340 : 700, compact ? 0.05 : 0.066, 0.19);
  stage.add(cyanDust.points, violetDust.points);

  primary = createPendulum();
  shadow = createPendulum({ ghost: true });
  shadow.group.position.z = -0.055;
  stage.add(shadow.group, primary.group, buildAnchor());
  positionStage();

  if (!compact) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 1.0, 0.58, 0.085);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    initialized = false;
    invalidateHeroInitialization('context-lost');
    delete window.__hero;
    stop();
    document.body.classList.remove('hero-live');
    document.body.classList.add('no-webgl');
    document.body.dataset.heroFallback = 'context-lost';
    canvas.style.display = 'none';
    window.__heroPainted = true;
    publishHeroState('static');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    lifecyclePhase = 'idle';
    document.body.classList.remove('no-webgl');
    delete document.body.dataset.heroFallback;
    canvas.style.display = '';
    publishHeroState('loading');
    void ensureHero();
  });
  return true;
}

function positionStage() {
  const narrow = width < 760;
  const short = height < 680;
  stageBaseX = narrow ? 0.18 : 2.3;
  stageBaseY = narrow ? -1.1 : short ? -0.12 : 0.05;
  stageBaseScale = narrow ? Math.min(0.76, width / 510) : short ? 0.94 : 1.18;
  stage.position.set(stageBaseX, stageBaseY, 0);
  stage.scale.setScalar(stageBaseScale);
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  compact = compactQuery.matches;
  const qualityCap = qualityTier === 'balanced' ? 1.15 : compact ? 1.2 : 1.55;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, qualityCap);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (composer) {
    composer.setPixelRatio?.(pixelRatio);
    composer.setSize(width, height);
  }
  if (bloom) bloom.setSize(width, height);
  positionStage();
}

function scheduleResize() {
  if (resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    if (renderer) resize();
  });
}

function bindInteraction() {
  if (interactionBound) return;
  interactionBound = true;
  interactionController = new AbortController();
  const { signal } = interactionController;
  window.addEventListener('pointermove', (event) => {
    pointer.targetX = event.clientX / width - 0.5;
    pointer.targetY = event.clientY / height - 0.5;
    if (dragging) {
      const delta = event.clientX - dragStart;
      dragVelocity = delta * 0.0018;
      manualRotation += dragVelocity;
      dragStart = event.clientX;
    }
  }, { passive: true, signal });
  window.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !document.body.classList.contains('hero-live')) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.hero, #orbit-descent')) return;
    if (
      target.isContentEditable
      || target.closest('a, button, input, select, textarea, label, summary, [role="button"], [contenteditable]:not([contenteditable="false"])')
    ) return;
    event.preventDefault();
    dragging = true;
    dragStart = event.clientX;
    canvas.classList.add('is-dragging');
  }, { capture: true, signal });
  const finishDrag = () => {
    dragging = false;
    canvas.classList.remove('is-dragging');
    if (Math.abs(manualRotation) > Math.PI * 20) {
      manualRotation %= Math.PI * 2;
    }
  };
  window.addEventListener('pointerup', finishDrag, { passive: true, signal });
  window.addEventListener('pointercancel', finishDrag, { passive: true, signal });
  window.addEventListener('blur', finishDrag, { signal });
  window.addEventListener('resize', scheduleResize, { passive: true, signal });
  window.visualViewport?.addEventListener('resize', scheduleResize, { passive: true, signal });
}

function advance(elapsed) {
  const fixedStep = 1 / 240;
  simulationAccumulator += Math.min(elapsed, 0.05) * 0.86;
  let safety = 0;
  while (simulationAccumulator >= fixedStep && safety < 16) {
    stepSimulation(fixedStep);
    simulationAccumulator -= fixedStep;
    safety += 1;
  }
  const current = pointsFromState(state, currentPoints);
  const nearby = pointsFromState(shadowState, nearbyPoints);
  updatePendulum(primary, current);
  updatePendulum(shadow, nearby);
  trailSyncElapsed += elapsed;
  if (trailsDirty && trailSyncElapsed >= (compact ? 1 / 22 : 1 / 30)) syncTrails();
}

function renderFrame({ frozen = false } = {}) {
  const now = performance.now();
  const elapsed = frozen ? 0 : Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  if (!frozen) advance(elapsed);

  pointer.x += (pointer.targetX - pointer.x) * 0.055;
  pointer.y += (pointer.targetY - pointer.y) * 0.055;
  dragVelocity *= Math.exp(-elapsed * 5.7);
  manualRotation += dragVelocity;

  const heroProgress = Math.min(1, (window.scrollY || 0) / Math.max(height, 1));
  const orbitProgress = Math.max(0, Math.min(1, Number(window.__orbitScrollProgress) || 0));
  const orbitEase = orbitProgress * orbitProgress * (3 - 2 * orbitProgress);
  const scrollVelocity = Math.max(-1, Math.min(1, Number(window.__orbitScrollVelocity) || 0));
  window.__orbitScrollVelocity = scrollVelocity * Math.exp(-elapsed * 9.1);
  stage.rotation.y = manualRotation + pointer.x * 0.16 + Math.sin(simulationTime * 0.13) * 0.035
    + orbitEase * Math.PI * 4.5 + scrollVelocity * 0.24;
  stage.rotation.x = -0.035 + pointer.y * 0.055 + heroProgress * 0.035
    + Math.sin(orbitEase * Math.PI * 1.65) * 0.38;
  stage.rotation.z = Math.sin(orbitEase * Math.PI * 2) * 0.14 - orbitEase * 0.06 + scrollVelocity * 0.04;
  stage.position.x = stageBaseX + Math.sin(orbitEase * Math.PI * 2.2) * (compact ? 0.22 : 0.86);
  stage.position.y = stageBaseY - orbitEase * (compact ? 1.08 : 1.86);
  stage.position.z = Math.sin(orbitEase * Math.PI) * 0.7 - orbitEase * 0.28;
  stage.scale.setScalar(stageBaseScale * (1 + Math.sin(orbitEase * Math.PI) * 0.12 - orbitEase * 0.2));
  particles.rotation.z += elapsed * 0.006;
  particles.rotation.y = orbitEase * Math.PI * 0.38;
  particles.rotation.x = Math.sin(orbitEase * Math.PI * 2) * 0.08;
  cyanLight.intensity = 17 + Math.sin(simulationTime * 0.7) * 2.4;
  violetLight.intensity = 16 + Math.cos(simulationTime * 0.61) * 2.2;
  cyanLight.position.x = 1.4 + Math.sin(orbitEase * Math.PI * 2) * 1.2;
  cyanLight.position.z = 2.2 + Math.cos(orbitEase * Math.PI * 2) * 0.8;
  violetLight.position.x = 3.2 - Math.cos(orbitEase * Math.PI * 2) * 1.1;
  violetLight.position.z = 1.6 + Math.sin(orbitEase * Math.PI * 2) * 0.9;
  if (glint) {
    glint.material.opacity = 0.74 + Math.sin(simulationTime * 1.7) * 0.14;
    const glintScale = 0.86 + Math.sin(simulationTime * 1.21) * 0.07;
    glint.scale.set(glintScale, glintScale, 1);
  }
  const targetCameraX = pointer.x * 0.5 + Math.sin(orbitEase * Math.PI * 2) * (compact ? 0.18 : 0.7);
  const targetCameraY = 0.12 - pointer.y * 0.28 - orbitEase * 0.24;
  const targetCameraZ = 8.4 - Math.sin(orbitEase * Math.PI) * 1.38 + orbitEase * 0.74;
  camera.position.x += (targetCameraX - camera.position.x) * 0.035;
  camera.position.y += (targetCameraY - camera.position.y) * 0.035;
  camera.position.z += (targetCameraZ - camera.position.z) * 0.035;
  camera.lookAt(
    (width < 760 ? 0 : 1.3) + Math.sin(orbitEase * Math.PI) * 0.28,
    (width < 760 ? -0.4 : 0.05) - orbitEase * 0.42,
    0,
  );
  camera.rotation.z += (Math.sin(orbitEase * Math.PI * 2) * 0.035 - camera.rotation.z) * 0.04;

  const coordinateActive = document.body.classList.contains('orbit-descent-active');
  if (coordinateReadout && coordinateActive && (!coordinateActiveLastFrame || now - lastTelemetryAt >= 180)) {
    const wrapAngle = (value) => ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    coordinateReadout.textContent = `${wrapAngle(state[0]).toFixed(2)} / ${wrapAngle(state[1]).toFixed(2)}`;
    lastTelemetryAt = now;
  }
  coordinateActiveLastFrame = coordinateActive;

  const renderStarted = performance.now();
  if (composer && !compact && qualityTier === 'cinematic') composer.render();
  else renderer.render(scene, camera);
  if (!captureMode && !compact && qualityTier === 'cinematic') {
    const renderCost = performance.now() - renderStarted;
    renderCostEma = renderSamples ? renderCostEma * 0.94 + renderCost * 0.06 : renderCost;
    renderSamples += 1;
    if (renderSamples >= 90) {
      slowWindows = renderCostEma > 18 ? slowWindows + 1 : Math.max(0, slowWindows - 1);
      renderSamples = 0;
      if (slowWindows >= 2) {
        qualityTier = 'balanced';
        document.body.dataset.heroQuality = qualityTier;
        resize();
      }
    }
  }
  window.__heroPainted = true;
  document.body.classList.add('hero-live');
}

function loop(timestamp) {
  if (!running) return;
  frameId = requestAnimationFrame(loop);
  if (compact && timestamp - lastPaint < 1000 / 30) return;
  lastPaint = timestamp;
  renderFrame();
}

function start() {
  if (running || captureMode) return;
  running = true;
  lastFrame = performance.now();
  lastPaint = 0;
  frameId = requestAnimationFrame(loop);
}

function stop() {
  running = false;
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
}

function disposeHero() {
  if (disposed) return;
  disposed = true;
  lifecycleUnavailable = true;
  invalidateHeroInitialization('static');
  stop();
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  resizeFrame = 0;
  interactionController?.abort();
  interactionController = null;
  interactionBound = false;
  dragging = false;
  canvas.classList.remove('is-dragging');
  regionObserver?.disconnect();
  regionObserver = null;

  scene?.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value?.isTexture) value.dispose();
      });
      material.dispose?.();
    });
  });
  composer?.dispose?.();
  renderer?.renderLists?.dispose?.();
  renderer?.dispose?.();
  renderer?.forceContextLoss?.();
  initialized = false;
  delete window.__hero;
}

function syncPlayback() {
  if (!contextLost && (visible || scrollActive) && !document.hidden && !prefersStaticHero() && !userPaused) start();
  else stop();
}

function readMediaPreferences() {
  reducedMotion = reducedMotionQuery.matches;
  reducedData = reducedDataQuery.matches || navigator.connection?.saveData === true;
  compact = compactQuery.matches;
}

function prefersStaticHero() {
  return !captureMode && (reducedMotion || reducedData || lowMemory);
}

function applyPreferenceClasses() {
  const fallback = prefersStaticHero();
  document.body.classList.toggle('reduced-motion-hero', fallback && reducedMotion);
  document.body.classList.toggle('low-power-hero', fallback && !reducedMotion);
}

function invalidateHeroInitialization(nextPhase = 'idle') {
  lifecycleGeneration += 1;
  lifecyclePhase = nextPhase;
  const cancel = cancelActivePrewarm;
  cancelActivePrewarm = null;
  cancel?.();
}

function showStaticHero() {
  canvas.style.display = 'none';
  document.body.classList.remove('hero-live');
  stop();
  window.__heroPainted = true;
  lifecyclePhase = contextLost ? 'context-lost' : lifecycleUnavailable ? 'unavailable' : 'static';
  publishHeroState('static');
}

function syncMediaPreferences() {
  readMediaPreferences();
  applyPreferenceClasses();
  const fallback = prefersStaticHero();
  canvas.style.display = fallback ? 'none' : '';
  if (fallback) {
    if (!initialized && lifecyclePhase !== 'static') invalidateHeroInitialization('static');
    showStaticHero();
    return;
  }
  if (contextLost || lifecycleUnavailable) {
    showStaticHero();
    return;
  }
  if (!initialized || !renderer) {
    void ensureHero();
    return;
  }
  resize();
  renderFrame({ frozen: true });
  syncPlayback();
  lifecyclePhase = userPaused ? 'paused' : 'live';
  publishHeroState(userPaused ? 'paused' : 'live');
}

function bindLifecycleListeners() {
  if (lifecycleListenersBound) return;
  lifecycleListenersBound = true;
  [reducedMotionQuery, reducedDataQuery, compactQuery].forEach((media) => {
    media.addEventListener?.('change', syncMediaPreferences);
  });
  navigator.connection?.addEventListener?.('change', syncMediaPreferences);
}

function bindVisibilityLifecycle() {
  if (visibilityBound) return;
  visibilityBound = true;
  const hero = document.querySelector('.hero');
  const descent = document.querySelector('#orbit-descent');
  if (!captureMode && hero && 'IntersectionObserver' in window) {
    visible = false;
    const visibleRegions = new Set();
    regionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visibleRegions.add(entry.target);
        else visibleRegions.delete(entry.target);
      });
      visible = visibleRegions.size > 0;
      syncPlayback();
    }, { rootMargin: compact ? '28% 0px 22% 0px' : '60% 0px 32% 0px' });
    regionObserver.observe(hero);
    if (descent) regionObserver.observe(descent);
  }
  document.addEventListener('visibilitychange', syncPlayback);
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) stop();
    else disposeHero();
  });
  window.addEventListener('pageshow', () => {
    if (initialized) syncPlayback();
    else void ensureHero();
  });
}

function installHeroApi() {
  window.__hero = {
    pause: stop,
    resume() { syncPlayback(); },
    dispose: disposeHero,
    setUserPaused(nextPaused) {
      userPaused = Boolean(nextPaused);
      window.__heroUserPaused = userPaused;
      syncPlayback();
      lifecyclePhase = userPaused ? 'paused' : 'live';
      publishHeroState(userPaused ? 'paused' : 'live');
    },
    get running() { return running; },
    get dragging() { return dragging; },
    get quality() { return qualityTier; },
    setScrollActive(nextActive) {
      scrollActive = Boolean(nextActive);
      if (!scrollActive) coordinateActiveLastFrame = false;
      if (!initialized || contextLost || lifecycleUnavailable || prefersStaticHero()) return false;
      syncPlayback();
      if (!running) renderFrame({ frozen: true });
      return true;
    },
    get scrollPose() {
      return {
        progress: Math.max(0, Math.min(1, Number(window.__orbitScrollProgress) || 0)),
        rotationY: stage.rotation.y,
        y: stage.position.y,
        z: stage.position.z,
        scale: stage.scale.x,
      };
    },
    get divergence() {
      const d1 = Math.atan2(Math.sin(state[0] - shadowState[0]), Math.cos(state[0] - shadowState[0]));
      const d2 = Math.atan2(Math.sin(state[1] - shadowState[1]), Math.cos(state[1] - shadowState[1]));
      return Math.hypot(d1, d2);
    },
  };
}

function failInitialization(reason = 'renderer-initialization') {
  lifecycleUnavailable = true;
  initialized = false;
  invalidateHeroInitialization('unavailable');
  delete window.__hero;
  stop();
  regionObserver?.disconnect();
  canvas.style.display = 'none';
  document.body.classList.remove('hero-live');
  document.body.classList.add('no-webgl');
  document.body.dataset.heroFallback = reason;
  window.__heroPainted = true;
  publishHeroState('static');
  return false;
}

async function initializeHero(generation) {
  try {
    readMediaPreferences();
    applyPreferenceClasses();
    if (generation !== lifecycleGeneration) return false;
    if (prefersStaticHero()) {
      showStaticHero();
      return false;
    }
    if (contextLost || lifecycleUnavailable) {
      showStaticHero();
      return false;
    }
    lifecyclePhase = 'initializing';
    publishHeroState('loading');
    if (!renderer && !buildScene()) {
      return failInitialization('webgl2-unavailable');
    }
    bindInteraction();
    lifecyclePhase = 'prewarming';
    const warmed = await prewarm(generation);
    // Preferences can change while the idle-sliced history is warming. Always
    // sample them again before the first frame or public live API is exposed.
    readMediaPreferences();
    applyPreferenceClasses();
    if (!warmed || generation !== lifecycleGeneration || contextLost || prefersStaticHero()) {
      if (prefersStaticHero()) showStaticHero();
      return false;
    }
    renderFrame({ frozen: true });
    if (generation !== lifecycleGeneration || contextLost || prefersStaticHero()) return false;
    bindVisibilityLifecycle();
    initialized = true;
    installHeroApi();
    if (!captureMode) syncPlayback();
    lifecyclePhase = userPaused ? 'paused' : 'live';
    publishHeroState(userPaused ? 'paused' : 'live');
    return true;
  } catch {
    return failInitialization();
  }
}

function ensureHero() {
  bindLifecycleListeners();
  readMediaPreferences();
  applyPreferenceClasses();
  if (prefersStaticHero()) {
    if (!initialized && lifecyclePhase !== 'static') invalidateHeroInitialization('static');
    showStaticHero();
    return Promise.resolve(false);
  }
  if (contextLost || lifecycleUnavailable) {
    showStaticHero();
    return Promise.resolve(false);
  }
  if (initialized && renderer) {
    canvas.style.display = '';
    resize();
    renderFrame({ frozen: true });
    syncPlayback();
    lifecyclePhase = userPaused ? 'paused' : 'live';
    publishHeroState(userPaused ? 'paused' : 'live');
    return Promise.resolve(true);
  }
  if (initializationPromise) {
    return initializationPromise.then((ready) => {
      readMediaPreferences();
      if (!ready && !initialized && !contextLost && !lifecycleUnavailable && !prefersStaticHero()) {
        return ensureHero();
      }
      return Boolean(ready || initialized);
    });
  }

  const generation = ++lifecycleGeneration;
  let trackedInitialization;
  trackedInitialization = initializeHero(generation).finally(() => {
    if (initializationPromise === trackedInitialization) initializationPromise = null;
  });
  initializationPromise = trackedInitialization;
  return trackedInitialization;
}

window.__heroLifecycle = {
  ensure: ensureHero,
  dispose: disposeHero,
  get phase() { return lifecyclePhase; },
  get generation() { return lifecycleGeneration; },
  get contextLost() { return contextLost; },
  get unavailable() { return lifecycleUnavailable; },
};

// Bind preference/data listeners before the first prewarm begins. The module is
// evaluated once, but `ensure()` remains reusable after any static early return.
bindLifecycleListeners();
void ensureHero();
