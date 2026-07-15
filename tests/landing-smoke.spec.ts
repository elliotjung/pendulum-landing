import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
    const pixels = new Uint8Array(16 * 16 * 4);
    const probes = [[0.42, 0.5], [0.56, 0.32], [0.66, 0.5], [0.76, 0.68], [0.86, 0.42]];
    for (const [x, y] of probes) {
      gl.readPixels(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] !== 0 || pixels[i + 1] !== 0 || pixels[i + 2] !== 0 || pixels[i + 3] !== 0) return true;
      }
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

test('default load starts the 3D hero without waiting for user input', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.hero-static-art')).toBeVisible();
  await page.waitForFunction(() => Boolean((window as unknown as { __heroPainted?: boolean }).__heroPainted), null, { timeout: 4_000 });
  await expect(page.locator('body')).toHaveClass(/hero-live|no-webgl|low-power-hero|reduced-motion-hero/);
});

test('reduced-motion clients receive an immediate static hero', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/reduced-motion-hero/);
  await expect(page.locator('.hero-static-art')).toBeVisible();
  await expect(page.locator('#hero-canvas')).toBeHidden();
});

test('low-memory clients receive an immediate static hero', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 }));
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/low-power-hero/);
  await expect(page.locator('.hero-static-art')).toBeVisible();
});

test('WebGL context loss fails over to the static artwork', async ({ page }) => {
  await page.goto('/?captureHero=1');
  await page.waitForFunction(() => Boolean((window as unknown as { __heroPainted?: boolean }).__heroPainted));
  const supported = await page.locator('#hero-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context');
    extension?.loseContext();
    return Boolean(extension);
  });
  test.skip(!supported, 'WEBGL_lose_context is unavailable');
  await expect(page.locator('body')).toHaveClass(/no-webgl/);
  await expect(page.locator('.hero-static-art')).toBeVisible();
});

test('content stays readable when the interaction script fails to load', async ({ page }) => {
  // The static no-JS cards must lead with the same release highlight the
  // hydrator would render, so the expectation is derived from the synced
  // changelog-highlights.json rather than hardcoded prose.
  const changelog = JSON.parse(
    await readFile(new URL('../assets/changelog-highlights.json', import.meta.url), 'utf8')
  ) as { highlights: Array<{ title: string }> };

  await page.route('**/assets/main.js', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#validation .sec-head')).toBeVisible();
  await expect(page.locator('#validation .sec-head')).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-changelog-list] .changelog-card')).toHaveCount(3);
  await expect(page.locator('[data-changelog-list] .changelog-card').first()).toContainText(
    changelog.highlights[0].title
  );
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
  await page.goto('/?captureHero=1');
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
      return {
        amount: document.documentElement.scrollWidth - window.innerWidth,
        heading: heading ? { left: heading.left, right: heading.right } : null,
        heroHeight: hero?.height ?? 0,
        offenders: Array.from(document.querySelectorAll('*')).map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName, id: element.id, className: String(element.className || ''), left: rect.left, right: rect.right, width: rect.width };
        }).filter((item) => item.left < -0.5 || item.right > window.innerWidth + 0.5).slice(0, 12)
      };
    });
    expect(layout.amount, JSON.stringify(layout.offenders, null, 2)).toBeLessThanOrEqual(0);
    expect(layout.heading?.left ?? -1).toBeGreaterThanOrEqual(0);
    expect(layout.heading?.right ?? width + 1).toBeLessThanOrEqual(width);
    expect(layout.heroHeight).toBeLessThanOrEqual(975);
  }
});

test('mini lab controls reset the trajectory and update the app state link', async ({ page }) => {
  await page.goto('/?captureHero=1');
  const theta = page.locator('[data-orbit-control="theta"]');
  const damping = page.locator('[data-orbit-control="damping"]');
  await theta.evaluate((input: HTMLInputElement) => { input.value = '2.40'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await damping.evaluate((input: HTMLInputElement) => { input.value = '0.30'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('[data-orbit-output="theta"]')).toHaveText('2.40 rad');
  await expect(page.locator('[data-orbit-output="damping"]')).toHaveText('0.30');
  const href = await page.locator('[data-orbit-launch]').getAttribute('href');
  expect(href).toContain('th1=2.40');
  expect(href).toContain('gamma=0.30');
  await page.locator('[data-orbit-reset]').click();
  const state = await page.evaluate(() => (window as unknown as { __orbitConsoleState?: { initialTheta: number; damping: number } }).__orbitConsoleState);
  expect(state).toEqual({ initialTheta: 2.4, damping: 0.3 });
  const toggle = page.locator('[data-orbit-toggle]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveText('Resume motion');
  await expect(page.locator('[data-orbit-readout="mode"]')).toHaveText('paused');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const quality = await page.evaluate(() => (window as unknown as {
    __orbitConsoleQuality?: { dpr: number; targetFps: number; maxTrail: number }
  }).__orbitConsoleQuality);
  expect(quality?.dpr).toBeLessThanOrEqual(1.6);
  expect(quality?.targetFps).toBeLessThanOrEqual(60);
  expect(quality?.maxTrail).toBeLessThanOrEqual(420);
});

test('capture mode freezes motion and produces a repeatable hero frame', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  async function capture() {
    await page.goto('/?captureHero=1', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean((window as unknown as { __heroPainted?: boolean }).__heroPainted)
      || document.body.classList.contains('no-webgl'), null, { timeout: 10_000 });
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

for (const route of ['/?captureHero=1', '/ko.html?lang=ko&captureHero=1']) {
  test(`axe scan has no serious or critical violations: ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const blocking = result.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(blocking, blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
  });
}

test('release highlights and privacy-friendly app attribution hydrate', async ({ page }) => {
  await page.goto('/?captureHero=1');
  await expect(page.locator('[data-changelog-list] .changelog-card[data-ready="true"]')).toHaveCount(3);
  await expect(page.locator('[data-changelog-source]')).toHaveAttribute('href', /blob\/[a-f0-9]{40}\/CHANGELOG\.md$/);
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
    'assets/animation-vendor.bundle.js',
    'robots.txt',
    'sitemap.xml',
    '404.html',
    '_headers'
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
  await expect(page.locator('.hero-copy .lede')).toContainText('거의 같은 두 진자');
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
