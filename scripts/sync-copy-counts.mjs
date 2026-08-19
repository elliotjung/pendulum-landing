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
import { createHash } from 'node:crypto';
import { evidenceFreshnessText } from './evidence-copy.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidence = JSON.parse(await readFile(join(root, 'assets', 'evidence-summary.json'), 'utf8'));
const total = evidence.tests?.total;
const passed = evidence.tests?.passed;
if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(passed)) {
  console.error('evidence summary has no usable tests.total/tests.passed');
  process.exit(1);
}
const comma = new Intl.NumberFormat('en-US').format(total);
const freshness = evidenceFreshnessText(evidence.provenance?.expiresAt);
if (!freshness) {
  console.error('evidence summary has no usable provenance.expiresAt');
  process.exit(1);
}
const evidenceDay = typeof evidence.generatedAt === 'string' ? evidence.generatedAt.slice(0, 10) : '';
if (!/^\d{4}-\d{2}-\d{2}$/.test(evidenceDay) || !Number.isFinite(Date.parse(evidenceDay))) {
  console.error('evidence summary has no usable generatedAt day');
  process.exit(1);
}

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
      ],
      [
        /(data-evidence-freshness[^>]*>)[^<]*(<)/,
        `$1${freshness}$2`
      ],
      [/"dateModified": "\d{4}-\d{2}-\d{2}"/, `"dateModified": "${evidenceDay}"`]
    ]
  },
  {
    file: join('assets', 'i18n-core.js'),
    replacements: [[/[\d,]+개 단위 테스트/g, `${comma}개 단위 테스트`]]
  }
];

function jsonLdHashes(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => /\btype\s*=\s*"application\/ld\+json"/i.test(match[1] ?? ''))
    .map((match) => createHash('sha256').update(match[2] ?? '', 'utf8').digest('base64'));
}

function syncJsonLdCspHash(original, updated) {
  const before = jsonLdHashes(original);
  const after = jsonLdHashes(updated);
  if (before.length !== 1 || after.length !== 1) {
    console.error('index.html must contain exactly one inline application/ld+json block');
    process.exit(1);
  }
  if (before[0] === after[0]) return updated;
  const oldToken = `'sha256-${before[0]}'`;
  const newToken = `'sha256-${after[0]}'`;
  if (!updated.includes(oldToken)) {
    console.error('index.html CSP does not pin the inline application/ld+json block');
    process.exit(1);
  }
  return updated.replace(oldToken, newToken);
}

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
  if (file === 'index.html') updated = syncJsonLdCspHash(original, updated);
  if (updated !== original) await writeFile(path, updated);
}

const sitemapPath = join(root, 'sitemap.xml');
const sitemap = await readFile(sitemapPath, 'utf8');
const sitemapLastmods = [...sitemap.matchAll(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)];
if (sitemapLastmods.length !== 2) {
  console.error(`expected exactly two sitemap lastmod entries, found ${sitemapLastmods.length}`);
  process.exit(1);
}
const syncedSitemap = sitemap.replace(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g, `<lastmod>${evidenceDay}</lastmod>`);
if (syncedSitemap !== sitemap) await writeFile(sitemapPath, syncedSitemap);

console.log(`copy and evidence fallbacks synced: ${comma} tests (${passed} passed), ${evidenceDay} — remember npm run build:ko`);
