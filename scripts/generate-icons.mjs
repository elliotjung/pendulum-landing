import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mark = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="5" r="2" fill="#8d99a3"/><path d="M16 7 L22.5 16.5 L18.5 25" fill="none" stroke="#8d99a3" stroke-width="1.35"/><circle cx="22.5" cy="16.5" r="2.2" fill="#75b8c7"/><circle cx="18.5" cy="25" r="2.8" fill="#d2a968"/></svg>`;
const browser = await chromium.launch();
try {
  const favicon = await browser.newPage({ viewport: { width: 32, height: 32 } });
  await favicon.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;background:transparent}svg{display:block;width:32px;height:32px}</style>${mark}`);
  await favicon.locator('svg').screenshot({ path: join(root, 'assets', 'favicon-32.png'), omitBackground: true });

  const apple = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  await apple.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;background:#0b0f14}.tile{width:180px;height:180px;display:grid;place-items:center;border:1px solid #36414b;background:#0b0f14}svg{width:132px;height:132px}</style><div class="tile">${mark}</div>`);
  await apple.locator('.tile').screenshot({ path: join(root, 'assets', 'apple-touch-icon.png') });
} finally {
  await browser.close();
}
console.log('favicon-32.png and apple-touch-icon.png generated');
