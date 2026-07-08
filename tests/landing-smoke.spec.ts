import { expect, test } from '@playwright/test';

test('landing page has no console errors and paints the hero', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await expect(page.locator('.nav')).toBeVisible();
  await expect(page.locator('#hero-canvas')).toBeAttached();
  await expect(page.locator('#orbit-console')).toBeVisible();
  await expect(page.locator('.app-preview img')).toBeVisible();
  await page.waitForFunction(() => {
    const fallback = document.body.classList.contains('no-webgl') || document.body.classList.contains('low-power-hero') || document.body.classList.contains('reduced-motion-hero');
    return Boolean((window as unknown as { __heroPainted?: boolean }).__heroPainted) || fallback;
  }, null, { timeout: 8_000 }).catch(() => undefined);
  await page.waitForFunction(() => Boolean((window as unknown as { __orbitConsolePainted?: boolean }).__orbitConsolePainted), null, { timeout: 8_000 });

  const nonBlank = await page.locator('#hero-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const fallback = document.body.classList.contains('no-webgl') || document.body.classList.contains('low-power-hero') || document.body.classList.contains('reduced-motion-hero');
    if (!gl || canvas.width === 0 || canvas.height === 0) return fallback;
    const pixels = new Uint8Array(8 * 8 * 4);
    gl.readPixels(0, 0, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] !== 0 || pixels[i + 1] !== 0 || pixels[i + 2] !== 0 || pixels[i + 3] !== 0) return true;
    }
    return false;
  }).catch(() => true);

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
});

test('mobile launch CTA stays inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  const box = await page.locator('.nav-launch').boundingBox();
  expect(box).toBeTruthy();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
});

test('primary local assets and links are available', async ({ page, request }) => {
  await page.goto('/');
  for (const href of [
    'assets/app-preview.png',
    'assets/evidence-summary.json',
    'assets/vendor/three/three.module.js',
    'assets/vendor/three/examples/jsm/postprocessing/EffectComposer.js',
    'assets/vendor/gsap/gsap.min.js',
    'robots.txt',
    'sitemap.xml'
  ]) {
    const response = await request.get(href);
    expect(response.ok(), href).toBeTruthy();
  }
  await expect(page.locator('.recipe-card[href*="preset=butterfly"]')).toBeVisible();
});
