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
    const pixels = new Uint8Array(16 * 16 * 4);
    const probes = [[0.42, 0.5], [0.56, 0.32], [0.66, 0.5], [0.76, 0.68], [0.86, 0.42]];
    for (const [x, y] of probes) {
      gl.readPixels(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
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
    __hero?: { scrollPose: { rotationY: number } };
  }).__hero?.scrollPose.rotationY ?? 0);
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
      __hero?: { scrollPose: { rotationY: number } };
    }).__hero?.scrollPose.rotationY ?? 0)) - rotationBeforeDrag
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

test('scrolling through phase descent rotates and lowers the live 3D sculpture', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.locator('[data-hero-toggle]').click();
  await page.waitForFunction(() => document.body.classList.contains('hero-live')
    || document.body.classList.contains('no-webgl'), null, { timeout: 45_000 });
  test.skip(await page.locator('body').evaluate((body) => body.classList.contains('no-webgl')), 'WebGL2 is unavailable');
  const initial = await page.evaluate(() => (window as unknown as {
    __hero?: { scrollPose: { progress: number; rotationY: number; y: number } }
  }).__hero?.scrollPose);
  expect(initial).toBeTruthy();
  await page.locator('[data-orbit-beat="2"]').scrollIntoViewIfNeeded();
  await page.waitForFunction((start) => {
    const runtime = window as unknown as {
      __orbitScrollProgress?: number;
      __hero?: { scrollPose: { progress: number; rotationY: number; y: number } };
    };
    const pose = runtime.__hero?.scrollPose;
    return Boolean(
      pose
      && (runtime.__orbitScrollProgress ?? 0) > 0.4
      && pose.progress > start.progress
      && Math.abs(pose.rotationY - start.rotationY) > 2
      && pose.y < start.y - 0.5
    );
  }, initial!, { timeout: 45_000 });
  await expect(page.locator('body')).toHaveClass(/orbit-descent-active/);
  await expect(page.locator('body')).toHaveClass(/hero-scene-active/);
  await expect(page.locator('.descent-beat[aria-current="step"]')).toHaveCount(1);
  const final = await page.evaluate(() => (window as unknown as {
    __hero?: { scrollPose: { progress: number; rotationY: number; y: number } }
  }).__hero?.scrollPose);
  expect(final?.progress ?? 0).toBeGreaterThan(initial?.progress ?? 0);
  expect(Math.abs((final?.rotationY ?? 0) - (initial?.rotationY ?? 0))).toBeGreaterThan(2);
  expect(final?.y ?? 0).toBeLessThan((initial?.y ?? 0) - 0.5);
  await expect(page.locator('[data-descent-coordinate]')).not.toHaveText('2.34 / 2.72');
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
    await route.fulfill({ response, json: summary });
  });
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/evidence-stale/);
  await expect(page.locator('[data-evidence-freshness]')).toContainText('Evidence expired');
  await expect(page.locator('[data-evidence="tests.formatted"]')).toHaveText(staticCount);

  await page.unroute('**/assets/evidence-summary.json');
  await page.route('**/assets/evidence-summary.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ schemaVersion: 'unexpected/v99', tests: { total: 9999, passed: 9999 } })
  }));
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/evidence-invalid/);
  await expect(page.locator('[data-evidence-freshness]')).toContainText('Evidence unavailable');
  await expect(page.locator('[data-evidence="tests.formatted"]')).toHaveText(staticCount);
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
  await page.locator('#console').scrollIntoViewIfNeeded();
  await orbitModuleRequested;
  const queuedToggle = page.locator('[data-orbit-toggle]');
  await queuedToggle.dispatchEvent('click');
  await queuedToggle.dispatchEvent('click');
  await page.locator('[data-orbit-reset]').dispatchEvent('click');
  await queuedToggle.dispatchEvent('click');
  releaseOrbitModule();
  await page.waitForFunction(() => Boolean((window as unknown as {
    __landingEnhancements?: { orbitReady: boolean };
  }).__landingEnhancements?.orbitReady), null, { timeout: 20_000 });
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
  const theta = page.locator('[data-orbit-control="theta"]');
  const separation = page.locator('[data-orbit-control="separation"]');
  const damping = page.locator('[data-orbit-control="damping"]');
  await theta.evaluate((input: HTMLInputElement) => { input.value = '2.40'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await separation.evaluate((input: HTMLInputElement) => { input.value = '0.0045'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await damping.evaluate((input: HTMLInputElement) => { input.value = '0.30'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('[data-orbit-output="theta"]')).toHaveText('2.40 rad');
  await expect(page.locator('[data-orbit-output="separation"]')).toHaveText('4.5e-3 rad');
  await expect(page.locator('[data-orbit-output="damping"]')).toHaveText('0.30');
  await expect(theta).toHaveAttribute('aria-valuetext', '2.40 radians');
  await expect(separation).toHaveAttribute('aria-valuetext', '4.5e-3 radians');
  await expect(damping).toHaveAttribute('aria-valuetext', '0.30 damping');
  await expect(page.locator('[data-orbit-caption="separation"]')).toHaveText('4.5e-3 rad apart');
  const href = await page.locator('[data-orbit-launch]').getAttribute('href');
  expect(href).toContain('th1=2.40');
  expect(href).toContain('gamma=0.30');
  await page.locator('[data-orbit-reset]').dispatchEvent('click');
  const state = await page.evaluate(() => (window as unknown as {
    __orbitConsoleState?: { initialTheta: number; initialSeparation: number; damping: number };
  }).__orbitConsoleState);
  expect(state).toEqual({ initialTheta: 2.4, initialSeparation: 0.0045, damping: 0.3 });
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
  await expect(page.locator('[data-orbit-reset]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('[data-orbit-readout="mode"]')).toHaveText('unavailable');
  expect(enhancementRequests.filter((path) => path.endsWith('/orbit-console.js'))).toHaveLength(2);
  await page.evaluate(() => (window as unknown as {
    __landingEnhancements?: { loadOrbitConsole: () => Promise<boolean> };
  }).__landingEnhancements?.loadOrbitConsole());
  expect(enhancementRequests.filter((path) => path.endsWith('/orbit-console.js'))).toHaveLength(2);


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
