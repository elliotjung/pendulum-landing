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
const captureMode = query.has('captureHero') || window.__PENDULUM_CAPTURE_HERO === true;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reducedData = window.matchMedia('(prefers-reduced-data: reduce)').matches;
const compact = window.matchMedia('(max-width: 720px), (pointer: coarse)').matches;
const lowMemory = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 2;
const staticHero = reducedMotion || reducedData || lowMemory;

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
let frameId = 0;
let lastFrame = performance.now();
let simulationAccumulator = 0;
let simulationTime = 0;
let trailTick = 0;

const params = Object.freeze({ m1: 1, m2: 1, l1: 1.14, l2: 1.02, g: 9.81 });
const state = [2.34, 2.72, 0, 0];
const shadowState = [2.3408, 2.72, 0, 0];
const work = createRk4Work();
const shadowWork = createRk4Work();
const anchor = new THREE.Vector3(0, 1.55, 0);
const yAxis = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const midpoint = new THREE.Vector3();
const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
let dragging = false;
let dragStart = 0;
let manualRotation = 0;
let dragVelocity = 0;

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
      geometry.computeBoundingSphere();
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
      geometry.computeBoundingSphere();
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

function pointsFromState(source, phase = 0) {
  const theta1 = source[0];
  const theta2 = source[1];
  const depth1 = Math.sin(simulationTime * 0.38 + phase) * 0.045;
  const depth2 = Math.sin(simulationTime * 0.51 + phase + 0.8) * 0.09;
  const first = new THREE.Vector3(
    anchor.x + params.l1 * Math.sin(theta1),
    anchor.y - params.l1 * Math.cos(theta1),
    depth1,
  );
  const second = new THREE.Vector3(
    first.x + params.l2 * Math.sin(theta2),
    first.y - params.l2 * Math.cos(theta2),
    depth2,
  );
  return { first, second };
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
  const current = pointsFromState(state);
  const nearby = pointsFromState(shadowState, 0.18);
  firstTrail.push(current.first);
  secondTrail.push(current.second);
  shadowTrail.push(nearby.second);
  cyanDust.push(current.first, dustRandom);
  violetDust.push(current.second, dustRandom);
  violetDust.push(current.second, dustRandom);
  updatePendulum(primary, current);
  updatePendulum(shadow, nearby);
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
}

function prewarm() {
  const fixedStep = 1 / 240;
  // Land the deterministic capture on a legible, downward-opening pose while
  // retaining enough history to show the preceding chaotic loops.
  const steps = captureMode ? 3112 : compact ? 1560 : 2800;
  for (let i = 0; i < steps; i += 1) stepSimulation(fixedStep);
  pushCurrentTrail();
  syncTrails();
}

function buildScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x02050d, 0.038);
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 80);
  camera.position.set(0, 0.12, 8.4);

  renderer = new THREE.WebGLRenderer({
    canvas,
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
  stage.add(shadow.group, primary.group, buildAnchor());
  positionStage();
  prewarm();

  if (!compact) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 1.0, 0.58, 0.085);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stop();
    document.body.classList.remove('hero-live');
    document.body.classList.add('no-webgl');
  });
}

function positionStage() {
  const narrow = width < 760;
  const short = height < 680;
  stage.position.set(narrow ? 0.18 : 2.3, narrow ? -1.1 : short ? -0.12 : 0.05, 0);
  stage.scale.setScalar(narrow ? Math.min(0.76, width / 510) : short ? 0.94 : 1.18);
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (composer) composer.setSize(width, height);
  if (bloom) bloom.setSize(width, height);
  positionStage();
}

function bindInteraction() {
  window.addEventListener('pointermove', (event) => {
    pointer.targetX = event.clientX / width - 0.5;
    pointer.targetY = event.clientY / height - 0.5;
    if (dragging) {
      const delta = event.clientX - dragStart;
      dragVelocity = delta * 0.0018;
      manualRotation += dragVelocity;
      dragStart = event.clientX;
    }
  }, { passive: true });
  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    dragStart = event.clientX;
    canvas.classList.add('is-dragging');
    canvas.setPointerCapture?.(event.pointerId);
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
    canvas.classList.remove('is-dragging');
  }, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
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
  const current = pointsFromState(state);
  const nearby = pointsFromState(shadowState, 0.18);
  updatePendulum(primary, current);
  updatePendulum(shadow, nearby);
  if (trailTick % (compact ? 8 : 6) === 0) syncTrails();
}

function renderFrame({ frozen = false } = {}) {
  const now = performance.now();
  const elapsed = frozen ? 0 : Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  if (!frozen) advance(elapsed);

  pointer.x += (pointer.targetX - pointer.x) * 0.055;
  pointer.y += (pointer.targetY - pointer.y) * 0.055;
  dragVelocity *= 0.91;
  manualRotation += dragVelocity;

  const scrollProgress = Math.min(1, (window.scrollY || 0) / Math.max(height, 1));
  stage.rotation.y = manualRotation + pointer.x * 0.16 + Math.sin(simulationTime * 0.13) * 0.035;
  stage.rotation.x = -0.035 + pointer.y * 0.055 + scrollProgress * 0.08;
  particles.rotation.z += elapsed * 0.006;
  cyanLight.intensity = 17 + Math.sin(simulationTime * 0.7) * 2.4;
  violetLight.intensity = 16 + Math.cos(simulationTime * 0.61) * 2.2;
  if (glint) {
    glint.material.opacity = 0.74 + Math.sin(simulationTime * 1.7) * 0.14;
    const glintScale = 0.86 + Math.sin(simulationTime * 1.21) * 0.07;
    glint.scale.set(glintScale, glintScale, 1);
  }
  camera.position.x += (pointer.x * 0.5 - camera.position.x) * 0.035;
  camera.position.y += ((0.12 - pointer.y * 0.28) - camera.position.y) * 0.035;
  camera.lookAt(width < 760 ? 0 : 1.3, width < 760 ? -0.4 : 0.05, 0);

  if (composer) composer.render();
  else renderer.render(scene, camera);
  window.__heroPainted = true;
  document.body.classList.add('hero-live');
}

function loop() {
  if (!running) return;
  frameId = requestAnimationFrame(loop);
  renderFrame();
}

function start() {
  if (running || captureMode) return;
  running = true;
  lastFrame = performance.now();
  frameId = requestAnimationFrame(loop);
}

function stop() {
  running = false;
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
}

function syncPlayback() {
  if (visible && !document.hidden) start();
  else stop();
}

try {
  if (staticHero) {
    canvas.style.display = 'none';
    document.body.classList.add(reducedMotion ? 'reduced-motion-hero' : 'low-power-hero');
    window.__heroPainted = true;
  } else {
    buildScene();
    bindInteraction();
    renderFrame({ frozen: true });
    if (!captureMode) {
      const hero = document.querySelector('.hero');
      if (hero && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
          visible = entries.some((entry) => entry.isIntersecting);
          syncPlayback();
        }, { rootMargin: '90% 0px 40% 0px' });
        observer.observe(hero);
      }
      document.addEventListener('visibilitychange', syncPlayback);
      syncPlayback();
    }
    window.__hero = {
      pause: stop,
      resume() { visible = true; syncPlayback(); },
      get running() { return running; },
      get divergence() {
        return Math.hypot(state[0] - shadowState[0], state[1] - shadowState[1]);
      },
    };
  }
} catch (error) {
  console.warn('[hero] WebGL unavailable; using the static pendulum artwork', error);
  stop();
  canvas.style.display = 'none';
  document.body.classList.remove('hero-live');
  document.body.classList.add('no-webgl');
  window.__heroPainted = true;
}
