// Regenerates assets/og-card.png (1200x630) from the text-free technical plate plus
// the measured evidence numbers, so the social card can never quote a stale
// test count. assets/og-card-meta.json records the numbers baked into the
// pixels; scripts/check-static-assets.mjs fails when that sidecar drifts from
// assets/evidence-summary.json.
//
//   node scripts/generate-og-card.mjs            # regenerate when stale
//   node scripts/generate-og-card.mjs --force    # regenerate unconditionally
//   node scripts/generate-og-card.mjs --make-base # rebuild the flat technical plate
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
const TAGLINE = 'Nonlinear dynamics workbench.';
const rendererSha256 = createHash('sha256')
  .update(await readFile(fileURLToPath(import.meta.url)))
  .digest('hex');

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
const claimLevel = (id) => evidence.claimEvidence?.claims?.find((claim) => claim?.id === id)?.effectiveVisibleLevel ?? 'withheld';
const claimIsCurrentValidated = (id) => {
  const claim = evidence.claimEvidence?.claims?.find((entry) => entry?.id === id);
  return Boolean(claim && (claim.effectiveVisibleLevel === 'validated' || claim.effectiveVisibleLevel === 'publication-ready') && claim.validity === 'current');
};
const testsClaimLevel = claimLevel('tests.unit');
const scipyClaimLevel = claimLevel('validation.scipy.regular');
const testsLabel = claimIsCurrentValidated('tests.unit') ? `${formatted} tests` : 'Test evidence withheld';
const scipyLabel = claimIsCurrentValidated('validation.scipy.regular') ? 'SciPy-validated' : 'SciPy evidence withheld';
const baseSha256 = createHash('sha256')
  .update(await readFile(BASE))
  .digest('hex');
const existingCardSha256 = await readFile(CARD)
  .then((bytes) => createHash('sha256').update(bytes).digest('hex'))
  .catch(() => null);
const labelSeparator = '·';

if (!args.has('--force')) {
  const fresh = await readFile(META, 'utf8')
    .then((raw) => {
      const meta = JSON.parse(raw);
      return (
        meta.testsTotal === testsTotal &&
        meta.sourceEvidenceCommit === evidence.provenance?.sourceCommit &&
        meta.baseSha256 === baseSha256 &&
        meta.rendererSha256 === rendererSha256 &&
        meta.tagline === TAGLINE &&
        meta.testsClaimLevel === testsClaimLevel &&
        meta.scipyClaimLevel === scipyClaimLevel &&
        meta.cardSha256 === existingCardSha256
      );
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
  readFile(join(root, 'assets', 'fonts', 'Pretendard-Regular.subset.woff2')).then((b) => b.toString('base64')),
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
.kicker{position:absolute;left:61px;top:177px;font-size:22px;font-weight:700;letter-spacing:.15em;
  color:#75b8c7;line-height:1}
.headline{position:absolute;left:58px;top:224px;font-size:62px;font-weight:700;letter-spacing:-.018em;
  color:#edf1f3;line-height:69px;white-space:pre}
.stat{position:absolute;left:61px;top:401px;font-size:31px;font-weight:400;letter-spacing:.002em;
  color:#b7c0c8;line-height:1.2}
.stat .cy{color:#75b8c7;font-weight:700}
</style><div id="card"><img src="data:image/png;base64,${baseB64}">
<div class="kicker">PENDULUM LAB</div>
<div class="headline">Nonlinear dynamics
workbench.</div>
<div class="stat"><span class="cy">${testsLabel}</span> · <span class="cy">${scipyLabel}</span></div>
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
const cardSha256 = createHash('sha256')
  .update(await readFile(CARD))
  .digest('hex');
await writeFile(
  META,
  `${JSON.stringify(
    {
      schemaVersion: 'pendulum-og-card/v1',
      testsTotal,
      formatted,
      tagline: TAGLINE,
      testsClaimLevel,
      scipyClaimLevel,
      sourceEvidenceCommit: evidence.provenance ? evidence.provenance.sourceCommit : null,
      baseSha256,
      rendererSha256,
      cardSha256,
    },
    null,
    2,
  )}\n`,
);

console.log(`og-card evidence label: ${testsLabel} ${labelSeparator} ${scipyLabel}`);

async function makeBase() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><style>*{margin:0}body{background:#0b0f14}svg{display:block}</style>
      <svg id="plate" xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
        <rect width="1200" height="630" fill="#0b0f14"/>
        <g stroke="#16212a" stroke-width="1">
          <path d="M640 0V630M720 0V630M800 0V630M880 0V630M960 0V630M1040 0V630M1120 0V630"/>
          <path d="M640 70H1200M640 150H1200M640 230H1200M640 310H1200M640 390H1200M640 470H1200M640 550H1200"/>
        </g>
        <path d="M628 62V568" stroke="#30404d"/>
        <g fill="none" stroke-linecap="square">
          <path d="M876 118A210 210 0 0 1 1085 326" stroke="#30404d" stroke-dasharray="5 8"/>
          <path d="M995 270A230 230 0 0 1 1132 514" stroke="#30404d" stroke-dasharray="2 8"/>
          <path d="M876 118L995 270L1080 480" stroke="#8d99a3" stroke-width="3"/>
          <path d="M876 118L971 287L1038 507" stroke="#53626e" stroke-width="1.5" stroke-dasharray="8 6"/>
          <path d="M995 270Q1094 310 1080 480" stroke="#75b8c7" stroke-width="1.5"/>
          <path d="M971 287Q1045 360 1038 507" stroke="#d2a968" stroke-width="1.5" stroke-dasharray="5 6"/>
        </g>
        <g stroke="#0b0f14" stroke-width="3">
          <circle cx="876" cy="118" r="9" fill="#8d99a3"/>
          <circle cx="995" cy="270" r="12" fill="#75b8c7"/>
          <circle cx="1080" cy="480" r="15" fill="#d2a968"/>
          <circle cx="971" cy="287" r="8" fill="#53626e"/>
          <circle cx="1038" cy="507" r="10" fill="#697580"/>
        </g>
        <g fill="none" stroke="#30404d" stroke-width="1">
          <path d="M680 550H1150M680 550V505"/>
          <path d="M680 535L735 532L790 522L845 526L900 498L955 510L1010 471L1065 486L1125 440" stroke="#75b8c7"/>
          <path d="M680 542L735 539L790 536L845 528L900 524L955 503L1010 516L1065 478L1125 496" stroke="#d2a968" stroke-dasharray="5 5"/>
          <path d="M680 90H748" stroke="#75b8c7" stroke-width="2"/>
          <path d="M680 112H748" stroke="#d2a968" stroke-width="2" stroke-dasharray="5 5"/>
        </g>
        <g fill="#53626e">
          <rect x="676" y="501" width="8" height="1"/><rect x="676" y="523" width="8" height="1"/>
          <rect x="756" y="546" width="1" height="8"/><rect x="836" y="546" width="1" height="8"/>
          <rect x="916" y="546" width="1" height="8"/><rect x="996" y="546" width="1" height="8"/>
          <rect x="1076" y="546" width="1" height="8"/>
        </g>
      </svg>`);
    await page.locator('#plate').screenshot({ path: BASE });
  } finally {
    await browser.close();
  }
  console.log('og-card-base.png written (flat technical plate)');
}
