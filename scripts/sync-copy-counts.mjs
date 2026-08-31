// Rewrites every static test-count occurrence in the landing copy from
// assets/evidence-summary.json: the SEO meta description and OG/Twitter image
// alt text (comma-formatted), the no-JS fallback spans that the runtime
// hydrator overwrites (raw numbers, kept byte-identical to what
// assets/main.js renders so hydration never visibly flips a value), and the
// Korean dictionary entry that scripts/build-ko-page.mjs bakes into ko.html.
// scripts/check-static-assets.mjs fails when any of these drift, and
// cross-repo-release.yml runs this sync before that check.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evidenceFreshnessText } from './evidence-copy.mjs';
import {
  CLAIM_IDS,
  claimById,
  claimCaveatLabel,
  claimEvidenceView,
  claimLevelLabel,
} from './evidence-claims.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidence = JSON.parse(await readFile(join(root, 'assets', 'evidence-summary.json'), 'utf8'));
const claimView = claimEvidenceView(evidence);
const claim = (id) => claimById(claimView, id);
const claimVisible = (id) => claim(id)?.effectiveVisibleLevel !== 'withheld';
const total = evidence.tests?.total;
const passed = evidence.tests?.passed;
if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(passed)) {
  console.error('evidence summary has no usable tests.total/tests.passed');
  process.exit(1);
}
const scipyDisplay = evidence.validation?.scipyAgreement?.display;
const scipyCounter = typeof scipyDisplay === 'string'
  ? scipyDisplay.match(/^~(\d+(?:\.\d+)?)e([+-]?\d+)$/)
  : null;
const energyProfiledMethods = evidence.energy?.profiledMethods;
if (!scipyCounter || !Number.isInteger(energyProfiledMethods) || energyProfiledMethods <= 0) {
  console.error('evidence summary has no usable SciPy display or energy method count');
  process.exit(1);
}
const scipyMantissa = scipyCounter[1];
const scipyExponent = scipyCounter[2];
const scipyDecimals = scipyMantissa.includes('.') ? scipyMantissa.split('.')[1].length : 0;
const comma = new Intl.NumberFormat('en-US').format(total);
const freshness = evidenceFreshnessText(evidence.provenance?.expiresAt, false, evidence);
if (!freshness) {
  console.error('evidence summary has no usable provenance.expiresAt');
  process.exit(1);
}
const evidenceDay = typeof evidence.generatedAt === 'string' ? evidence.generatedAt.slice(0, 10) : '';
if (!/^\d{4}-\d{2}-\d{2}$/.test(evidenceDay) || !Number.isFinite(Date.parse(evidenceDay))) {
  console.error('evidence summary has no usable generatedAt day');
  process.exit(1);
}

const claimNames = {
  'tests.unit': 'Unit-test evidence',
  'validation.scipy.regular': 'SciPy regular-orbit evidence',
  'testing.mutation': 'Mutation-testing evidence',
  'benchmark.energy.methods': 'Energy-profile evidence',
  'gpu.vendor-matrix': 'Physical GPU evidence',
  'publication.release': 'Publication evidence',
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function claimDescription(korean = false) {
  const testsLevel = claim('tests.unit')?.effectiveVisibleLevel ?? 'withheld';
  const scipyLevel = claim('validation.scipy.regular')?.effectiveVisibleLevel ?? 'withheld';
  if (korean) {
    const testsCopy = testsLevel === 'validated'
      ? `${comma}개 단위 테스트`
      : testsLevel === 'measured'
        ? `${comma}개 측정 테스트`
        : testsLevel === 'informational'
          ? '과거 테스트 근거'
          : '실패 시 닫히는 테스트 근거 원장';
    const scipyCopy = scipyLevel === 'validated' ? 'SciPy와 출판 문헌으로 검증' : 'SciPy 근거 수준을 명시';
    return `비선형 진자 동역학, 수치 진단, 재현 가능한 실험, 검토 가능한 검증 근거를 위한 브라우저 기반 워크벤치. ${testsCopy}, ${scipyCopy}.`;
  }
  const testsCopy = testsLevel === 'validated'
    ? `${comma} verified tests`
    : testsLevel === 'measured'
      ? `${comma} measured tests`
      : testsLevel === 'informational'
        ? 'historical test evidence'
        : 'a fail-closed test evidence ledger';
  const scipyCopy = scipyLevel === 'validated'
    ? 'SciPy cross-validation'
    : scipyLevel === 'measured'
      ? 'measured SciPy comparisons'
      : scipyLevel === 'informational'
        ? 'historical SciPy comparisons'
        : 'withheld SciPy claims';
  return `A browser-based workbench for nonlinear pendulum dynamics, numerical diagnostics, and reproducible experiments, with ${testsCopy} and ${scipyCopy}.`;
}

function syncClaimMarkup(html) {
  let updated = html;
  for (const id of CLAIM_IDS) {
    const current = claim(id);
    const level = current?.effectiveVisibleLevel ?? 'withheld';
    const label = claimLevelLabel(level);
    const caveat = claimCaveatLabel(current);
    const escapedId = escapeRegExp(id);
    let statusMatches = 0;
    updated = updated.replace(
      new RegExp(`<([a-z]+)([^>]*\\bdata-claim-status="${escapedId}"[^>]*)>[^<]*<\\/\\1>`, 'g'),
      (_whole, tag, attributes) => {
        statusMatches += 1;
        const nextAttributes = attributes.replace(/class="evidence-status [^"]*"/, `class="evidence-status ${level}"`);
        return `<${tag}${nextAttributes}>${escapeHtml(label)}</${tag}>`;
      },
    );
    if (statusMatches === 0) throw new Error(`index.html has no claim status surface for ${id}`);
    let caveatMatches = 0;
    updated = updated.replace(
      new RegExp(`(<[^>]+\\bdata-claim-caveat="${escapedId}"[^>]*>)[^<]*(<\\/[^>]+>)`, 'g'),
      (_whole, open, close) => {
        caveatMatches += 1;
        return `${open}${escapeHtml(caveat)}${close}`;
      },
    );
    if (caveatMatches === 0) throw new Error(`index.html has no claim caveat surface for ${id}`);
  }

  if (claimVisible('validation.scipy.regular')) {
    updated = updated.replace(
      /(data-evidence="validation\.scipyAgreement">)[^<]*(<)/g,
      `$1${escapeHtml(scienceDisplay())}$2`,
    );
    updated = updated.replace(
      /data-count="[^"]*" data-decimals="[^"]*" data-prefix="~" data-suffix="e[^"]*" data-evidence="validation\.scipyAgreement"/g,
      `data-count="${scipyMantissa}" data-decimals="${scipyDecimals}" data-prefix="~" data-suffix="e${scipyExponent}" data-evidence="validation.scipyAgreement"`,
    );
    updated = updated.replace(
      /Regular orbits agree to ~[^ ]+ over 20 s;/g,
      `Regular orbits agree to ${scienceDisplay()} over 20 s;`,
    );
  }
  if (claimVisible('benchmark.energy.methods')) {
    updated = updated.replace(
      /(data-evidence="energy\.profileLabel">)[^<]*(<)/g,
      `$1${energyProfiledMethods} methods profiled$2`,
    );
  }

  if (!claimVisible('tests.unit')) {
    updated = updated.replace(/(data-evidence="tests\.formatted">)[^<]*(<)/g, '$1withheld$2');
    updated = updated.replace(/data-count="[^"]*"([^>]*data-evidence-count="tests\.passed")/g, 'data-count="0"$1');
  }
  if (!claimVisible('validation.scipy.regular')) {
    updated = updated.replace(/(data-evidence="validation\.scipyAgreement">)[^<]*(<)/g, '$1withheld$2');
  }
  for (const [id, keys] of Object.entries({
    'testing.mutation': ['mutation.scoreLabel', 'mutation.detailLabel'],
    'benchmark.energy.methods': ['energy.profileLabel', 'energy.bestMethod', 'energy.bestDrift'],
    'gpu.vendor-matrix': ['gpu.vendorLabel', 'gpu.missingLabel'],
    'publication.release': ['publication.availableLabel', 'publication.missingLabel'],
  })) {
    if (claimVisible(id)) continue;
    for (const key of keys) {
      const escapedKey = escapeRegExp(key);
      updated = updated.replace(new RegExp(`(data-evidence="${escapedKey}">)[^<]*(<)`, 'g'), '$1withheld$2');
    }
  }

  const description = claimDescription(false);
  updated = updated.replace(
    /(<meta name="description" content=")[^"]*(" \/>)/,
    `$1${escapeHtml(description)}$2`,
  );
  const shareAlt = claimVisible('tests.unit') && claimVisible('validation.scipy.regular')
    ? `Pendulum Lab nonlinear dynamics workbench — ${comma} tests and SciPy validation.`
    : 'Pendulum Lab nonlinear dynamics workbench — evidence levels and limitations are disclosed.';
  updated = updated.replace(
    /(<meta (?:property="og:image:alt"|name="twitter:image:alt") content=")[^"]*(" \/>)/g,
    `$1${escapeHtml(shareAlt)}$2`,
  );

  updated = updated.replace(
    /(<script\b[^>]*type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/,
    (_whole, open, body, close) => {
      const data = JSON.parse(body);
      const graph = Array.isArray(data?.['@graph']) ? data['@graph'] : [];
      const webPage = graph.find((entry) => entry?.['@type'] === 'WebPage');
      const software = graph.find((entry) => entry?.['@type'] === 'SoftwareSourceCode');
      if (!webPage || !software) throw new Error('index.html JSON-LD lacks WebPage or SoftwareSourceCode');
      webPage.description = description;
      software.additionalProperty = CLAIM_IDS.map((id) => ({
        '@type': 'PropertyValue',
        propertyID: id,
        name: claimNames[id],
        value: claim(id)?.effectiveVisibleLevel ?? 'withheld',
      }));
      return `${open}\n${JSON.stringify(data, null, 2)}\n${close}`;
    },
  );
  return updated;
}

function syncKoreanDiscovery(source) {
  const description = claimDescription(true);
  const shareAlt = claimVisible('tests.unit') && claimVisible('validation.scipy.regular')
    ? `Pendulum Lab 비선형 동역학 워크벤치 — ${comma}개 테스트와 SciPy 검증.`
    : 'Pendulum Lab 비선형 동역학 워크벤치 — 근거 수준과 한계를 공개합니다.';
  return source
    .replace(/(const META_DESCRIPTION_KO\s*=\s*)'[^']*';/, `$1'${description}';`)
    .replace(/(const SHARE_IMAGE_ALT_KO\s*=\s*)'[^']*';/, `$1'${shareAlt}';`)
    .replace(
      /'Regular orbits agree to ~[^']*':/,
      `'Regular orbits agree to ${scienceDisplay()} over 20 s; chaotic orbits to the e^{λ₁t}-amplified tolerance floor.':`,
    )
    .replace(
      /'규칙 궤도는 20초 동안 ~[^']*일치합니다\.'/,
      `'규칙 궤도는 20초 동안 ${scienceDisplay()} 수준으로 일치하고, 카오스 궤도는 e^{λ₁t}로 증폭된 허용 하한까지 일치합니다.'`,
    );
}

function scienceDisplay() {
  return scipyDisplay;
}

const edits = [
  {
    file: 'index.html',
    replacements: [
      [/[\d,]+ verified tests/g, `${comma} verified tests`],
      [/(data-evidence="tests\.formatted">)[^<]*(<)/, `$1${comma}$2`],
      [/(data-count=")[\d,]+(" data-decimals="0" data-evidence-count="tests\.passed")/, `$1${passed}$2`],
      [
        /(data-evidence="ledger\.verify">)[^<]*(<)/,
        `$1CSP-safe lint → strict typecheck → module-size ratchet → ${total} unit tests → result-count guard → docs sync → format gate$2`
      ],
      [
        /(data-evidence-freshness[^>]*>)[^<]*(<)/,
        `$1${freshness}$2`
      ]
    ]
  },
  {
    file: join('assets', 'i18n-core.js'),
    replacements: []
  }
];

for (const { file, replacements } of edits) {
  const path = join(root, file);
  const original = await readFile(path, 'utf8');
  let updated = original;
  for (const [pattern, replacement] of replacements) {
    pattern.lastIndex = 0;
    if (!pattern.test(updated)) {
      console.error(`no match for ${pattern} in ${file}`);
      process.exit(1);
    }
    pattern.lastIndex = 0;
    updated = updated.replace(pattern, replacement);
  }
  if (file === 'index.html') updated = syncClaimMarkup(updated);
  if (file === join('assets', 'i18n-core.js')) updated = syncKoreanDiscovery(updated);
  if (updated !== original) await writeFile(path, updated);
}

console.log(`copy and evidence fallbacks synced: ${comma} tests (${passed} passed), ${evidenceDay} — remember npm run build:ko`);
