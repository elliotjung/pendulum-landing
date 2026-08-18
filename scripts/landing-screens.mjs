// Ad-hoc design-review screenshots (not part of CI): hero, scrolled nav,
// capabilities and validation sections. Usage: node scripts/landing-screens.mjs
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:4177';
const out = 'reports/design-screens';
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/hero-static.png` });

await page.locator('[data-hero-toggle]').click();
await page.waitForFunction(() => document.body.classList.contains('hero-live')
  || document.body.classList.contains('no-webgl'), null, { timeout: 10_000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/hero.png` });

await page.locator('[data-orbit-beat="2"]').scrollIntoViewIfNeeded();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/phase-descent.png` });

await page.locator('#console').scrollIntoViewIfNeeded();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/console.png` });

await page.evaluate(() => document.getElementById('capabilities')?.scrollIntoView());
await page.waitForTimeout(1400);
await page.screenshot({ path: `${out}/capabilities.png` });

await page.evaluate(() => document.getElementById('validation')?.scrollIntoView());
await page.waitForTimeout(1400);
await page.screenshot({ path: `${out}/validation.png` });

await page.evaluate(() => document.getElementById('guide')?.scrollIntoView());
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/guide.png` });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await mobile.goto(base, { waitUntil: 'networkidle' });
await mobile.screenshot({ path: `${out}/mobile-hero.png` });
await mobile.locator('[data-orbit-beat="1"]').scrollIntoViewIfNeeded();
await mobile.waitForTimeout(500);
await mobile.screenshot({ path: `${out}/mobile-descent.png` });

await browser.close();
console.log('written', out);
