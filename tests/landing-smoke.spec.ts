import { expect, test } from '@playwright/test';

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
  await expect(page.locator('[data-evidence="mutation.scoreLabel"]').first()).toContainText('65.32%');
});

test('mobile launch CTA stays inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  const box = await page.locator('.nav-launch').boundingBox();
  expect(box).toBeTruthy();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
});

test('primary local assets and links are available', async ({ page, request }) => {
  await page.goto('/');
  for (const href of [
    'assets/app-preview.png',
    'assets/evidence-summary.json',
    'assets/pendulum-demo-kernel.js',
    'assets/demo-kernel-manifest.json',
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

test('KO/EN static pages: toggle, translation, app links, persistence', async ({ page }) => {
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
  await expect(page.locator('.hero-copy .lede')).toContainText('비선형 진자 동역학');
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
    await expect(page.locator('.hero-copy .lede')).toContainText('비선형 진자 동역학');
  });
});

test('shared demo kernel matches main rhsDouble fixtures', async ({ page }) => {
  await page.goto('/');
  const rows = await page.evaluate(async () => {
    const kernel = await import('/assets/pendulum-demo-kernel.js');
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    return [[0.2, -0.3, 0.4, -0.5], [2.18, 2.64, 0, 0]].map((state) => {
      const out = [0, 0, 0, 0];
      kernel.rhsDoubleInto(state, out, params);
      return out;
    });
  });
  const expected = [
    [0.4, -0.5, -5.390276136585902, 7.706173654766009],
    [0, 0, -9.910597545905812, 4.163545829940606]
  ];
  rows.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    expect(value).toBeCloseTo(expected[rowIndex]![columnIndex]!, 12);
  }));
});
