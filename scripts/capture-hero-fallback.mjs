// Rebuild the static hero poster from the same deterministic Three.js frame
// used by visual tests. This keeps reduced-motion and low-power fallbacks in
// sync with the live instrument instead of maintaining separate artwork.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 4187;
const base = `http://127.0.0.1:${port}`;
const desktopTarget = join(root, 'assets', 'hero-fallback.webp');
const compactTarget = join(root, 'assets', 'hero-fallback-960.webp');
const server = spawn(process.execPath, [join(root, 'scripts', 'static-server.mjs'), String(port)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Static server exited with code ${server.exitCode}.`);
    try {
      const response = await fetch(base, { cache: 'no-store' });
      if (response.ok) return;
    } catch {
      // The server is still binding; retry on the next short interval.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error('Timed out waiting for the fallback capture server.');
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1731, height: 909 },
    deviceScaleFactor: 1,
  });
  await page.goto(`${base}/?captureHero=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__heroPainted)
    || document.body.classList.contains('no-webgl'), null, { timeout: 45_000 });
  if (await page.locator('body').evaluate((body) => body.classList.contains('no-webgl'))) {
    throw new Error('WebGL2 is unavailable in the capture browser.');
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.__hero?.pause?.();
  });
  await page.addStyleTag({ content: `
    html, body { margin: 0 !important; background: #070910 !important; }
    body > :not(#hero-canvas) { visibility: hidden !important; }
    #hero-canvas {
      visibility: visible !important;
      display: block !important;
      opacity: 1 !important;
      background:
        radial-gradient(circle at 72% 34%, rgba(114, 214, 229, .055), transparent 34%),
        radial-gradient(circle at 74% 64%, rgba(139, 124, 246, .045), transparent 38%),
        #070910 !important;
    }
  ` });
  const frame = await page.screenshot({
    type: 'png',
    animations: 'disabled',
    clip: { x: 0, y: 0, width: 1731, height: 909 },
  });
  await sharp(frame).webp({ quality: 84, effort: 6 }).toFile(desktopTarget);
  await sharp(frame).resize(960, 504, { fit: 'cover' }).webp({ quality: 82, effort: 6 }).toFile(compactTarget);
  console.log('written assets/hero-fallback.webp and assets/hero-fallback-960.webp');
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolveExit) => {
      server.once('exit', resolveExit);
      setTimeout(resolveExit, 5_000);
    });
  }
}
