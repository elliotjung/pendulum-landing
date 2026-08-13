import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const assets = join(root, 'assets');
const simulatorUrl = new URL(process.env.PENDULUM_SIMULATOR_URL || 'http://127.0.0.1:5173/');
const previewViewport = { width: 1280, height: 820 };
const walkthroughViewport = { width: 1280, height: 720 };

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: previewViewport,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1
  });
  await context.addInitScript(() => {
    localStorage.setItem('pendulum-lab/ui/audience-mode', 'research');
    localStorage.setItem('pendulum-lab/ui/tour-done', '1');
    localStorage.setItem('pendulum-lab/ui/nav-locale', 'en');
  });
  const page = await context.newPage();

  await openWorkspace(page, 'lab');
  await pauseSimulation(page);
  const preview = await page.screenshot({ type: 'png', animations: 'disabled' });
  await Promise.all([
    writeFile(join(assets, 'app-preview.png'), preview),
    sharp(preview).webp({ quality: 88, effort: 6 }).toFile(join(assets, 'app-preview.webp')),
    sharp(preview).resize({ width: 960 }).webp({ quality: 86, effort: 6 }).toFile(join(assets, 'app-preview-960.webp')),
    sharp(preview).resize({ width: 640 }).webp({ quality: 84, effort: 6 }).toFile(join(assets, 'app-preview-640.webp'))
  ]);

  await page.setViewportSize(walkthroughViewport);
  const frames = [];
  for (const tab of ['lab', 'compare', 'lyap', 'phase3d', 'validate']) {
    await openWorkspace(page, tab);
    if (tab === 'lab') await pauseSimulation(page);
    frames.push(await captureWalkthroughFrame(page));
  }
  await page.locator('#trustDrawerToggle').evaluate((button) => button.click());
  await page.locator('#trustDrawer:not([hidden])').waitFor({ state: 'visible' });
  frames.push(await captureWalkthroughFrame(page));

  const frameWidth = 320;
  const frameHeight = 180;
  const rawFrames = await Promise.all(
    frames.map((frame) =>
      sharp(frame)
        .resize(frameWidth, frameHeight, { fit: 'cover', position: 'top' })
        .removeAlpha()
        .raw()
        .toBuffer()
    )
  );
  await sharp(Buffer.concat(rawFrames), {
    raw: {
      width: frameWidth,
      height: frameHeight * rawFrames.length,
      channels: 3,
      pageHeight: frameHeight
    }
  })
    .gif({ loop: 0, delay: rawFrames.map(() => 5000), effort: 8, colours: 128 })
    .toFile(join(assets, 'walkthrough-30s.gif'));

  console.log('Captured simulator preview variants and six-frame walkthrough.');
} finally {
  await browser.close();
}

async function openWorkspace(page, tab) {
  const url = new URL(simulatorUrl);
  url.searchParams.set('audience', 'research');
  url.searchParams.set('tab', tab);
  url.searchParams.set('lang', 'en');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.locator(`#tab-${tab}:not([hidden])`).waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

async function pauseSimulation(page) {
  const pause = page.locator('#pauseBtn');
  if ((await pause.count()) === 1 && (await pause.isEnabled())) {
    const label = (await pause.textContent()) || '';
    if (/pause/i.test(label)) await pause.evaluate((button) => button.click());
  }
}

async function captureWalkthroughFrame(page) {
  return page.screenshot({ type: 'png', animations: 'disabled' });
}
