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

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidence = JSON.parse(await readFile(join(root, 'assets', 'evidence-summary.json'), 'utf8'));
const total = evidence.tests?.total;
const passed = evidence.tests?.passed;
if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(passed)) {
  console.error('evidence summary has no usable tests.total/tests.passed');
  process.exit(1);
}
const comma = new Intl.NumberFormat('en-US').format(total);

const edits = [
  {
    file: 'index.html',
    replacements: [
      [/[\d,]+ verified tests/, `${comma} verified tests`],
      [/[\d,]+ tests and SciPy-validated\./g, `${comma} tests and SciPy-validated.`],
      [/(data-evidence="tests\.formatted">)[^<]*(<)/, `$1${comma}$2`],
      [/(data-count=")[\d,]+(" data-decimals="0" data-evidence-count="tests\.passed")/, `$1${passed}$2`],
      [
        /(data-evidence="ledger\.verify">)[^<]*(<)/,
        `$1CSP-safe lint → strict typecheck → module-size ratchet → ${total} unit tests → result-count guard → docs sync → format gate$2`
      ]
    ]
  },
  {
    file: join('assets', 'i18n-core.js'),
    replacements: [[/[\d,]+개 단위 테스트/g, `${comma}개 단위 테스트`]]
  }
];

for (const { file, replacements } of edits) {
  const path = join(root, file);
  const original = await readFile(path, 'utf8');
  let updated = original;
  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(updated)) {
      console.error(`no match for ${pattern} in ${file}`);
      process.exit(1);
    }
    updated = updated.replace(pattern, replacement);
  }
  if (updated !== original) await writeFile(path, updated);
}
console.log(`copy counts synced: ${comma} tests (${passed} passed) — remember npm run build:ko`);
