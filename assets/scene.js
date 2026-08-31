// ============================================================================
// PENDULUM LAB — live hero instrument
// A constrained double-spherical pendulum, rendered as a restrained scientific
// instrument with teal/amber trajectory memory. Both links
// evolve as 3D Cartesian positions and velocities under gravity; RK4 advances
// the system at 240 Hz and a mass-weighted projection keeps both rod lengths
// fixed. Camera orbit is presentation-only and never feeds back into physics.
// ============================================================================
import * as THREE from 'three';
import {
  HERO_FIXED_STEP,
  HERO_INITIAL_CONDITIONS,
  HERO_P1 as P1,
  HERO_P2 as P2,
  HERO_SHADOW_INITIAL_CONDITIONS,
  HERO_V1 as V1,
  HERO_V2 as V2,
  createHeroNumericalTracker,
  createHeroSpatialState,
  createHeroSpatialWork,
  heroSpatialDiagnostics,
  stepHeroSpatialState,
} from './hero-physics-kernel.js';

const TEAL = new THREE.Color('#75b8c7');
const AMBER = new THREE.Color('#d2a968');
const ICE = new THREE.Color('#c8d6e6');
const SCROLL_ORBIT_RADIANS = THREE.MathUtils.degToRad(120);
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
canvas.tabIndex = -1;

let renderer;
let scene;
let camera;
let stage;
let primary;
let shadow;
let firstTrail;
let secondTrail;
let shadowTrail;
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
let cameraOrbitAzimuth = 0;
let cameraOrbitElevation = 0;
let userPaused = window.__heroUserPaused === true;
let resizeFrame = 0;
let qualityTier = compact ? 'compact' : 'cinematic';
let renderCostEma = 0;
let renderSamples = 0;
let slowWindows = 0;
const coordinateReadout = document.querySelector('[data-descent-coordinate]');
const viewReadout = document.querySelector('[data-descent-view]');
const viewReset = document.querySelector('[data-hero-view-reset]');

const params = Object.freeze({ m1: 1, m2: 1, l1: 1.14, l2: 1.02, g: 9.81 });
const anchor = new THREE.Vector3(0, 1.55, 0);
const yAxis = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const midpoint = new THREE.Vector3();
const cameraGoal = new THREE.Vector3();
const cameraFocus = new THREE.Vector3();
const cameraFocusGoal = new THREE.Vector3();
const currentPoints = {
  first: new THREE.Vector3(),
  second: new THREE.Vector3(),
  azimuth1: 0,
  azimuth2: 0,
  theta1: 0,
  theta2: 0,
};
const nearbyPoints = {
  first: new THREE.Vector3(),
  second: new THREE.Vector3(),
  azimuth1: 0,
  azimuth2: 0,
  theta1: 0,
  theta2: 0,
};
const state = createHeroSpatialState(HERO_INITIAL_CONDITIONS, params);
const shadowState = createHeroSpatialState(HERO_SHADOW_INITIAL_CONDITIONS, params);
const work = createHeroSpatialWork();
const shadowWork = createHeroSpatialWork();
const numericalTracker = createHeroNumericalTracker(state, params);
const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
let dragging = false;
let dragStart = 0;
let manualRotation = 0;
let manualElevation = 0;
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
let canvasInteractive = false;
let interactionController = null;
let visibilityBound = false;
let disposed = false;

function publishHeroState(nextState) {
  window.dispatchEvent(new CustomEvent('pendulum:hero-state', { detail: { state: nextState } }));
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
      depthWrite: false,
    }),
  );
  const ring = Array.from({ length: capacity }, () => new THREE.Vector3());
  let cursor = 0;
  let count = 0;

  return {
    line,
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

function createPendulum({ ghost = false } = {}) {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color: ghost ? 0x778097 : 0xb8c4d2,
    metalness: 0.68,
    roughness: ghost ? 0.52 : 0.4,
    transparent: ghost,
    opacity: ghost ? 0.1 : 1,
    emissive: 0x080b12,
    emissiveIntensity: ghost ? 0.02 : 0.04,
  });
  const firstMass = new THREE.MeshStandardMaterial({
    color: ghost ? 0x71868e : 0x75b8c7,
    metalness: 0.56,
    roughness: 0.5,
    emissive: ghost ? 0x11181c : 0x0c1c20,
    emissiveIntensity: ghost ? 0.02 : 0.04,
    transparent: ghost,
    opacity: ghost ? 0.09 : 1,
  });
  const secondMass = new THREE.MeshStandardMaterial({
    color: ghost ? 0x8f8068 : 0xd2a968,
    metalness: 0.56,
    roughness: 0.5,
    emissive: ghost ? 0x18150f : 0x211a0e,
    emissiveIntensity: ghost ? 0.02 : 0.04,
    transparent: ghost,
    opacity: ghost ? 0.08 : 1,
  });

  const rodGeometry = new THREE.CylinderGeometry(ghost ? 0.011 : 0.018, ghost ? 0.011 : 0.018, 1, 12);
  const ballGeometry = new THREE.SphereGeometry(ghost ? 0.07 : 0.105, compact ? 16 : 24, compact ? 10 : 16);
  const rod1 = new THREE.Mesh(rodGeometry, metal);
  const rod2 = new THREE.Mesh(rodGeometry, metal);
  const bob1 = new THREE.Mesh(ballGeometry, firstMass);
  const bob2 = new THREE.Mesh(ballGeometry, secondMass);
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(ghost ? 0.032 : 0.048, 16, 10), metal);
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
  const firstX = source[P1];
  const firstY = source[P1 + 1];
  const firstZ = source[P1 + 2];
  const secondLinkX = source[P2] - firstX;
  const secondLinkY = source[P2 + 1] - firstY;
  const secondLinkZ = source[P2 + 2] - firstZ;
  points.azimuth1 = Math.atan2(firstZ, firstX);
  points.azimuth2 = Math.atan2(secondLinkZ, secondLinkX);
  points.theta1 = Math.acos(THREE.MathUtils.clamp(-firstY / params.l1, -1, 1));
  points.theta2 = Math.acos(THREE.MathUtils.clamp(-secondLinkY / params.l2, -1, 1));
  points.first.set(
    anchor.x + firstX,
    anchor.y + firstY,
    anchor.z + firstZ,
  );
  points.second.set(
    anchor.x + source[P2],
    anchor.y + source[P2 + 1],
    anchor.z + source[P2 + 2],
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
    color: 0x91a0b2,
    metalness: 0.62,
    roughness: 0.48,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 10, 32), torusMaterial);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.052, 18, 12),
    new THREE.MeshStandardMaterial({ color: 0xb9c5d2, metalness: 0.58, roughness: 0.52 }),
  );
  hub.add(ring, core);
  hub.position.copy(anchor);
  return hub;
}

function pushCurrentTrail() {
  const current = pointsFromState(state, currentPoints);
  const nearby = pointsFromState(shadowState, nearbyPoints);
  firstTrail.push(current.first);
  secondTrail.push(current.second);
  shadowTrail.push(nearby.second);
  updatePendulum(primary, current);
  updatePendulum(shadow, nearby);
  trailsDirty = true;
}

function stepSimulation(fixedStep) {
  stepHeroSpatialState(state, fixedStep, work, params);
  stepHeroSpatialState(shadowState, fixedStep, shadowWork, params);
  simulationTime += fixedStep;
  trailTick += 1;
  numericalTracker.observe(state, trailTick);
  if (trailTick % (compact ? 4 : 3) === 0) pushCurrentTrail();
}

function syncTrails() {
  firstTrail.sync();
  secondTrail.sync();
  shadowTrail.sync();
  trailsDirty = false;
  trailSyncElapsed = 0;
}

function prewarm(generation) {
  const fixedStep = HERO_FIXED_STEP;
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
  renderer.toneMappingExposure = 0.98;

  // Fixed analytic lights keep the instrument legible without bloom or
  // scroll-driven light choreography.
  scene.add(new THREE.HemisphereLight(0x66737d, 0x05070a, 0.58));
  const keyLight = new THREE.DirectionalLight(0xe7ebed, 1.7);
  keyLight.position.set(-3, 5, 5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x8aa0a8, 0.34);
  rimLight.position.set(5.5, -2, -3.5);
  scene.add(rimLight);
  const tealLight = new THREE.PointLight(TEAL, 0.7, 7, 2);
  tealLight.position.set(1.4, 1.2, 2.2);
  scene.add(tealLight);
  const amberLight = new THREE.PointLight(AMBER, 0.6, 7, 2);
  amberLight.position.set(3.2, -1.3, 1.6);
  scene.add(amberLight);

  stage = new THREE.Group();
  scene.add(stage);

  firstTrail = createTrail(TEAL, compact ? 150 : 240, 0.42);
  secondTrail = createTrail(AMBER, compact ? 190 : 300, 0.46);
  shadowTrail = createTrail(ICE, compact ? 120 : 190, 0.16);
  [firstTrail, secondTrail, shadowTrail].forEach((trail) => {
    stage.add(trail.line);
  });

  primary = createPendulum();
  shadow = createPendulum({ ghost: true });
  stage.add(shadow.group, primary.group, buildAnchor());
  positionStage();

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
    setCanvasInteractive(false);
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
  canvas.addEventListener('keydown', (event) => {
    if (!document.body.classList.contains('hero-live')) return;
    const azimuthStep = THREE.MathUtils.degToRad(event.shiftKey ? 15 : 5);
    const elevationStep = THREE.MathUtils.degToRad(event.shiftKey ? 10 : 4);
    if (event.key === 'ArrowLeft') manualRotation -= azimuthStep;
    else if (event.key === 'ArrowRight') manualRotation += azimuthStep;
    else if (event.key === 'ArrowUp') {
      manualElevation = THREE.MathUtils.clamp(manualElevation + elevationStep, -0.38, 0.38);
    } else if (event.key === 'ArrowDown') {
      manualElevation = THREE.MathUtils.clamp(manualElevation - elevationStep, -0.38, 0.38);
    } else if (event.key === 'Home') {
      resetView();
    } else return;
    event.preventDefault();
    if (!running && initialized) renderFrame({ frozen: true });
  }, { signal });
  viewReset?.addEventListener('click', () => {
    resetView();
    if (!running && initialized) renderFrame({ frozen: true });
  }, { signal });
  window.addEventListener('resize', scheduleResize, { passive: true, signal });
  window.visualViewport?.addEventListener('resize', scheduleResize, { passive: true, signal });
}

function advance(elapsed) {
  const fixedStep = HERO_FIXED_STEP;
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

  const orbitProgress = Math.max(0, Math.min(1, Number(window.__orbitScrollProgress) || 0));
  const orbitEase = orbitProgress * orbitProgress * (3 - 2 * orbitProgress);
  const targetCameraAzimuth = manualRotation + pointer.x * 0.12
    + orbitEase * SCROLL_ORBIT_RADIANS;
  const targetCameraElevation = 0.025 + manualElevation - pointer.y * 0.08
    + Math.sin(orbitEase * Math.PI) * 0.045;
  const orbitBlend = frozen ? 1 : 1 - Math.exp(-elapsed * 5.2);
  cameraOrbitAzimuth += (targetCameraAzimuth - cameraOrbitAzimuth) * orbitBlend;
  cameraOrbitElevation += (targetCameraElevation - cameraOrbitElevation) * orbitBlend;

  // Scroll changes the viewpoint by a measured 120° arc. The instrument
  // remains level and fixed lights keep it reading like lab hardware.
  stage.rotation.y = Math.sin(simulationTime * 0.13) * 0.01;
  stage.rotation.x = -0.02 + pointer.y * 0.015;
  stage.rotation.z = 0;
  stage.position.x = stageBaseX + Math.sin(orbitEase * Math.PI) * (compact ? 0.08 : 0.22);
  stage.position.y = stageBaseY - orbitEase * (compact ? 0.38 : 0.68);
  stage.position.z = -orbitEase * (compact ? 0.04 : 0.12);
  stage.scale.setScalar(stageBaseScale * (1 - orbitEase * 0.06));
  const radius = 8.4 - orbitEase * 0.28;
  const horizontalRadius = radius * Math.cos(cameraOrbitElevation);
  const heroCompositionOffset = compact ? 0.12 : (1 - orbitEase) * 1.02;
  cameraFocusGoal.set(
    stage.position.x - heroCompositionOffset,
    stage.position.y + (compact ? -0.05 : 0.12),
    stage.position.z,
  );
  cameraGoal.set(
    cameraFocusGoal.x + Math.sin(cameraOrbitAzimuth) * horizontalRadius,
    cameraFocusGoal.y + Math.sin(cameraOrbitElevation) * radius,
    cameraFocusGoal.z + Math.cos(cameraOrbitAzimuth) * horizontalRadius,
  );
  const cameraBlend = frozen ? 1 : 1 - Math.exp(-elapsed * 4.8);
  const focusBlend = frozen ? 1 : 1 - Math.exp(-elapsed * 6.2);
  camera.position.lerp(cameraGoal, cameraBlend);
  cameraFocus.lerp(cameraFocusGoal, focusBlend);
  camera.up.set(0, 1, 0);
  camera.lookAt(cameraFocus);

  const coordinateActive = document.body.classList.contains('orbit-descent-active');
  if (coordinateReadout && coordinateActive && (!coordinateActiveLastFrame || now - lastTelemetryAt >= 180)) {
    const wrapAngle = (value) => ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    coordinateReadout.textContent = `${wrapAngle(currentPoints.theta1).toFixed(2)} / ${wrapAngle(currentPoints.theta2).toFixed(2)}`;
    if (viewReadout) {
      const bearing = ((THREE.MathUtils.radToDeg(cameraOrbitAzimuth) % 360) + 360) % 360;
      const elevation = THREE.MathUtils.radToDeg(cameraOrbitElevation);
      const elevationLabel = `${elevation >= 0 ? '+' : '-'}${Math.abs(elevation).toFixed(0).padStart(2, '0')}°`;
      viewReadout.textContent = `${bearing.toFixed(0).padStart(3, '0')}° / e ${elevationLabel} / z ${currentPoints.second.z.toFixed(2)}`;
    }
    lastTelemetryAt = now;
  }
  coordinateActiveLastFrame = coordinateActive;

  const renderStarted = performance.now();
  renderer.render(scene, camera);
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
  setCanvasInteractive(true);
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

function setCanvasInteractive(active) {
  if (canvasInteractive === active) return;
  canvasInteractive = active;
  if (viewReset instanceof HTMLButtonElement) {
    viewReset.hidden = !active;
    viewReset.disabled = !active;
  }
  if (active) {
    canvas.removeAttribute('aria-hidden');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute(
      'aria-label',
      document.documentElement.lang === 'ko'
        ? '실시간 3D 이중 진자. 화살표 키로 시점을 회전하고 Home 키로 초기화합니다.'
        : 'Live 3D double pendulum. Use arrow keys to orbit the view and Home to reset it.',
    );
    canvas.tabIndex = 0;
    return;
  }
  canvas.setAttribute('aria-hidden', 'true');
  canvas.removeAttribute('role');
  canvas.removeAttribute('aria-label');
  canvas.tabIndex = -1;
}

function resetView() {
  manualRotation = 0;
  manualElevation = 0;
  dragVelocity = 0;
  pointer.x = 0;
  pointer.y = 0;
  pointer.targetX = 0;
  pointer.targetY = 0;
}

function nudgeView({ azimuth = 0, elevation = 0 } = {}) {
  if (!Number.isFinite(azimuth) || !Number.isFinite(elevation)) return false;
  manualRotation += azimuth;
  manualElevation = THREE.MathUtils.clamp(manualElevation + elevation, -0.38, 0.38);
  if (!running && initialized) renderFrame({ frozen: true });
  return true;
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
  setCanvasInteractive(false);
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
  setCanvasInteractive(false);
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
    resetView() {
      resetView();
      if (!running && initialized) renderFrame({ frozen: true });
    },
    nudgeView,
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
    get numericalEnvelope() { return numericalTracker.snapshot(); },
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
        // Compatibility alias: this now reports the camera orbit, not a
        // rotation applied to the entire sculpture.
        rotationY: cameraOrbitAzimuth,
        cameraAzimuth: cameraOrbitAzimuth,
        cameraElevation: cameraOrbitElevation,
        camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        focus: { x: cameraFocus.x, y: cameraFocus.y, z: cameraFocus.z },
        bobDepth: currentPoints.second.z,
        linkAzimuths: [currentPoints.azimuth1, currentPoints.azimuth2],
        y: stage.position.y,
        z: stage.position.z,
        scale: stage.scale.x,
      };
    },
    get spatialState() {
      const link2x = state[P2] - state[P1];
      const link2y = state[P2 + 1] - state[P1 + 1];
      const link2z = state[P2 + 2] - state[P1 + 2];
      const relativeVelocityX = state[V2] - state[V1];
      const relativeVelocityY = state[V2 + 1] - state[V1 + 1];
      const relativeVelocityZ = state[V2 + 2] - state[V1 + 2];
      const link1Length = Math.hypot(state[P1], state[P1 + 1], state[P1 + 2]);
      const link2Length = Math.hypot(link2x, link2y, link2z);
      const diagnostics = heroSpatialDiagnostics(state, params);
      return {
        time: simulationTime,
        bob1: { x: state[P1], y: state[P1 + 1], z: state[P1 + 2] },
        bob2: { x: state[P2], y: state[P2 + 1], z: state[P2 + 2] },
        azimuths: [currentPoints.azimuth1, currentPoints.azimuth2],
        polarAngles: [currentPoints.theta1, currentPoints.theta2],
        constraintErrors: [link1Length - params.l1, link2Length - params.l2],
        tangentErrors: [
          state[P1] * state[V1] + state[P1 + 1] * state[V1 + 1] + state[P1 + 2] * state[V1 + 2],
          link2x * relativeVelocityX + link2y * relativeVelocityY + link2z * relativeVelocityZ,
        ],
        energy: diagnostics.energy,
      };
    },
    get divergence() {
      return Math.hypot(
        state[P1] - shadowState[P1],
        state[P1 + 1] - shadowState[P1 + 1],
        state[P1 + 2] - shadowState[P1 + 2],
        state[P2] - shadowState[P2],
        state[P2 + 1] - shadowState[P2 + 1],
        state[P2 + 2] - shadowState[P2 + 2],
      );
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
  setCanvasInteractive(false);
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
