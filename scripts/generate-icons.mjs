import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mark = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="5" r="2.4" fill="#72d6e5"/><path d="M16 6.5 L23 16 L19 25" fill="none" stroke="#72d6e5" stroke-width="1.4" stroke-linecap="round" opacity=".85"/><circle cx="23" cy="16" r="2" fill="#8b7cf6"/><circle cx="19" cy="25" r="2.8" fill="#72d6e5"/></svg>`;
const browser = await chromium.launch();
try {
  const favicon = await browser.newPage({ viewport: { width: 32, height: 32 } });
  await favicon.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;background:transparent}svg{display:block;width:32px;height:32px}</style>${mark}`);
  await favicon.locator('svg').screenshot({ path: join(root, 'assets', 'favicon-32.png'), omitBackground: true });

  const apple = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  await apple.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;background:#070910}.tile{width:180px;height:180px;display:grid;place-items:center;border-radius:36px;background:radial-gradient(circle at 68% 25%,#151a28,#070910 62%)}svg{width:132px;height:132px;filter:drop-shadow(0 0 10px rgba(114,214,229,.24))}</style><div class="tile">${mark}</div>`);
  await apple.locator('.tile').screenshot({ path: join(root, 'assets', 'apple-touch-icon.png') });
} finally {
  await browser.close();
}
console.log('favicon-32.png and apple-touch-icon.png generated');
