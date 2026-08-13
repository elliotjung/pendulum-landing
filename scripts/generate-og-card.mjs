// Regenerates assets/og-card.png (1200x630) from the text-free base art plus
// the measured evidence numbers, so the social card can never quote a stale
// test count. assets/og-card-meta.json records the numbers baked into the
// pixels; scripts/check-static-assets.mjs fails when that sidecar drifts from
// assets/evidence-summary.json.
//
//   node scripts/generate-og-card.mjs            # regenerate when stale
//   node scripts/generate-og-card.mjs --force    # regenerate unconditionally
//   node scripts/generate-og-card.mjs --make-base # one-off: rebuild the base
//                                                  # from the current card by
//                                                  # wiping the text region
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CARD = join(root, 'assets', 'og-card.png');
const BASE = join(root, 'assets', 'og-card-base.png');
const META = join(root, 'assets', 'og-card-meta.json');
const WIDTH = 1200;
const HEIGHT = 630;

const args = new Set(process.argv.slice(2));

if (args.has('--make-base')) {
  await makeBase();
  process.exit(0);
}

const evidence = JSON.parse(await readFile(join(root, 'assets', 'evidence-summary.json'), 'utf8'));
const testsTotal = evidence.tests?.total;
if (!Number.isInteger(testsTotal) || testsTotal <= 0) {
  console.error('evidence summary has no positive tests.total');
  process.exit(1);
}
const formatted = new Intl.NumberFormat('en-US').format(testsTotal);
const baseSha256 = createHash('sha256').update(await readFile(BASE)).digest('hex');
const existingCardSha256 = await readFile(CARD)
  .then((bytes) => createHash('sha256').update(bytes).digest('hex'))
  .catch(() => null);
const labelSeparator = '·';

if (!args.has('--force')) {
  const fresh = await readFile(META, 'utf8')
    .then((raw) => {
      const meta = JSON.parse(raw);
      return meta.testsTotal === testsTotal
        && meta.sourceEvidenceCommit === evidence.provenance?.sourceCommit
        && meta.baseSha256 === baseSha256
        && meta.cardSha256 === existingCardSha256;
    })
    .catch(() => false);
  if (fresh && existingCardSha256) {
    console.log(`og-card fresh (${formatted} tests); nothing to do`);
    process.exit(0);
  }
}

const [baseB64, boldB64, regularB64] = await Promise.all([
  readFile(BASE).then((b) => b.toString('base64')),
  readFile(join(root, 'assets', 'fonts', 'Pretendard-Bold.subset.woff2')).then((b) => b.toString('base64')),
  readFile(join(root, 'assets', 'fonts', 'Pretendard-Regular.subset.woff2')).then((b) => b.toString('base64'))
]);

// Positions/sizes were measured from the original hand-made card with a
// pixel probe (kicker ink box y180-198 x61-291, headline y235-386 x61-600,
// stat line y408-437 x61-471) so regenerated cards keep the same layout.
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:'Pretendard Local';font-weight:700;src:url(data:font/woff2;base64,${boldB64}) format('woff2')}
@font-face{font-family:'Pretendard Local';font-weight:400;src:url(data:font/woff2;base64,${regularB64}) format('woff2')}
*{margin:0;box-sizing:border-box}
#card{position:relative;width:${WIDTH}px;height:${HEIGHT}px;background:#000108;overflow:hidden;
  font-family:'Pretendard Local',sans-serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
#card img{position:absolute;inset:0;width:100%;height:100%}
.kicker{position:absolute;left:61px;top:177px;font-size:25px;font-weight:700;letter-spacing:.185em;
  color:#72d6e5;line-height:1;text-shadow:0 0 18px rgba(114,214,229,.24)}
.headline{position:absolute;left:58px;top:224px;font-size:73px;font-weight:700;letter-spacing:-.012em;
  color:#fff;line-height:78px;white-space:pre}
.stat{position:absolute;left:61px;top:401px;font-size:31px;font-weight:400;letter-spacing:.002em;
  color:#c8d2e2;line-height:1.2}
.stat .cy{color:#72d6e5;font-weight:700}
</style><div id="card"><img src="data:image/png;base64,${baseB64}">
<div class="kicker">PENDULUM LAB</div>
<div class="headline">Order, undone
by chaos.</div>
<div class="stat"><span class="cy">${formatted}</span> tests · <span class="cy">SciPy</span>-validated</div>
</div>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#card').screenshot({ path: CARD });
} finally {
  await browser.close();
}
const cardSha256 = createHash('sha256').update(await readFile(CARD)).digest('hex');
await writeFile(
  META,
  `${JSON.stringify(
    {
      schemaVersion: 'pendulum-og-card/v1',
      testsTotal,
      formatted,
      tagline: 'Order, undone by chaos.',
      sourceEvidenceCommit: evidence.provenance ? evidence.provenance.sourceCommit : null,
      baseSha256,
      cardSha256
    },
    null,
    2
  )}\n`
);

console.log(`og-card evidence label: ${formatted} tests ${labelSeparator} SciPy-validated`);

async function makeBase() {
  const cardB64 = (await readFile(CARD)).toString('base64');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    await page.setContent(
      `<style>*{margin:0}</style><canvas id="c" width="${WIDTH}" height="${HEIGHT}"></canvas>`
    );
    await page.evaluate(
      async ({ src, wipes }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const ctx = document.getElementById('c').getContext('2d');
        ctx.drawImage(img, 0, 0);
        // Flat near-black matches the measured left-panel background
        // (rgb 0-2 in every channel), so the wipe is invisible.
        ctx.fillStyle = '#000108';
        for (const [x0, y0, x1, y1] of wipes) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      },
      {
        src: `data:image/png;base64,${cardB64}`,
        wipes: [
          [40, 160, 330, 218], // kicker
          [40, 218, 640, 400], // headline block
          [40, 392, 500, 455] // stat line
        ]
      }
    );
    await page.locator('#c').screenshot({ path: BASE });
  } finally {
    await browser.close();
  }
  console.log('og-card-base.png written (text region wiped)');
}
