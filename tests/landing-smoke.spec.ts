import { readFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

function rawHttpStatus(target: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: 4177 });
    let response = '';
    socket.setEncoding('latin1');
    socket.setTimeout(5_000, () => socket.destroy(new Error('raw HTTP request timed out')));
    socket.once('connect', () => {
      socket.end(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:4177\r\nConnection: close\r\n\r\n`);
    });
    socket.on('data', (chunk) => { response += chunk; });
    socket.once('error', reject);
    socket.once('end', () => {
      const status = Number.parseInt(response.match(/^HTTP\/1\.[01] (\d{3})/)?.[1] ?? '', 10);
      if (!Number.isInteger(status)) reject(new Error(`invalid raw HTTP response: ${response.slice(0, 80)}`));
      else resolve(status);
    });
  });
}

test.afterEach(async ({ page }, testInfo) => {
  testInfo.setTimeout(testInfo.timeout + 15_000);
  if (page.isClosed()) return;
  await page.evaluate(() => {
    const runtime = window as unknown as {
      __heroLifecycle?: { dispose?: () => void };
      __hero?: { dispose?: () => void };
    };
    runtime.__heroLifecycle?.dispose?.();
    runtime.__hero?.dispose?.();
  }).catch(() => undefined);
  await page.goto('about:blank', { waitUntil: 'commit', timeout: 5_000 }).catch(() => undefined);
});

test('skip link is the first keyboard stop and moves focus to main content', async ({ page, browserName }) => {
  await page.goto('/');
  const skipLink = page.locator('.skip-link');
  // Safari/WebKit follows the host's "Press Tab to highlight each item"
  // preference, which is disabled in Playwright's Windows WebKit build. DOM
  // order is pinned by the static gate; focus explicitly here so activation
  // semantics are still exercised in every engine.
  if (browserName === 'webkit') await skipLink.focus();
  else await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('landing page has no console errors and paints the hero', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/?captureHero=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.nav')).toBeVisible();
  await expect(page.locator('h1')).toHaveAccessibleName('Order, undone by chaos.');
  await expect(page.locator('#hero-canvas')).toBeAttached();
  await expect(page.locator('#orbit-console')).toBeVisible();
  await expect(page.locator('.app-preview img')).toBeVisible();
  await page.waitForFunction(() => {
    const fallback = document.body.classList.contains('no-webgl') || document.body.classList.contains('low-power-hero') || document.body.classList.contains('reduced-motion-hero');
    return Boolean((window as unknown as { __heroPainted?: boolean }).__heroPainted) || fallback;
  }, null, { timeout: 8_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __orbitConsolePainted?: boolean }).__orbitConsolePainted), null, { timeout: 8_000 });

  const nonBlank = await page.locator('#hero-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const fallback = document.body.classList.contains('no-webgl') || document.body.classList.contains('low-power-hero') || document.body.classList.contains('reduced-motion-hero');
    if (!gl || canvas.width === 0 || canvas.height === 0) return fallback;
    const probeSize = 48;
    const pixels = new Uint8Array(probeSize * probeSize * 4);
    const probes = [[0.5, 0.74], [0.58, 0.62], [0.66, 0.52], [0.76, 0.68], [0.82, 0.82]];
    for (const [x, y] of probes) {
      gl.readPixels(
        Math.max(0, Math.floor(canvas.width * x - probeSize / 2)),
        Math.max(0, Math.floor(canvas.height * y - probeSize / 2)),
        probeSize,
        probeSize,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels
      );
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] !== 0 || pixels[i + 1] !== 0 || pixels[i + 2] !== 0 || pixels[i + 3] !== 0) return true;
      }
    }
    return false;
  });

  expect(nonBlank).toBeTruthy();

  const consolePainted = await page.locator('#orbit-console').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) return false;
    const pixels = ctx.getImageData(0, 0, Math.min(32, canvas.width), Math.min(32, canvas.height)).data;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] !== 0 || pixels[i + 1] !== 0 || pixels[i + 2] !== 0 || pixels[i + 3] !== 0) return true;
    }
    return false;
  });
  expect(consolePainted).toBeTruthy();
  expect(errors).toEqual([]);
  await expect(page.locator('[data-evidence="mutation.scoreLabel"]').first()).toContainText('65.32%');
});

test('first-session narrative leads with one experiment and demotes advanced paths', async ({ page }) => {
  await page.goto('/?lang=en');
  await expect(page.locator('.product-statement')).toHaveText(
    'An interactive laboratory for understanding and measuring nonlinear dynamics.'
  );
  await expect(page.locator('.signal-strip-track span')).toHaveText([
    '1 same start',
    '2 tiny difference',
    '3 divergence',
    '4 measure it',
    '5 open full Lab'
  ]);
  await expect(page.locator('[data-orbit-beat] .descent-index')).toHaveText([
    '01 · Same start',
    '02 · Tiny difference',
    '03 · Divergence',
    '04 · Measure'
  ]);
  await expect(page.locator('.trajectory-legend [role="listitem"]')).toHaveText([
    /Reference.*unchanged initial state/,
    /Perturbed.*reference \+ Δθ₁/
  ]);
  await expect(page.locator('.recipe-grid .recipe-card')).toHaveCount(5);
  await expect(page.locator('.recipe-grid .recipe-card > span')).toHaveText([
    'Curious beginner',
    'Student',
    'Numerical methods',
    'Research / review',
    'Developer'
  ]);
  await expect(page.locator('#capabilities .cap-card')).toHaveCount(4);
  await expect(page.locator('#capabilities .cap-card h3')).toHaveText([
    'Simulation',
    'Chaos & Analysis',
    'Numerical Trust',
    'Reproducibility'
  ]);
  await expect(page.locator('.methods-disclosure')).not.toHaveAttribute('open', '');
  expect(await page.locator('.signal-strip').innerText()).not.toMatch(/DOP853|Poincaré|Floquet|TCAD/);
  const sectionOrder = await page.locator('#advanced, #frontier, #tcad').evaluateAll((sections) => sections.map((section) => section.id));
  expect(sectionOrder).toEqual(['advanced', 'frontier', 'tcad']);
  await expect(page.locator('#advanced')).toContainText('Optional deeper paths');
  await expect(page.locator('#frontier .kicker')).toContainText('Secondary');
  await expect(page.locator('#tcad .kicker')).toContainText('Secondary');
});

test('default load paints instantly and defers the heavy 3D bundle until intent', async ({ page }) => {
  test.setTimeout(180_000);
  expect(await rawHttpStatus('/malformed-%ZZ-path')).toBe(400);
  expect((await page.request.get('/?lang=en')).status()).toBe(200);
  const sceneRequests: string[] = [];
  const deferredEnhancementRequests: string[] = [];
  let webglUnavailable = false;
  let releaseScene: () => void = () => undefined;
  const sceneGate = new Promise<void>((resolve) => { releaseScene = resolve; });
  page.on('request', (request) => {
    if (request.url().includes('/assets/scene.bundle.js')) sceneRequests.push(request.url());
    if (/\/assets\/orbit-console\.js/.test(request.url())) {
      deferredEnhancementRequests.push(request.url());
    }
  });
  await page.route('**/assets/scene.bundle.js', async (route) => {
    await sceneGate;
    await route.continue();
  });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.hero-static-art')).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/js-ready/);
    await expect(page.locator('html')).not.toHaveClass(/no-js/);
    expect(await page.evaluate(() => ({
      ready: (window as unknown as { __PENDULUM_MAIN_READY?: boolean }).__PENDULUM_MAIN_READY,
      watchdog: (window as unknown as { __PENDULUM_MAIN_WATCHDOG?: number }).__PENDULUM_MAIN_WATCHDOG
    }))).toEqual({ ready: true, watchdog: 0 });
    const cspProbe = await page.evaluate(async () => {
      const marker = '__pendulumInlineCspProbe';
      delete (window as unknown as Record<string, unknown>)[marker];
      const violation = new Promise<string>((resolve) => {
        const timeout = window.setTimeout(() => resolve(''), 500);
        document.addEventListener('securitypolicyviolation', (event) => {
          if (!event.blockedURI || event.blockedURI === 'inline') {
            clearTimeout(timeout);
            resolve(event.effectiveDirective);
          }
        }, { once: true });
      });
      const script = document.createElement('script');
      script.textContent = `window.${marker}=true`;
      document.head.appendChild(script);
      const directive = await violation;
      script.remove();
      return {
        executed: (window as unknown as Record<string, unknown>)[marker] === true,
        directive
      };
    });
    expect(cspProbe.executed).toBe(false);
    expect(cspProbe.directive).toMatch(/^script-src/);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(250);
    await page.waitForTimeout(1_500);
    expect(sceneRequests).toHaveLength(0);
    expect(deferredEnhancementRequests).toHaveLength(0);
    // Keyboard navigation is not consent to download the heavy renderer.
    await page.keyboard.press('Tab');
    await page.waitForTimeout(250);
    expect(sceneRequests).toHaveLength(0);
    await expect(page.locator('[data-hero-toggle-label]')).toHaveText('Start 3D');
    await page.locator('.hero').hover({ position: { x: 24, y: 180 } });
    await expect(page.locator('body')).toHaveClass(/hero-loading|no-webgl/);
    webglUnavailable = await page.locator('body').evaluate((body) => body.classList.contains('no-webgl'));
    if (webglUnavailable) {
      expect(sceneRequests).toHaveLength(0);
      await expect(page.locator('body')).toHaveAttribute('data-hero-fallback', 'webgl2-unavailable');
      await expect(page.locator('.hero-static-art')).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/hero-loading|hero-live/);
      await expect(page.locator('[data-hero-toggle-label]')).toHaveText('Static artwork');
    } else {
      await expect.poll(() => sceneRequests.length).toBe(1);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(page.locator('body')).toHaveClass(/reduced-motion-hero/);
      await expect(page.locator('[data-hero-toggle-label]')).toHaveText('Static artwork');
    }
  } finally {
    releaseScene();
  }
  if (webglUnavailable) {
    await page.unroute('**/assets/scene.bundle.js');
    return;
  }
  await page.waitForFunction(() => Boolean((window as unknown as { __heroLifecycle?: unknown }).__heroLifecycle));
  await page.unroute('**/assets/scene.bundle.js');
  await expect(page.locator('body')).not.toHaveClass(/hero-live/);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => document.body.classList.contains('hero-live')
    || document.body.classList.contains('no-webgl')
    || document.body.classList.contains('low-power-hero')
    || document.body.classList.contains('reduced-motion-hero'), null, { timeout: 30_000 });
  await expect(page.locator('body')).not.toHaveClass(/hero-loading/);
  expect(sceneRequests).toHaveLength(1);
});

test('unsupported WebGL2 fails over before Three.js and stays console-clean', async ({ page }) => {
  const errors: string[] = [];
  const sceneRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    if (request.url().includes('/assets/scene.bundle.js')) sceneRequests.push(request.url());
  });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, options?: unknown) {
      if (type === 'webgl2' || type === 'webgl') return null;
      return original.call(this, type, options as never);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto('/?captureHero=1');
  await expect(page.locator('body')).toHaveClass(/no-webgl/);
  await expect(page.locator('.hero-static-art')).toBeVisible();
  expect(sceneRequests).toHaveLength(0);
  expect(errors).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('body')).not.toHaveClass(/hero-loading/);
  await expect(page.locator('[data-hero-toggle-label]')).toHaveText('Static artwork');
  expect(sceneRequests).toHaveLength(0);
});

test('hero motion control starts, pauses, and resumes the physical scene', async ({ page }) => {
  test.setTimeout(120_000);
  const sceneRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/assets/scene.bundle.js')) sceneRequests.push(request.url());
  });
  await page.goto('/');
  const toggle = page.locator('[data-hero-toggle]');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await page.waitForFunction(() => document.body.classList.contains('hero-live')
    || document.body.classList.contains('no-webgl'), null, { timeout: 45_000 });
  test.skip(await page.locator('body').evaluate((body) => body.classList.contains('no-webgl')), 'WebGL2 is unavailable');
  expect(sceneRequests).toHaveLength(1);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-hero-toggle-label]')).toHaveText('Pause 3D');
  const dragStart = await page.evaluate(() => {
    const candidates = [
      [window.innerWidth * 0.78, window.innerHeight * 0.52],
      [window.innerWidth * 0.68, window.innerHeight * 0.68]
    ];
    for (const [x, y] of candidates) {
      const target = document.elementFromPoint(x, y);
      if (
        target?.closest('.hero')
        && !target.closest('a, button, input, select, textarea, label, summary, [role="button"], [contenteditable="true"]')
      ) {
        return { x, y };
      }
    }
    return null;
  });
  expect(dragStart).toBeTruthy();
  const rotationBeforeDrag = await page.evaluate(() => (window as unknown as {
    __hero?: { scrollPose: { cameraAzimuth: number } };
  }).__hero?.scrollPose.cameraAzimuth ?? 0);
  await page.mouse.move(dragStart!.x, dragStart!.y);
  await page.mouse.down();
  expect(await page.evaluate(() => (window as unknown as {
    __hero?: { dragging: boolean };
  }).__hero?.dragging)).toBe(true);
  await page.mouse.move(dragStart!.x - 180, dragStart!.y, { steps: 8 });
  await page.mouse.up();
  // The visual compositor intentionally adapts to slow GPUs. Keep the
  // interaction assertion tied to the rendered pose, but give a throttled
  // cinematic frame enough time to arrive instead of using Playwright's
  // short global expect timeout.
  await expect.poll(async () => Math.abs(
    (await page.evaluate(() => (window as unknown as {
      __hero?: { scrollPose: { cameraAzimuth: number } };
    }).__hero?.scrollPose.cameraAzimuth ?? 0)) - rotationBeforeDrag
  ), { timeout: 20_000 }).toBeGreaterThan(0.2);
  const editableBox = await page.evaluate(() => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', '');
    editor.dataset.heroDragExclusionProbe = 'true';
    Object.assign(editor.style, {
      position: 'absolute',
      left: '68%',
      top: '56%',
      width: '120px',
      height: '64px',
      zIndex: '30'
    });
    document.querySelector('.hero')?.appendChild(editor);
    const rect = editor.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(editableBox.x, editableBox.y);
  await page.mouse.down();
  await page.mouse.move(editableBox.x - 90, editableBox.y, { steps: 4 });
  expect(await page.evaluate(() => (window as unknown as {
    __hero?: { dragging: boolean };
  }).__hero?.dragging)).toBe(false);
  await page.mouse.up();
  await page.locator('[data-hero-drag-exclusion-probe]').evaluate((element) => element.remove());
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveClass(/hero-user-paused/);
  await expect(page.locator('[data-hero-toggle-label]')).toHaveText('Resume 3D');
  expect(await page.evaluate(() => (window as unknown as { __hero?: { running: boolean } }).__hero?.running)).toBe(false);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-hero-toggle-label]')).toHaveText('Pause 3D');
});

test('hero integrates a constrained double-spherical state independently of camera orbit', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.locator('[data-hero-toggle]').click();
  await page.waitForFunction(() => document.body.classList.contains('hero-live')
    || document.body.classList.contains('no-webgl'), null, { timeout: 45_000 });
  test.skip(await page.locator('body').evaluate((body) => body.classList.contains('no-webgl')), 'WebGL2 is unavailable');

  type SpatialSnapshot = {
    time: number;
    bob1: { x: number; y: number; z: number };
    bob2: { x: number; y: number; z: number };
    azimuths: number[];
    constraintErrors: number[];
    tangentErrors: number[];
  };
  const readSpatial = () => page.evaluate(() => (window as unknown as {
    __hero?: { spatialState: SpatialSnapshot };
  }).__hero?.spatialState);
  const initial = await readSpatial();
  expect(initial).toBeTruthy();
  expect(Math.abs(initial?.bob1.z ?? 0)).toBeGreaterThan(0.02);
  expect(Math.abs(initial?.bob2.z ?? 0)).toBeGreaterThan(0.02);

  await expect.poll(async () => (await readSpatial())?.time ?? 0, { timeout: 10_000 })
    .toBeGreaterThan((initial?.time ?? 0) + 0.15);
  const evolved = await readSpatial();
  expect(evolved).toBeTruthy();
  const azimuthTravel = Math.hypot(
    (evolved?.azimuths[0] ?? 0) - (initial?.azimuths[0] ?? 0),
    (evolved?.azimuths[1] ?? 0) - (initial?.azimuths[1] ?? 0)
  );
  expect(azimuthTravel).toBeGreaterThan(0.002);
  evolved?.constraintErrors.forEach((error) => expect(Math.abs(error)).toBeLessThan(1e-9));
  evolved?.tangentErrors.forEach((error) => expect(Math.abs(error)).toBeLessThan(1e-9));

  await page.locator('[data-hero-toggle]').click();
  await expect(page.locator('[data-hero-toggle]')).toHaveAttribute('aria-pressed', 'true');
  const frozenPhysics = await readSpatial();
  const frozenCamera = await page.evaluate(() => (window as unknown as {
    __hero?: { scrollPose: { cameraAzimuth: number } };
  }).__hero?.scrollPose.cameraAzimuth ?? 0);
  await page.locator('[data-orbit-beat="2"]').scrollIntoViewIfNeeded();
  await page.waitForFunction((startAzimuth) => Math.abs(
    ((window as unknown as { __hero?: { scrollPose: { cameraAzimuth: number } } }).__hero?.scrollPose.cameraAzimuth ?? 0)
      - startAzimuth
  ) > 0.5, frozenCamera, { timeout: 20_000 });
  const afterCameraOrbit = await readSpatial();
  expect(afterCameraOrbit?.time).toBe(frozenPhysics?.time);
  expect(afterCameraOrbit?.bob1).toEqual(frozenPhysics?.bob1);
  expect(afterCameraOrbit?.bob2).toEqual(frozenPhysics?.bob2);
  expect(afterCameraOrbit?.azimuths).toEqual(frozenPhysics?.azimuths);
});

test('a failed 3D module request settles permanently on the usable static mode', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/assets/scene.bundle.js', (route) => route.abort('failed'));
  await page.goto('/');
  await page.locator('[data-hero-toggle]').dispatchEvent('click');
  await expect(page.locator('body')).toHaveClass(/no-webgl/, { timeout: 45_000 });
  await expect(page.locator('[data-hero-toggle-label]')).toHaveText('Static artwork');
  await expect(page.locator('[data-hero-toggle]')).toBeDisabled({ timeout: 45_000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('body')).not.toHaveClass(/hero-loading/);
  await expect(page.locator('[data-hero-toggle-label]')).toHaveText('Static artwork');
});

test('scrolling through phase descent orbits the camera around spatial pendulum motion', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.locator('[data-hero-toggle]').click();
  await page.waitForFunction(() => document.body.classList.contains('hero-live')
    || document.body.classList.contains('no-webgl'), null, { timeout: 45_000 });
  test.skip(await page.locator('body').evaluate((body) => body.classList.contains('no-webgl')), 'WebGL2 is unavailable');
  const initial = await page.evaluate(() => (window as unknown as {
    __hero?: { scrollPose: {
      progress: number;
      cameraAzimuth: number;
      cameraElevation: number;
      camera: { x: number; y: number; z: number };
      bobDepth: number;
      linkAzimuths: number[];
      y: number;
    } }
  }).__hero?.scrollPose);
  expect(initial).toBeTruthy();
  await page.locator('[data-orbit-beat="2"]').scrollIntoViewIfNeeded();
  await page.waitForFunction((start) => {
    const runtime = window as unknown as {
      __orbitScrollProgress?: number;
      __hero?: { scrollPose: {
        progress: number;
        cameraAzimuth: number;
        camera: { x: number; y: number; z: number };
        bobDepth: number;
        y: number;
      } };
    };
    const pose = runtime.__hero?.scrollPose;
    const cameraTravel = pose ? Math.hypot(
      pose.camera.x - start.camera.x,
      pose.camera.y - start.camera.y,
      pose.camera.z - start.camera.z
    ) : 0;
    return Boolean(
      pose
      && (runtime.__orbitScrollProgress ?? 0) > 0.4
      && pose.progress > start.progress
      && Math.abs(pose.cameraAzimuth - start.cameraAzimuth) > 0.5
      && cameraTravel > 1.5
      && Math.abs(pose.bobDepth) > 0.025
      && pose.y < start.y - 0.2
    );
  }, initial!, { timeout: 45_000 });
  await expect(page.locator('body')).toHaveClass(/orbit-descent-active/);
  await expect(page.locator('body')).toHaveClass(/hero-scene-active/);
  await expect(page.locator('.descent-beat[aria-current="step"]')).toHaveCount(1);
  const final = await page.evaluate(() => (window as unknown as {
    __hero?: { scrollPose: {
      progress: number;
      cameraAzimuth: number;
      cameraElevation: number;
      camera: { x: number; y: number; z: number };
      bobDepth: number;
      linkAzimuths: number[];
      y: number;
    } }
  }).__hero?.scrollPose);
  expect(final?.progress ?? 0).toBeGreaterThan(initial?.progress ?? 0);
  const azimuthTravel = Math.abs((final?.cameraAzimuth ?? 0) - (initial?.cameraAzimuth ?? 0));
  expect(azimuthTravel).toBeGreaterThan(0.5);
  expect(azimuthTravel).toBeLessThan(2.35);
  expect(Math.hypot(
    (final?.camera.x ?? 0) - (initial?.camera.x ?? 0),
    (final?.camera.y ?? 0) - (initial?.camera.y ?? 0),
    (final?.camera.z ?? 0) - (initial?.camera.z ?? 0)
  )).toBeGreaterThan(1.5);
  expect(Math.abs(final?.bobDepth ?? 0)).toBeGreaterThan(0.025);
  expect(Math.abs((final?.linkAzimuths?.[0] ?? 0) - (final?.linkAzimuths?.[1] ?? 0))).toBeGreaterThan(0.02);
  expect(final?.y ?? 0).toBeLessThan((initial?.y ?? 0) - 0.2);
  await expect(page.locator('[data-descent-coordinate]')).not.toHaveText('2.34 / 2.72');
  await expect(page.locator('[data-descent-view]')).toHaveText(
    /^\d{3}° \/ e [+-]\d{2}° \/ z -?\d+\.\d{2}$/,
  );
});

test('prewarm preference changes stay static and restart the same scene module', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const callbacks = new Map<number, IdleRequestCallback>();
    let nextId = 0;
    const runtime = window as unknown as {
      __flushHeroIdle: () => number;
      __testSaveData: boolean;
      __setTestSaveData: (next: boolean) => void;
      requestIdleCallback: (callback: IdleRequestCallback) => number;
      cancelIdleCallback: (id: number) => void;
    };
    runtime.requestIdleCallback = (callback) => {
      nextId += 1;
      callbacks.set(nextId, callback);
      return nextId;
    };
    runtime.cancelIdleCallback = (id) => callbacks.delete(id);
    runtime.__flushHeroIdle = () => {
      let safety = 0;
      while (callbacks.size && safety < 256) {
        const [id, callback] = callbacks.entries().next().value as [number, IdleRequestCallback];
        callbacks.delete(id);
        callback({ didTimeout: false, timeRemaining: () => 50 });
        safety += 1;
      }
      return callbacks.size;
    };
    const connection = new EventTarget() as EventTarget & { readonly saveData: boolean };
    runtime.__testSaveData = false;
    Object.defineProperty(connection, 'saveData', { configurable: true, get: () => runtime.__testSaveData });
    Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
    runtime.__setTestSaveData = (next) => {
      runtime.__testSaveData = next;
      connection.dispatchEvent(new Event('change'));
    };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/reduced-motion-hero/);
  await expect(page.locator('.hero-static-art')).toBeVisible();
  await expect(page.locator('#hero-canvas')).toBeHidden();
  await expect(page.locator('[data-hero-toggle]')).toBeDisabled();
  await expect(page.locator('[data-hero-toggle-label]')).toHaveText('Static artwork');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => document.body.classList.contains('no-webgl') || (window as unknown as {
    __heroLifecycle?: { phase: string };
  }).__heroLifecycle?.phase === 'prewarming');
  const webglUnavailable = await page.locator('body').evaluate((body) => body.classList.contains('no-webgl'));
  if (webglUnavailable) {
    await expect(page.locator('body')).toHaveAttribute('data-hero-fallback', 'webgl2-unavailable');
    await expect(page.locator('.hero-static-art')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/hero-loading|hero-live/);
    await expect(page.locator('[data-hero-toggle-label]')).toHaveText('Static artwork');
    return;
  }
  await page.evaluate(() => (window as unknown as { __setTestSaveData: (next: boolean) => void }).__setTestSaveData(true));
  await expect(page.locator('body')).toHaveClass(/low-power-hero/);
  await page.evaluate(() => (window as unknown as { __flushHeroIdle: () => number }).__flushHeroIdle());
  await expect(page.locator('body')).not.toHaveClass(/hero-live|hero-loading/);
  expect(await page.evaluate(() => Boolean((window as unknown as { __hero?: unknown }).__hero))).toBe(false);
  await page.evaluate(() => (window as unknown as { __setTestSaveData: (next: boolean) => void }).__setTestSaveData(false));
  await page.waitForFunction(() => (window as unknown as {
    __heroLifecycle?: { phase: string };
  }).__heroLifecycle?.phase === 'prewarming');
  await page.evaluate(() => (window as unknown as { __flushHeroIdle: () => number }).__flushHeroIdle());
  await page.waitForFunction(() => document.body.classList.contains('hero-live')
    || document.body.classList.contains('no-webgl'), null, { timeout: 20_000 });
  await expect(page.locator('body')).not.toHaveClass(/hero-loading|low-power-hero/);
});

test('low-memory clients receive an immediate static hero', async ({ page }) => {
  const sceneRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/assets/scene.bundle.js')) sceneRequests.push(request.url());
  });
  await page.addInitScript(() => Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 }));
 await page.goto('/');
 await expect(page.locator('body')).toHaveClass(/low-power-hero/);
 await expect(page.locator('.hero-static-art')).toBeVisible();
 await page.evaluate(() => {
   document.documentElement.style.scrollBehavior = 'auto';
   window.scrollTo(0, 48);
   window.dispatchEvent(new Event('scroll'));
 });
 await page.waitForTimeout(250);
 const scrollState = await page.evaluate(() => {
   const orbitDescentElement = document.querySelector<HTMLElement>('#orbit-descent');
   return {
     progress: (window as unknown as { __orbitScrollProgress?: number }).__orbitScrollProgress,
     velocity: (window as unknown as { __orbitScrollVelocity?: number }).__orbitScrollVelocity,
     cssProgress: Number.parseFloat(orbitDescentElement
       ? getComputedStyle(orbitDescentElement).getPropertyValue('--orbit-scroll')
       : '0')
   };
 });
 expect(scrollState).toEqual({ progress: 0, velocity: expect.any(Number), cssProgress: 0 });
 expect(Number.isFinite(scrollState.velocity)).toBe(true);
 expect(sceneRequests).toEqual([]);
});

test('WebGL context loss during prewarm invalidates the pending live generation', async ({ page }) => {
 test.setTimeout(120_000);
 await page.addInitScript(() => {
   const callbacks = new Map<number, IdleRequestCallback>();
   let nextId = 0;
    const runtime = window as unknown as {
      __flushHeroIdle: () => number;
      requestIdleCallback: (callback: IdleRequestCallback) => number;
      cancelIdleCallback: (id: number) => void;
    };
    runtime.requestIdleCallback = (callback) => {
      nextId += 1;
      callbacks.set(nextId, callback);
      return nextId;
    };
    runtime.cancelIdleCallback = (id) => callbacks.delete(id);
    runtime.__flushHeroIdle = () => {
      let safety = 0;
      while (callbacks.size && safety < 256) {
        const [id, callback] = callbacks.entries().next().value as [number, IdleRequestCallback];
        callbacks.delete(id);
        callback({ didTimeout: false, timeRemaining: () => 50 });
        safety += 1;
      }
      return callbacks.size;
    };
  });
  await page.goto('/');
  await page.locator('.hero').hover({ position: { x: 24, y: 180 } });
  await page.waitForFunction(() => document.body.classList.contains('no-webgl') || (window as unknown as {
    __heroLifecycle?: { phase: string };
  }).__heroLifecycle?.phase === 'prewarming');
  const webglUnavailable = await page.locator('body').evaluate((body) => body.classList.contains('no-webgl'));
  if (webglUnavailable) {
    await expect(page.locator('body')).toHaveAttribute('data-hero-fallback', 'webgl2-unavailable');
    await expect(page.locator('.hero-static-art')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/hero-loading|hero-live/);
    await expect(page.locator('[data-hero-toggle-label]')).toHaveText('Static artwork');
    expect(await page.evaluate(() => Boolean((window as unknown as { __hero?: unknown }).__hero))).toBe(false);
    return;
  }
  const supported = await page.locator('#hero-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context');
    extension?.loseContext();
    return Boolean(extension);
  });
  test.skip(!supported, 'WEBGL_lose_context is unavailable');
  await expect(page.locator('body')).toHaveClass(/no-webgl/);
  await expect(page.locator('.hero-static-art')).toBeVisible();
  await page.evaluate(() => (window as unknown as { __flushHeroIdle: () => number }).__flushHeroIdle());
  await page.waitForTimeout(100);
  await expect(page.locator('body')).not.toHaveClass(/hero-live|hero-loading/);
  expect(await page.evaluate(() => Boolean((window as unknown as { __hero?: unknown }).__hero))).toBe(false);
  expect(await page.evaluate(() => (window as unknown as {
    __heroLifecycle?: { phase: string; contextLost: boolean };
  }).__heroLifecycle)).toMatchObject({ phase: 'context-lost', contextLost: true });
});

test('content stays readable when the interaction script fails to load', async ({ page }) => {
  // The baked cards are a usable no-JS fallback. The runtime replaces them
  // with the synchronized release highlights when it is available.
  await page.route('**/assets/main.js', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/no-js/, { timeout: 6_000 });
  await expect(page.locator('html')).toHaveClass(/js-ready/);
  expect(await page.evaluate(() => ({
    ready: (window as unknown as { __PENDULUM_MAIN_READY?: boolean }).__PENDULUM_MAIN_READY,
    watchdog: (window as unknown as { __PENDULUM_MAIN_WATCHDOG?: number }).__PENDULUM_MAIN_WATCHDOG
  }))).toEqual({ ready: undefined, watchdog: 0 });
  await expect(page.locator('#validation .sec-head')).toBeVisible();
  await expect(page.locator('#validation .sec-head')).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-changelog-list] .changelog-card')).toHaveCount(3);
  await expect(page.locator('[data-changelog-list] .changelog-card').first()).toContainText(/\S/);
  await expect(page.locator('.orbit-controls')).toBeHidden();
  await page.unroute('**/assets/main.js');
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'assets/main.js?late-watchdog-recovery=1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('late main.js recovery failed'));
    document.head.appendChild(script);
  }));
  await expect(page.locator('html')).not.toHaveClass(/no-js/);
  await expect(page.locator('#validation .sec-head')).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => (window as unknown as {
    __PENDULUM_MAIN_READY?: boolean;
  }).__PENDULUM_MAIN_READY)).toBe(true);
});

test('expired or malformed evidence is fail-closed and visibly labelled', async ({ page }) => {
  // The baked static copy equals the committed evidence summary
  // (scripts/check-static-assets.mjs pins that), so the fail-closed
  // expectation is derived from the same file instead of hardcoded.
  const committed = JSON.parse(
    await readFile(new URL('../assets/evidence-summary.json', import.meta.url), 'utf8')
  ) as { tests: { total: number } };
  const staticCount = new Intl.NumberFormat('en-US').format(committed.tests.total);

  await page.route('**/assets/evidence-summary.json', async (route) => {
    const response = await route.fetch();
    const summary = await response.json();
    summary.tests.total = 9999;
    summary.tests.passed = 9999;
    summary.provenance.expiresAt = '2000-01-01T00:00:00.000Z';
    if (summary.claimEvidence) {
      summary.claimEvidence.evidenceExpiresAt = summary.provenance.expiresAt;
      for (const claim of summary.claimEvidence.claims ?? []) claim.validUntil = summary.provenance.expiresAt;
    }
    await route.fulfill({ response, json: summary });
  });
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/evidence-stale/);
  await expect(page.locator('[data-evidence-freshness]')).toContainText('Evidence expired');
  await expect(page.locator('[data-evidence="tests.formatted"]')).toHaveText(staticCount);

  await page.unroute('**/assets/evidence-summary.json');
  await page.route('**/assets/evidence-summary.json', async (route) => {
    const response = await route.fetch();
    const summary = await response.json();
    summary.claimEvidence = { schemaVersion: 'pendulum-claim-evidence-surface/v1', loadState: 'loaded', claims: [] };
    await route.fulfill({ response, json: summary });
  });
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/evidence-invalid/);
  await expect(page.locator('[data-evidence-freshness]')).toContainText('Evidence unavailable');
  await expect(page.locator('body')).toHaveAttribute('data-claim-evidence', 'unavailable');
  await expect(page.locator('[data-evidence="tests.formatted"]')).toHaveText('withheld');
  const withheldStatuses = await page.locator('[data-claim-status]').allTextContents();
  expect(withheldStatuses.length).toBeGreaterThanOrEqual(6);
  expect(new Set(withheldStatuses)).toEqual(new Set(['withheld']));
});

test('canonical claim evidence independently withholds only the affected quantified claim', async ({ page }) => {
  const committed = JSON.parse(
    await readFile(new URL('../assets/evidence-summary.json', import.meta.url), 'utf8')
  );
  const claimIds = [
    'tests.unit',
    'validation.scipy.regular',
    'testing.mutation',
    'benchmark.energy.methods',
    'gpu.vendor-matrix',
    'publication.release'
  ];
  const levels: Record<string, string> = {
    'tests.unit': 'validated',
    'validation.scipy.regular': 'validated',
    'testing.mutation': 'measured',
    'benchmark.energy.methods': 'withheld',
    'gpu.vendor-matrix': 'measured',
    'publication.release': 'informational'
  };
  const expiresAt = '2099-01-01T00:00:00.000Z';
  const counts = { withheld: 0, informational: 0, measured: 0, validated: 0, 'publication-ready': 0 };
  for (const level of Object.values(levels)) counts[level as keyof typeof counts] += 1;
  const rawClaims = new Map(committed.claims.map((claim: { id: string }) => [claim.id, claim]));

  await page.route('**/assets/evidence-summary.json', async (route) => {
    const response = await route.fetch();
    const summary = await response.json();
    summary.provenance.expiresAt = expiresAt;
    summary.tests = { ...summary.tests, total: 777, passed: 777, failed: 0, success: true };
    summary.energy = {
      ...summary.energy,
      profiledMethods: 999,
      bestMethod: 'must-not-render',
      bestMaxRelativeDrift: 0.123
    };
    summary.claimEvidence = {
      schemaVersion: 'pendulum-claim-evidence-surface/v1',
      loadState: 'loaded',
      evidenceSourceCommit: summary.provenance.sourceCommit,
      evidenceExpiresAt: expiresAt,
      counts,
      claims: claimIds.map((id) => ({
        id,
        effectiveVisibleLevel: levels[id],
        validUntil: expiresAt,
        displayValue: levels[id] === 'withheld'
          ? null
          : String((rawClaims.get(id) as { displayValue?: string } | undefined)?.displayValue ?? ''),
        caveats: [`${id} fixture caveat`]
      }))
    };
    await route.fulfill({ response, json: summary });
  });

  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-claim-evidence', 'canonical');
  await expect(page.locator('[data-claim-status="tests.unit"]')).toHaveText('validated');
  await expect(page.locator('[data-evidence="tests.formatted"]')).toHaveText('777');
  await expect(page.locator('[data-claim-status="benchmark.energy.methods"]')).toHaveText('withheld');
  for (const key of ['energy.profileLabel', 'energy.bestMethod']) {
    const values = await page.locator(`[data-evidence="${key}"]`).allTextContents();
    expect(values.length, key).toBeGreaterThan(0);
    expect(new Set(values), key).toEqual(new Set(['withheld']));
  }
  const structuredClaims = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => {
    const graph = scripts.flatMap((script) => JSON.parse(script.textContent || '{}')['@graph'] || []);
    const source = graph.find((entry) => entry['@type'] === 'SoftwareSourceCode');
    return Object.fromEntries((source?.additionalProperty || []).map((property) => [property.propertyID, property.value]));
  });
  expect(structuredClaims).toMatchObject({
    'tests.unit': 'validated',
    'benchmark.energy.methods': 'withheld',
    'publication.release': 'informational'
  });
  await expect(page.locator('[data-claim-status="publication.release"]')).toHaveText('informational');
  await expect(page.locator('[data-evidence-freshness]')).toContainText('1 withheld');
});

test('mobile launch CTA stays inside the viewport', async ({ page }) => {
  for (const width of [280, 320, 390]) {
    await page.setViewportSize({ width, height: 780 });
    await page.goto('/');
    const box = await page.locator('.nav-launch').boundingBox();
    expect(box).toBeTruthy();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    const layout = await page.evaluate(() => {
      const heading = document.querySelector('h1')?.getBoundingClientRect();
      const hero = document.querySelector('.hero')?.getBoundingClientRect();
      const clientWidth = document.documentElement.clientWidth;
      const amount = document.documentElement.scrollWidth - window.innerWidth;
      const headerItems = Array.from(document.querySelectorAll('.brand, #lang-toggle, .nav-launch, .nav-menu > summary')).map((element) => {
        const rect = element.getBoundingClientRect();
        return { label: element.getAttribute('aria-label') || element.className, left: rect.left, right: rect.right };
      });
      return {
        clientWidth,
        amount,
        heading: heading ? { left: heading.left, right: heading.right } : null,
        heroHeight: hero?.height ?? 0,
        headerItems,
        brandNameVisible: Boolean(document.querySelector('.brand .name')?.getClientRects().length),
        offenders: amount > 0
          ? Array.from(document.querySelectorAll('*')).map((element) => {
            const rect = element.getBoundingClientRect();
            return { tag: element.tagName, id: element.id, className: String(element.className || ''), left: rect.left, right: rect.right, width: rect.width };
          }).filter((item) => item.left < -0.5 || item.right > window.innerWidth + 0.5).slice(0, 12)
          : []
      };
    });
    expect(layout.amount, JSON.stringify(layout.offenders, null, 2)).toBeLessThanOrEqual(0);
    expect(layout.heading?.left ?? -1).toBeGreaterThanOrEqual(0);
    expect(layout.heading?.right ?? width + 1).toBeLessThanOrEqual(width);
    expect(layout.heroHeight).toBeLessThanOrEqual(975);
    for (const item of layout.headerItems) {
      expect(item.left, item.label).toBeGreaterThanOrEqual(0);
      expect(item.right, item.label).toBeLessThanOrEqual(layout.clientWidth);
    }
    expect(layout.brandNameVisible).toBe(layout.clientWidth > 320);
    await expect(page.locator('nav .brand')).toHaveAccessibleName('Pendulum Lab home');
  }
});

test('mini lab controls reset the trajectory and update the app state link', async ({ page }) => {
  test.setTimeout(180_000);
  const enhancementRequests: string[] = [];
  let releaseOrbitModule: () => void = () => undefined;
  let signalOrbitRequest: () => void = () => undefined;
  const orbitModuleGate = new Promise<void>((resolve) => { releaseOrbitModule = resolve; });
  const orbitModuleRequested = new Promise<void>((resolve) => { signalOrbitRequest = resolve; });
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/\/assets\/orbit-console\.js$/.test(pathname)) {
      enhancementRequests.push(pathname);
    }
  });
  await page.route('**/assets/orbit-console.js', async (route) => {
    const response = await route.fetch();
    signalOrbitRequest();
    await orbitModuleGate;
    await route.fulfill({ response });
  });
  // The 3D hero now stays deferred on the default route, so the mini lab can
  // be exercised without the screenshot-only capture flag forcing it static.
  await page.goto('/');
  await page.waitForTimeout(500);
  expect(enhancementRequests).toEqual([]);
  const theta = page.locator('[data-orbit-control="theta"]');
  const thetaTwo = page.locator('[data-orbit-control="thetaTwo"]');
  const separation = page.locator('[data-orbit-control="separation"]');
  const damping = page.locator('[data-orbit-control="damping"]');
  await expect(page.locator('.console-readout').filter({ has: page.locator('[data-orbit-readout="separation"]') }).locator('span')).toHaveText('|Δθ₁(t)|');
  await expect(page.locator('.console-readout').filter({ has: page.locator('[data-orbit-readout="drift"]') }).locator('span')).toHaveText('screen gap');
  await expect(theta).toHaveValue('2.18');
  await expect(thetaTwo).toHaveValue('2.64');
  await expect(theta).toHaveAttribute('step', 'any');
  await expect(thetaTwo).toHaveAttribute('step', 'any');
  await expect(separation).toHaveAttribute('step', 'any');
  await expect(damping).toHaveAttribute('step', 'any');
  await page.evaluate(() => {
    const runtime = window as unknown as {
      __orbitReplayOrder?: string[];
      __stopOrbitReplayLog?: () => void;
      __landingEnhancements?: { orbitReady: boolean };
    };
    runtime.__orbitReplayOrder = [];
    const listeners = ['reset', 'toggle'].map((action) => {
      const selector = action === 'reset' ? '[data-orbit-reset]' : '[data-orbit-toggle]';
      const button = document.querySelector(selector);
      const listener = () => {
        if (runtime.__landingEnhancements?.orbitReady) runtime.__orbitReplayOrder?.push(action);
      };
      button?.addEventListener('click', listener);
      return { button, listener };
    });
    runtime.__stopOrbitReplayLog = () => listeners.forEach(({ button, listener }) => {
      button?.removeEventListener('click', listener);
    });
  });
  const landingUrlBeforeBlockedLaunch = page.url();
  const directTheta = page.locator('[data-orbit-number="theta"]');
  await directTheta.fill('2.1250000000000004');
  await orbitModuleRequested;
  await thetaTwo.evaluate((input) => {
    const range = input as HTMLInputElement;
    range.value = '2.65123456789';
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const launch = page.locator('[data-orbit-launch]');
  const next = page.locator('[data-orbit-next]');
  await expect(launch).toHaveAttribute('aria-disabled', 'true');
  await expect(launch).toHaveAttribute('aria-busy', 'true');
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('[data-orbit-state-status]')).toHaveText('Preparing the exact setup for the Lab link…');
  await launch.dispatchEvent('click');
  expect(page.url()).toBe(landingUrlBeforeBlockedLaunch);
  await page.locator('#console').scrollIntoViewIfNeeded();
  const queuedToggle = page.locator('[data-orbit-toggle]');
  await queuedToggle.dispatchEvent('click');
  await queuedToggle.dispatchEvent('click');
  await page.locator('[data-orbit-reset]').dispatchEvent('click');
  await queuedToggle.dispatchEvent('click');
  releaseOrbitModule();
  await page.waitForFunction(() => Boolean((window as unknown as {
    __landingEnhancements?: { orbitReady: boolean };
  }).__landingEnhancements?.orbitReady), null, { timeout: 20_000 });
  await expect(launch).not.toHaveAttribute('aria-disabled', 'true');
  await expect(launch).not.toHaveAttribute('aria-busy', 'true');
  await expect(next).not.toHaveAttribute('aria-disabled', 'true');
  expect(new URL(await launch.getAttribute('href') ?? '').searchParams.get('th1')).toBe('2.1250000000000004');
  expect(new URL(await launch.getAttribute('href') ?? '').searchParams.get('th2')).toBe('2.65123456789');
  // Range controls serialize the same IEEE-754 value differently across
  // engines; the direct field and href below are the canonical contract.
  expect(Number(await theta.inputValue())).toBeCloseTo(2.1250000000000004, 14);
  await expect(directTheta).toHaveValue('2.1250000000000004');
  await expect(thetaTwo).toHaveValue('2.65123456789');
  await page.waitForFunction(() => Boolean((window as unknown as {
    __orbitConsolePainted?: boolean;
  }).__orbitConsolePainted), null, { timeout: 5_000 });
  expect(enhancementRequests.filter((path) => path.endsWith('/orbit-console.js'))).toHaveLength(1);
  expect(await page.evaluate(() => (window as unknown as {
    __orbitReplayOrder?: string[];
  }).__orbitReplayOrder)).toEqual(['toggle', 'toggle', 'reset', 'toggle']);
  await expect(queuedToggle).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => (window as unknown as {
    __stopOrbitReplayLog?: () => void;
  }).__stopOrbitReplayLog?.());
  await queuedToggle.dispatchEvent('click');
  await expect(queuedToggle).toHaveAttribute('aria-pressed', 'false');
  await page.unroute('**/assets/orbit-console.js');
  await expect(page.locator('#console .console-copy')).toHaveClass(/is-visible/);
  const angleUnit = page.locator('[data-orbit-unit]');
  await expect(theta).toHaveAttribute('data-orbit-keyboard-step', '0.01');
  await theta.focus();
  await page.keyboard.press('ArrowRight');
  await expect(theta).toHaveValue('2.135');
  await expect(directTheta).toHaveValue('2.135');
  await page.locator('[data-orbit-number="theta"]').fill('2.0943951023931953');
  await angleUnit.selectOption('deg');
  await expect(theta).toHaveAttribute('step', 'any');
  await expect(theta).toHaveAttribute('data-orbit-keyboard-step', '0.1');
  await expect(separation).toHaveAttribute('data-orbit-keyboard-step', '0.001');
  await page.locator('[data-orbit-number="thetaTwo"]').fill('120');
  await page.locator('[data-orbit-number="separation"]').fill('0.005729577951308232');
  await page.locator('[data-orbit-number="damping"]').fill('0.3');
  await expect(page.locator('[data-orbit-output="theta"]')).toHaveText('120 deg');
  await expect(page.locator('[data-orbit-output="thetaTwo"]')).toHaveText('120 deg');
  await expect(page.locator('[data-orbit-output="separation"]')).toHaveText('5.729578e-3 deg');
  await expect(page.locator('[data-orbit-output="damping"]')).toHaveText('0.3');
  await expect(theta).toHaveAttribute('aria-valuetext', '120 degrees');
  await expect(thetaTwo).toHaveAttribute('aria-valuetext', '120 degrees');
  await expect(separation).toHaveAttribute('aria-valuetext', '5.729578e-3 degrees');
  await expect(damping).toHaveAttribute('aria-valuetext', '0.3 damping');
  await expect(page.locator('[data-orbit-caption="separation"]')).toHaveText('5.729578e-3 deg apart');
  await expect(page.locator('[data-orbit-number="separation"]')).toHaveValue('0.005729577951308232');
  await expect(page.locator('[data-orbit-state="reference"]')).toContainText('θ₁ 120 deg (2.0943951023931953 rad)');
  await expect(page.locator('[data-orbit-state="perturbed"]')).toContainText('θ₁ 120.005729577951 deg (2.0944951023931955 rad)');

  const launchUrl = new URL(await page.locator('[data-orbit-launch]').getAttribute('href') ?? '');
  const nextUrl = new URL(await page.locator('[data-orbit-next]').getAttribute('href') ?? '');
  const expectedHandoff = {
    experiment: 'sensitive-dependence',
    experimentSchema: 'pendulum-sensitive-dependence/v1',
    workflowStep: 'measure',
    trajectoryStage: 'perturbed',
    angleUnit: 'deg',
    perturbationVar: 'th1',
    perturbationPattern: 'symmetric',
    perturbationSeed: '20260826',
    deltaTheta: '0.0001',
    ensembleCount: '12',
    th1: '2.0943951023931953',
    th2: '2.0943951023931953',
    iw1: '0',
    iw2: '0',
    gamma: '0.3',
    method: 'rk4',
    dt: '0.001'
  };
  for (const [name, value] of Object.entries(expectedHandoff)) {
    expect(launchUrl.searchParams.get(name), `primary handoff ${name}`).toBe(value);
    expect(nextUrl.searchParams.get(name), `next-step handoff ${name}`).toBe(value);
    if (!['iw1', 'iw2'].includes(name)) {
      expect(new URL(page.url()).searchParams.get(name), `Landing continuity ${name}`).toBe(value);
    }
  }
  expect(launchUrl.searchParams.get('audience')).toBe('beginner');
  expect(nextUrl.searchParams.get('audience')).toBe('student');
  const languageUrl = new URL(await page.locator('#lang-toggle').getAttribute('href') ?? '', page.url());
  expect(languageUrl.searchParams.get('deltaTheta')).toBe('0.0001');
  expect(languageUrl.searchParams.get('th2')).toBe('2.0943951023931953');
  await page.locator('[data-orbit-reset]').dispatchEvent('click');
  const state = await page.evaluate(() => (window as unknown as {
    __orbitConsoleState?: {
      angleUnit: string;
      initialTheta: number;
      initialThetaTwo: number;
      initialSeparation: number;
      damping: number;
      method: string;
      dt: number;
      reference: number[];
      perturbed: number[];
    };
  }).__orbitConsoleState);
  expect(state).toMatchObject({
    angleUnit: 'deg',
    initialTheta: 2.0943951023931953,
    initialThetaTwo: 2.0943951023931953,
    initialSeparation: 0.0001,
    damping: 0.3,
    method: 'rk4',
    dt: 0.001,
    reference: [2.0943951023931953, 2.0943951023931953, 0, 0],
    perturbed: [2.0944951023931955, 2.0943951023931953, 0, 0]
  });
  const toggle = page.locator('[data-orbit-toggle]');
  await toggle.dispatchEvent('click');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveText('Resume motion');
  await expect(page.locator('[data-orbit-readout="mode"]')).toHaveText('paused');
  await toggle.dispatchEvent('click');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const quality = await page.evaluate(() => (window as unknown as {
    __orbitConsoleQuality?: { dpr: number; targetFps: number; maxTrail: number }
  }).__orbitConsoleQuality);
  expect(quality?.dpr).toBeLessThanOrEqual(1.6);
  expect(quality?.targetFps).toBeLessThanOrEqual(60);
  expect(quality?.maxTrail).toBeLessThanOrEqual(420);

  const suspendedLifecycle = await page.evaluate(() => {
    const event = new Event('pagehide');
    Object.defineProperty(event, 'persisted', { value: true });
    window.dispatchEvent(event);
    const lifecycle = (window as unknown as {
      __orbitConsoleLifecycle?: { active: boolean; suspended: boolean; pendingWork: boolean; observing: boolean };
    }).__orbitConsoleLifecycle;
    return lifecycle ? {
      active: lifecycle.active,
      suspended: lifecycle.suspended,
      pendingWork: lifecycle.pendingWork,
      observing: lifecycle.observing
    } : null;
  });
  expect(suspendedLifecycle).toEqual({ active: false, suspended: true, pendingWork: false, observing: false });
  await page.evaluate(() => {
    const event = new Event('pageshow');
    Object.defineProperty(event, 'persisted', { value: true });
    window.dispatchEvent(event);
  });
  await page.waitForFunction(() => {
    const lifecycle = (window as unknown as {
      __orbitConsoleLifecycle?: { active: boolean; suspended: boolean };
    }).__orbitConsoleLifecycle;
    return lifecycle?.active === true && lifecycle.suspended === false;
  });
  // One click after rebinding must still produce one state transition; leaked
  // duplicate listeners would toggle twice and leave aria-pressed unchanged.
  await toggle.dispatchEvent('click');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.dispatchEvent('click');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const terminalLifecycle = await page.evaluate(() => {
    const event = new Event('pagehide');
    Object.defineProperty(event, 'persisted', { value: false });
    window.dispatchEvent(event);
    const lifecycle = (window as unknown as {
      __orbitConsoleLifecycle?: { active: boolean; suspended: boolean; pendingWork: boolean; observing: boolean };
    }).__orbitConsoleLifecycle;
    return lifecycle ? {
      active: lifecycle.active,
      suspended: lifecycle.suspended,
      pendingWork: lifecycle.pendingWork,
      observing: lifecycle.observing
    } : null;
  });
  expect(terminalLifecycle).toEqual({ active: false, suspended: true, pendingWork: false, observing: false });

  await page.route('**/assets/orbit-console.js', (route) => route.abort('failed'));
  await page.goto('/');
  await page.locator('#console').scrollIntoViewIfNeeded();
  await expect(page.locator('body')).toHaveClass(/orbit-console-static/, { timeout: 20_000 });
  await expect(page.locator('.orbit-static-fallback')).toBeVisible();
  await expect(page.locator('.orbit-static-fallback')).toHaveAttribute(
    'aria-label',
    'Live trajectory unavailable; showing a static double-pendulum trace.'
  );
  await expect(page.locator('#orbit-console')).toBeHidden();
  await expect(page.locator('.orbit-controls')).toBeHidden();
  await expect(page.locator('[data-orbit-control="theta"]')).toBeDisabled();
  await expect(page.locator('[data-orbit-number="theta"]')).toBeDisabled();
  await expect(page.locator('[data-orbit-unit]')).toBeDisabled();
  await expect(page.locator('[data-orbit-reset]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('[data-orbit-readout="mode"]')).toHaveText('unavailable');
  expect(enhancementRequests.filter((path) => path.endsWith('/orbit-console.js'))).toHaveLength(2);
  await page.evaluate(() => (window as unknown as {
    __landingEnhancements?: { loadOrbitConsole: () => Promise<boolean> };
  }).__landingEnhancements?.loadOrbitConsole());
  expect(enhancementRequests.filter((path) => path.endsWith('/orbit-console.js'))).toHaveLength(2);


});

test('exact experiment URLs restore without precision loss in EN and KO', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const exact = new URLSearchParams({
    experiment: 'sensitive-dependence',
    experimentSchema: 'pendulum-sensitive-dependence/v1',
    workflowStep: 'measure',
    trajectoryStage: 'perturbed',
    angleUnit: 'deg',
    perturbationVar: 'th1',
    deltaTheta: '0.0001',
    th1: '2.0943951023931953',
    th2: '2.0943951023931953',
    gamma: '0.3'
  });

  for (const route of ['/?lang=en', '/ko.html?lang=ko']) {
    await page.goto(`${route}&${exact}`);
    await page.locator('#console').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => Boolean((window as unknown as {
      __landingEnhancements?: { orbitReady: boolean };
    }).__landingEnhancements?.orbitReady));
    await expect(page.locator('[data-orbit-unit]')).toHaveValue('deg');
    await expect(page.locator('[data-orbit-number="theta"]')).toHaveValue('120');
    await expect(page.locator('[data-orbit-number="thetaTwo"]')).toHaveValue('120');
    await expect(page.locator('[data-orbit-number="separation"]')).toHaveValue('0.005729577951308232');
    const launchUrl = new URL(await page.locator('[data-orbit-launch]').getAttribute('href') ?? '');
    for (const [name, value] of exact) {
      expect(launchUrl.searchParams.get(name), `${route} restored ${name}`).toBe(value);
    }
    await expect(page.locator('[data-orbit-state="reference"]')).toContainText('θ₁ 120 deg (2.0943951023931953 rad)');
    await expect(page.locator('[data-orbit-state="perturbed"]')).toContainText('θ₁ 120.005729577951 deg (2.0944951023931955 rad)');
  }
});

test('direct angle entry shares the Lab inclusive ±pi boundary', async ({ page }) => {
  await page.goto('/?lang=en');
  await page.locator('#console').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Boolean((window as unknown as {
    __landingEnhancements?: { orbitReady: boolean };
  }).__landingEnhancements?.orbitReady));
  const theta = page.locator('[data-orbit-number="theta"]');
  const damping = page.locator('[data-orbit-number="damping"]');
  const unit = page.locator('[data-orbit-unit]');
  const originalLaunch = new URL(await page.locator('[data-orbit-launch]').getAttribute('href') ?? '');
  await theta.fill('');
  await expect(theta).toHaveAttribute('aria-invalid', 'true');
  expect(new URL(await page.locator('[data-orbit-launch]').getAttribute('href') ?? '').searchParams.get('th1')).toBe(
    originalLaunch.searchParams.get('th1')
  );
  await theta.fill(originalLaunch.searchParams.get('th1') ?? '2.18');
  await damping.fill('');
  await expect(damping).toHaveAttribute('aria-invalid', 'true');
  const clearedLaunch = new URL(await page.locator('[data-orbit-launch]').getAttribute('href') ?? '');
  expect(clearedLaunch.searchParams.get('gamma')).toBe(originalLaunch.searchParams.get('gamma'));
  await theta.fill('3.141592653589793');
  await damping.fill('0.06');
  await expect(theta).not.toHaveAttribute('aria-invalid', 'true');
  expect(new URL(await page.locator('[data-orbit-launch]').getAttribute('href') ?? '').searchParams.get('th1')).toBe('3.141592653589793');
  await theta.fill('3.141592653589794');
  await expect(theta).toHaveAttribute('aria-invalid', 'true');
  expect(new URL(await page.locator('[data-orbit-launch]').getAttribute('href') ?? '').searchParams.get('th1')).toBe('3.141592653589793');

  await unit.selectOption('deg');
  await expect(theta).toHaveAttribute('min', '-180');
  await expect(theta).toHaveAttribute('max', '180');
  await theta.fill('-180');
  await expect(theta).not.toHaveAttribute('aria-invalid', 'true');
  expect(new URL(await page.locator('[data-orbit-launch]').getAttribute('href') ?? '').searchParams.get('th1')).toBe('-3.141592653589793');
  await theta.fill('-180.0000000001');
  await expect(theta).toHaveAttribute('aria-invalid', 'true');
  expect(new URL(await page.locator('[data-orbit-launch]').getAttribute('href') ?? '').searchParams.get('th1')).toBe('-3.141592653589793');

  await unit.selectOption('rad');
  const separation = page.locator('[data-orbit-number="separation"]');
  await separation.fill('0.0000001');
  await expect(separation).not.toHaveAttribute('aria-invalid', 'true');
  expect(new URL(await page.locator('[data-orbit-launch]').getAttribute('href') ?? '').searchParams.get('deltaTheta')).toBe('1e-7');
  await separation.fill('0.000000099999');
  await expect(separation).toHaveAttribute('aria-invalid', 'true');
  await separation.fill('0.0100000001');
  await expect(separation).toHaveAttribute('aria-invalid', 'true');
  expect(new URL(await page.locator('[data-orbit-launch]').getAttribute('href') ?? '').searchParams.get('deltaTheta')).toBe('1e-7');
});

test('capture mode freezes motion and produces a repeatable hero frame', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  async function capture() {
    await page.goto('/?captureHero=1', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean((window as unknown as { __heroPainted?: boolean }).__heroPainted)
      || document.body.classList.contains('no-webgl'), null, { timeout: 45_000 });
    await page.waitForFunction(() => /\d/.test(document.querySelector('[data-evidence="tests.formatted"]')?.textContent ?? ''));
    await page.evaluate(async () => {
      await document.fonts.ready;
      (window as unknown as { __hero?: { pause(): void } }).__hero?.pause();
    });
    const hiddenReveal = await page.locator('#validation .reveal').first().evaluate((element) => getComputedStyle(element).opacity);
    expect(hiddenReveal).toBe('1');
    const screenshot = await page.screenshot({ animations: 'disabled', clip: { x: 0, y: 0, width: 1200, height: 720 } });
    const frame = await page.locator('#hero-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL('image/png'));
    return { screenshot, frame };
  }
  await page.setViewportSize({ width: 1200, height: 720 });
  const first = await capture();
  const second = await capture();
  expect(first.screenshot.byteLength).toBeGreaterThan(20_000);
  expect(second.screenshot.byteLength).toBeGreaterThan(20_000);
  expect(first.frame).toBe(second.frame);
  if (testInfo.project.name === 'chromium') {
    expect(first.screenshot).toMatchSnapshot('landing-hero-1200x720.png', { maxDiffPixelRatio: 0.08 });
  }
});

for (const route of ['/', '/ko.html?lang=ko']) {
  test(`axe scan has no moderate-or-higher violations: ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const blocking = result.violations.filter((violation) => violation.impact === 'moderate' || violation.impact === 'serious' || violation.impact === 'critical');
    expect(blocking, blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
  });
}

test('discovery metadata and Lab launch contracts stay canonical across EN and KO', async ({ page }) => {
  const evidence = JSON.parse(await readFile(new URL('../assets/evidence-summary.json', import.meta.url), 'utf8')) as {
    generatedAt: string;
    tests: { total: number };
  };
  const evidenceDay = evidence.generatedAt.slice(0, 10);
  expect(evidenceDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const variants = [
    {
      file: new URL('../index.html', import.meta.url),
      route: '/?lang=en',
      lang: 'en',
      canonical: 'https://elliotjung.github.io/pendulum-landing/',
      locale: 'en_US'
    },
    {
      file: new URL('../ko.html', import.meta.url),
      route: '/ko.html?lang=ko',
      lang: 'ko',
      canonical: 'https://elliotjung.github.io/pendulum-landing/ko.html',
      locale: 'ko_KR'
    }
  ] as const;

  for (const variant of variants) {
    const raw = await readFile(variant.file, 'utf8');
    const rawContracts = await page.evaluate((markup) => {
      const doc = new DOMParser().parseFromString(markup, 'text/html');
      return [...doc.querySelectorAll<HTMLAnchorElement>('a[data-app-link]')].map((anchor) => ({
        href: anchor.getAttribute('href') || '',
        goal: anchor.dataset.ctaGoal || '',
        persona: anchor.dataset.ctaPersona || '',
        content: anchor.dataset.utmContent || ''
      }));
    }, raw);
    expect(rawContracts.length).toBeGreaterThanOrEqual(10);
    for (const contract of rawContracts) {
      const url = new URL(contract.href);
      expect(url.searchParams.get('goal')).toBe(contract.goal);
      expect(url.searchParams.get('audience')).toBe(contract.persona);
      expect(url.searchParams.get('lang')).toBe(variant.lang);
      expect(url.searchParams.get('tab')).toBeTruthy();
      expect(contract.content).toMatch(/^[a-z][a-z0-9-]+$/);
    }

    await page.goto(variant.route);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', variant.canonical);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', variant.canonical);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', variant.locale);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index,follow/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      'href',
      'https://elliotjung.github.io/pendulum-landing/'
    );
    await expect(page.locator('link[rel="alternate"][hreflang="ko"]')).toHaveAttribute(
      'href',
      'https://elliotjung.github.io/pendulum-landing/ko.html'
    );
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      'href',
      'https://elliotjung.github.io/pendulum-landing/'
    );

    const hydratedContracts = await page.locator('a[data-app-link]').evaluateAll((anchors) => anchors.map((anchor) => {
      const element = anchor as HTMLAnchorElement;
      return {
        href: element.href,
        goal: element.dataset.ctaGoal || '',
        persona: element.dataset.ctaPersona || '',
        content: element.dataset.utmContent || ''
      };
    }));
    expect(hydratedContracts).toHaveLength(rawContracts.length);
    for (const contract of hydratedContracts) {
      const url = new URL(contract.href);
      expect(url.searchParams.get('goal')).toBe(contract.goal);
      expect(url.searchParams.get('audience')).toBe(contract.persona);
      expect(url.searchParams.get('lang')).toBe(variant.lang);
      expect(url.searchParams.get('utm_source')).toBe('pendulum-landing');
      expect(url.searchParams.get('utm_medium')).toBe('referral');
      expect(url.searchParams.get('utm_campaign')).toBe('research-lab');
      expect(url.searchParams.get('utm_content')).toBe(contract.content);
      expect(url.searchParams.get('utm_content')).not.toMatch(/^cta-\d+$/);
    }

    const structuredData = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => scripts.map((script) => JSON.parse(script.textContent || '{}')));
    const graph = structuredData.flatMap((entry) => entry['@graph'] || []);
    const datedEntries = graph.filter((entry) => Object.hasOwn(entry, 'dateModified'));
    expect(datedEntries.length).toBeGreaterThanOrEqual(2);
    expect([...new Set(datedEntries.map((entry) => entry.dateModified))]).toEqual([evidenceDay]);
    const webPage = graph.find((entry) => (
      entry['@type'] === 'WebPage'
      && entry['@id'] === `${variant.canonical}#webpage`
      && entry.url === variant.canonical
      && entry.inLanguage === variant.lang
      && entry.dateModified === evidenceDay
    ));
    expect(webPage).toBeTruthy();
    const jsonCount = String(webPage.description).match(/([\d,]+) (?:verified |unit )?tests/)?.[1]
      ?? String(webPage.description).match(/([\d,]+)개 단위 테스트/)?.[1];
    expect(Number.parseInt(jsonCount?.replaceAll(',', '') ?? '', 10)).toBe(evidence.tests.total);
  }
});

test('release highlights and privacy-friendly app attribution hydrate', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-changelog-list] .changelog-card[data-ready="true"]')).toHaveCount(3);
  await expect(page.locator('[data-changelog-source]')).toHaveAttribute('href', /blob\/[a-f0-9]{40}\/CHANGELOG\.md$/);
  await page.goto('/ko.html?lang=ko');
  await expect(page.locator('[data-changelog-list] .changelog-card[data-ready="true"]')).toHaveCount(3);
  await expect(page.locator('[data-changelog-list] .changelog-card').first()).toHaveAttribute('lang', 'ko');
  await expect(page.locator('[data-changelog-list] .changelog-card h3').first()).toHaveText('폴더 이름 변경');
  const links = await page.locator('a[data-app-link]').evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
  expect(links.length).toBeGreaterThan(0);
  for (const href of links) {
    const url = new URL(href);
    expect(url.searchParams.get('utm_source')).toBe('pendulum-landing');
    expect(url.searchParams.get('utm_medium')).toBe('referral');
    expect(url.searchParams.get('utm_campaign')).toBe('research-lab');
  }
});

test('primary local assets and links are available', async ({ page, request }) => {
  await page.goto('/');
  for (const href of [
    'assets/app-preview.png',
    'assets/evidence-summary.json',
    'assets/pendulum-demo-kernel.js',
    'assets/demo-kernel-manifest.json',
    'assets/changelog-highlights.json',
    'assets/favicon-32.png',
    'assets/apple-touch-icon.png',
    'assets/og-card.png',
    'assets/hero-fallback.webp',
    'assets/scene.bundle.js',
    'assets/enhancements-loader.js',
    'robots.txt',
    'sitemap.xml',
    '404.html',
    '_headers'
  ]) {
    const response = await request.get(href);
    expect(response.ok(), href).toBeTruthy();
  }
  await expect(page.locator('.recipe-card[href*="preset=butterfly"]')).toBeVisible();
  const shippedMarkup = await page.locator('html').evaluate((element) => element.outerHTML);
  expect(shippedMarkup).not.toMatch(/reactbits|animation-vendor|cursor-glow/i);
  for (const removedAsset of ['assets/reactbits.js', 'assets/animation-vendor.bundle.js']) {
    expect((await request.get(removedAsset)).status(), removedAsset).toBe(404);
  }
});

test('KO/EN static pages: toggle, translation, app links, persistence', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  // Default is English (Playwright reports an en locale, no stored choice).
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const toggle = page.locator('#lang-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveText('한국어');

  // The toggle navigates to the statically generated Korean page.
  await toggle.click();
  await page.waitForURL(/ko\.html\?lang=ko$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('h1')).toContainText('질서,');
  await expect(page.locator('a', { hasText: '가이드 모드 시작' })).toBeVisible();
  await expect(page.locator('.hero-copy .lede')).toContainText('거의 같은 두 진자');
  await expect(page.locator('[data-hero-toggle-label]')).toHaveText('정적 이미지');
  await expect(page.locator('#orbit-theta')).toHaveAttribute('aria-valuetext', '2.18 라디안');
  await expect(page.locator('#orbit-damping')).toHaveAttribute('aria-valuetext', '감쇠 계수 0.06');
  await expect(page.locator('[data-orbit-toggle]')).toHaveText('동작 줄임');
  // App deep links preload the simulator's Korean menu guide.
  const launchHref = await page.locator('a.nav-launch').getAttribute('href');
  expect(launchHref).toContain('lang=ko');
  await expect(page.locator('#lang-toggle')).toHaveText('English');

  // The choice persists: a bare visit to the root now lands on Korean.
  await page.goto('/').catch(() => undefined);
  await page.waitForURL(/ko\.html(?:#.*)?$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');

  // Switching back to English sticks for the next bare visit.
  await page.locator('#lang-toggle').click();
  await page.waitForURL(/index\.html\?lang=en$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toHaveAccessibleName('Order, undone by chaos.');
  expect(errors).toEqual([]);
});

test.describe('ko-locale first visit', () => {
  test.use({ locale: 'ko-KR' });

  test('redirects to the static Korean page', async ({ page }) => {
    await page.goto('/').catch(() => undefined);
    await page.waitForURL(/ko\.html(?:#.*)?$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await expect(page.locator('h1')).toContainText('질서,');
    await expect(page.locator('.hero-copy .lede')).toContainText('거의 같은 두 진자');
  });
});

test('mobile section menu animates symmetrically and survives rapid reversal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.locator('#nav-menu');
  const summary = menu.locator('summary');
  const panel = menu.locator('.nav-menu-panel');

  await expect(summary).toHaveAttribute('aria-controls', 'nav-menu-panel');
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await summary.click();
  await expect(menu).toHaveAttribute('open', '');
  await expect(menu).toHaveClass(/is-open/);
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();

  await summary.evaluate((element) => {
    element.click();
    element.click();
    element.click();
  });
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).not.toHaveClass(/is-(?:opening|open|closing)/);

  await summary.click();
  await expect(menu).toHaveClass(/is-open/);
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(summary).toBeFocused();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await summary.click();
  await expect(menu).toHaveClass(/is-open/);
  await summary.click();
  await expect(menu).not.toHaveAttribute('open', '');

  await page.setViewportSize({ width: 800, height: 844 });
  await summary.click();
  await expect(menu).toHaveAttribute('open', '');
  await page.setViewportSize({ width: 1024, height: 844 });
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 800, height: 844 });
  await expect(menu).not.toHaveAttribute('open', '');
});

test('shared demo kernel matches main rhsDouble fixtures', async ({ page }) => {
  await page.goto('/');
  const rows = await page.evaluate(async () => {
    const kernel = await import('/assets/pendulum-demo-kernel.js');
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    const values = [[0.2, -0.3, 0.4, -0.5], [2.18, 2.64, 0, 0]].map((state) => {
      const out = [0, 0, 0, 0];
      kernel.rhsDoubleInto(state, out, params);
      return out;
    });
    const damped = [0, 0, 0, 0];
    kernel.rhsDoubleInto([0.2, -0.3, 0.4, -0.5], damped, { ...params, damping: 0.25 });
    return { version: kernel.DEMO_KERNEL_VERSION, values, damped };
  });
  const expected = [
    [0.4, -0.5, -5.390276136585902, 7.706173654766009],
    [0, 0, -9.910597545905812, 4.163545829940606]
  ];
  expect(rows.version).toBe('pendulum-demo-kernel/v3');
  rows.values.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    expect(value).toBeCloseTo(expected[rowIndex]![columnIndex]!, 12);
  }));
  const expectedDamped = [0.4, -0.5, -5.560783122657057, 7.9808076124225416];
  rows.damped.forEach((value, index) => expect(value).toBeCloseTo(expectedDamped[index]!, 12));
});
