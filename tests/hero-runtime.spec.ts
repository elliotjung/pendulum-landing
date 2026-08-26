import { expect, test } from '@playwright/test';

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  await page.evaluate(() => {
    const runtime = window as unknown as {
      __heroLifecycle?: { dispose?: () => void };
      __hero?: { dispose?: () => void };
    };
    runtime.__heroLifecycle?.dispose?.();
    runtime.__hero?.dispose?.();
  }).catch(() => undefined);
});

test('live hero publishes numerical evidence and supports keyboard orbit reset', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The focused WebGL interaction gate runs once in desktop Chromium.');
  test.setTimeout(60_000);
  await page.goto('/');
  await page.locator('[data-hero-toggle]').click();
  await page.waitForFunction(() => document.body.classList.contains('hero-live'), null, {
    timeout: 45_000,
  });

  const canvas = page.locator('#hero-canvas');
  await expect(canvas).toHaveAttribute('role', 'img');
  await expect(canvas).toHaveAttribute('tabindex', '0');
  await expect(canvas).toHaveAccessibleName(/arrow keys|화살표 키/i);
  const resetView = page.locator('[data-hero-view-reset]');
  await expect(resetView).toBeVisible();
  await expect(resetView).toBeEnabled();

  const readPose = () => page.evaluate(() => {
    const hero = (window as unknown as {
      __hero?: {
        scrollPose: { cameraAzimuth: number; cameraElevation: number };
      };
    }).__hero;
    return hero?.scrollPose;
  });
  const start = await readPose();
  expect(start).toBeTruthy();
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((azimuth) => {
    const pose = (window as unknown as {
      __hero?: { scrollPose: { cameraAzimuth: number } };
    }).__hero?.scrollPose;
    return Boolean(pose && Math.abs(pose.cameraAzimuth - Number(azimuth)) > 0.03);
  }, start?.cameraAzimuth);
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction((elevation) => {
    const pose = (window as unknown as {
      __hero?: { scrollPose: { cameraElevation: number } };
    }).__hero?.scrollPose;
    return Boolean(pose && pose.cameraElevation > Number(elevation) + 0.02);
  }, start?.cameraElevation);
  await page.keyboard.press('Home');
  await page.waitForFunction(() => {
    const pose = (window as unknown as {
      __hero?: { scrollPose: { cameraAzimuth: number; cameraElevation: number } };
    }).__hero?.scrollPose;
    return Boolean(
      pose
      && Math.abs(pose.cameraAzimuth) < 0.02
      && Math.abs(pose.cameraElevation - 0.025) < 0.02
    );
  });
  await page.keyboard.press('ArrowRight');
  await resetView.click();
  await page.waitForFunction(() => {
    const pose = (window as unknown as {
      __hero?: { scrollPose: { cameraAzimuth: number; cameraElevation: number } };
    }).__hero?.scrollPose;
    const progress = Math.max(
      0,
      Math.min(1, Number((window as unknown as { __orbitScrollProgress?: number }).__orbitScrollProgress) || 0),
    );
    const eased = progress * progress * (3 - 2 * progress);
    const scrollAzimuth = eased * (120 * Math.PI / 180);
    const scrollElevation = 0.025 + Math.sin(eased * Math.PI) * 0.045;
    return Boolean(
      pose
      && Math.abs(pose.cameraAzimuth - scrollAzimuth) < 0.02
      && Math.abs(pose.cameraElevation - scrollElevation) < 0.02
    );
  });

  const envelope = await page.evaluate(() => (window as unknown as {
    __hero?: {
      numericalEnvelope: {
        checkpointHash: string;
        observedSteps: number;
        maxConstraintError: number;
        maxTangentError: number;
        maxRelativeEnergyDrift: number;
      };
    };
  }).__hero?.numericalEnvelope);
  expect(envelope?.checkpointHash).toMatch(/^[0-9a-f]{8}$/);
  expect(envelope?.observedSteps).toBeGreaterThanOrEqual(1_440);
  expect(envelope?.maxConstraintError).toBeLessThan(1e-10);
  expect(envelope?.maxTangentError).toBeLessThan(1e-11);
  expect(envelope?.maxRelativeEnergyDrift).toBeLessThan(5e-6);
});

test('narrow validation evidence remains keyboard-scrollable instead of clipping', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const board = page.locator('.val-board').first();
  await board.scrollIntoViewIfNeeded();
  await board.focus();
  await expect(board).toBeFocused();
  const before = await board.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    scrollLeft: element.scrollLeft,
  }));
  expect(before.scrollWidth).toBeGreaterThan(before.clientWidth);
  for (let step = 0; step < 8; step += 1) await page.keyboard.press('ArrowRight');
  await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});
