import { access, readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const warnings = [];
// English source page + the generated Korean page (scripts/build-ko-page.mjs):
// both must satisfy the same CSP/inline-hash and local-asset invariants.
const PAGES = ['index.html', 'ko.html', '404.html'];
const CONTENT_PAGES = new Set(['index.html', 'ko.html']);

const ignoredDirs = new Set(['.git', '.lighthouseci', 'node_modules', 'reports', 'test-results', 'assets/vendor']);
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.txt', '.xml']);
const mojibakeTokens = ['\uCA0C', '\uCC55', '\uD69E', '\uBBB6', '\uBD55', '\uBC1A', '\uBC23', '\uBC04', '\uBC2A', '\uBC33', '\uBC20', '\uBC06', '\uAC4E', '\uBB56', '\uBBCA', '\uBBCB', '\u7F50', '\u6B3E', '\u8CAB'];
const mojibakeRegexes = [
  ['replacement-character', /\uFFFD/],
  ['latin1-utf8-c1', /\u00C3[\u0080-\u00BF]/],
  ['stray-cp1252-latin1', /\u00C2[\u0080-\u00BF]?/],
  ['cp1252-punctuation', /\u00E2[\u0080-\u2122]{1,2}/],
  ['emoji-mojibake', /\u00F0\u0178[\u0080-\u00BF]?/],
  ['known-rendered-mojibake-token', new RegExp(mojibakeTokens.map(escapeRegExp).join('|'))]
];

for (const pageName of PAGES) {
  let html;
  try {
    html = await readFile(join(root, pageName), 'utf8');
  } catch {
    failures.push(`${pageName}: page is missing (run npm run build:ko for the Korean page)`);
    continue;
  }
  for (const forbidden of ['fonts.googleapis.com', 'fonts.gstatic.com']) {
    if (html.includes(forbidden)) failures.push(`${pageName}: external font host still referenced: ${forbidden}`);
  }
  const csp = html.match(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"/i)?.[1] ?? '';
  const scriptPolicy = csp.match(/(?:^|;)\s*script-src\s+([^;]+)/i)?.[1] ?? '';
  if (scriptPolicy.includes("'unsafe-inline'")) {
    failures.push(`${pageName}: CSP script-src must not allow unsafe-inline`);
  }
  verifyCspInlineScriptHashes(pageName, html, scriptPolicy);
  if (pageName === 'index.html' && /style-src-attr[^;]*'unsafe-inline'/i.test(csp)) {
    warnings.push('CSP style-src-attr remains narrowly enabled for runtime animation state');
  }
  if (CONTENT_PAGES.has(pageName)) verifySocialMetadata(pageName, html);

  const attrPattern = /\b(?:href|src|srcset)=["']([^"']+)["']/g;
  for (const match of html.matchAll(attrPattern)) {
    const refs = match[0].startsWith('srcset=')
      ? match[1].split(',').map((candidate) => candidate.trim().split(/\s+/)[0]).filter(Boolean)
      : [match[1]];
    for (const ref of refs) {
      if (!ref || shouldSkip(ref)) continue;
      const clean = ref.split('#')[0].split('?')[0];
      if (!clean) continue;
      try {
        await access(join(root, clean));
      } catch {
        failures.push(`${pageName}: missing local asset: ${ref}`);
      }
    }
  }
}

const evidence = JSON.parse(await readFile(join(root, 'assets', 'evidence-summary.json'), 'utf8'));
const kernelManifest = JSON.parse(await readFile(join(root, 'assets', 'demo-kernel-manifest.json'), 'utf8'));
const changelog = JSON.parse(await readFile(join(root, 'assets', 'changelog-highlights.json'), 'utf8'));
const kernelBytes = await readFile(join(root, kernelManifest.kernel));
if (createHash('sha256').update(kernelBytes).digest('hex') !== kernelManifest.sha256) {
  failures.push('demo kernel SHA-256 does not match its manifest');
}
if (kernelManifest.sourceCommit !== evidence.provenance?.sourceCommit) {
  failures.push('demo kernel sourceCommit does not match the evidence summary');
}
if (evidence.schemaVersion !== 'pendulum-evidence-summary/v1') {
  failures.push(`unexpected evidence schema: ${evidence.schemaVersion ?? 'missing'}`);
}
if (!Number.isFinite(evidence.tests?.total) || evidence.tests.total <= 0) {
  failures.push('evidence summary is missing a positive tests.total');
}
checkEvidenceFreshness(evidence);
checkChangelog(changelog, evidence);
await checkCopyCounts(evidence);
await checkPngDimensions('assets/favicon-32.png', 32, 32);
await checkPngDimensions('assets/apple-touch-icon.png', 180, 180);
await checkPngDimensions('assets/og-card.png', 1200, 630);
await checkPngDimensions('assets/og-card-base.png', 1200, 630);
await checkSitemap();
await compareMainEvidenceIfProvided(evidence);
await checkTextEncoding();

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn(warnings.map((warning) => `- warning: ${warning}`).join('\n'));
}
console.log('static asset check passed');

/**
 * The CSP pins inline <script> blocks by SHA-256, and those hashes are
 * maintained by hand. Editing the inline importmap without updating the hash
 * silently breaks the hero (CSP blocks the import map, Three.js never loads,
 * the page "cleanly" falls back to the static background). Recompute both
 * directions here:
 *   - every executable inline script (importmap / module / classic JS) must
 *     have its exact hash present in script-src;
 *   - every sha256 token in script-src must correspond to some inline script
 *     (otherwise it is a stale leftover that no longer covers anything).
 * Data blocks (application/ld+json) are not executed and need no allowance,
 * but their hashes are still legal in the policy, so the reverse check
 * accepts them.
 */
function verifyCspInlineScriptHashes(pageName, pageHtml, policy) {
  const cspHashes = new Set([...policy.matchAll(/'sha256-([A-Za-z0-9+/=]+)'/g)].map((match) => match[1]));
  const executableTypes = new Set(['', 'text/javascript', 'application/javascript', 'module', 'importmap']);
  const inline = [];
  for (const match of pageHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1] ?? '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = (attrs.match(/type\s*=\s*"([^"]*)"/i)?.[1] ?? '').trim().toLowerCase();
    const hash = createHash('sha256').update(match[2] ?? '', 'utf8').digest('base64');
    inline.push({ type, hash, executable: executableTypes.has(type) });
  }
  for (const script of inline) {
    if (script.executable && !cspHashes.has(script.hash)) {
      failures.push(
        `${pageName}: CSP script-src is missing the hash of an inline ${script.type || 'classic'} script: 'sha256-${script.hash}' — update the CSP after editing the inline block`
      );
    }
  }
  const inlineHashes = new Set(inline.map((script) => script.hash));
  for (const hash of cspHashes) {
    if (!inlineHashes.has(hash)) {
      failures.push(`${pageName}: CSP script-src lists a stale sha256 that matches no inline script: 'sha256-${hash}'`);
    }
  }
}

function verifySocialMetadata(pageName, html) {
  const expectedLocale = pageName === 'ko.html' ? 'ko_KR' : 'en_US';
  const expectedAlternate = pageName === 'ko.html' ? 'en_US' : 'ko_KR';
  const expectedTitle = pageName === 'ko.html'
    ? 'Pendulum Lab — 질서, 카오스에 무너지다'
    : 'Pendulum Lab — Order, Undone by Chaos';
  const required = [
    [`<title>${expectedTitle}</title>`, 'canonical page title'],
    [`property="og:title" content="${expectedTitle}"`, 'canonical OG title'],
    [`name="twitter:title" content="${expectedTitle}"`, 'canonical Twitter title'],
    [`property="og:locale" content="${expectedLocale}"`, 'primary OG locale'],
    [`property="og:locale:alternate" content="${expectedAlternate}"`, 'alternate OG locale'],
    ['property="og:image" content="https://elliotjung.github.io/pendulum-landing/assets/og-card.png"', 'dedicated OG image'],
    ['property="og:image:type" content="image/png"', 'OG image MIME type'],
    ['property="og:image:width" content="1200"', 'OG image width'],
    ['property="og:image:height" content="630"', 'OG image height'],
    ['name="twitter:image" content="https://elliotjung.github.io/pendulum-landing/assets/og-card.png"', 'Twitter image'],
    ['rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png"', 'PNG favicon'],
    ['rel="apple-touch-icon" sizes="180x180" href="assets/apple-touch-icon.png"', 'Apple touch icon']
  ];
  for (const [token, label] of required) if (!html.includes(token)) failures.push(`${pageName}: missing ${label}`);
}

function checkChangelog(summary, evidenceSummary) {
  if (summary.schemaVersion !== 'pendulum-changelog-highlights/v1') failures.push('unexpected changelog highlights schema');
  if (!Array.isArray(summary.highlights) || summary.highlights.length !== 3) failures.push('changelog highlights must contain exactly three entries');
  else if (summary.highlights.some((item) => typeof item.title !== 'string' || !item.title.trim() || typeof item.summary !== 'string' || !item.summary.trim())) {
    failures.push('changelog highlights contain an empty title or summary');
  }
  const suspiciousEncoding = /(?:\uFFFD|\u00C3.|\u00C2.|\u00E2\u20AC|\u00F0\u0178|\?{3,})/u;
  if (Array.isArray(summary.highlights) && summary.highlights.some((item) =>
    suspiciousEncoding.test(String(item?.title ?? '')) || suspiciousEncoding.test(String(item?.summary ?? '')))) {
    failures.push('changelog highlights contain likely mojibake');
  }
  if (summary.sourceCommit !== evidenceSummary.provenance?.sourceCommit) failures.push('changelog sourceCommit does not match evidence sourceCommit');
  if (!/^https:\/\/github\.com\/elliotjung\/pendulum-lab\/blob\/[a-f0-9]{40}\/CHANGELOG\.md$/i.test(summary.sourceUrl ?? '')) {
    failures.push('changelog sourceUrl is missing or not commit-pinned');
  }
}

/**
 * Every static copy of the test count must equal the live evidence summary:
 * the SEO meta descriptions and OG/Twitter alt text on both pages, the no-JS
 * fallback spans, and the count baked into the og-card pixels (tracked via
 * its sidecar assets/og-card-meta.json). Run `node scripts/sync-copy-counts.mjs`
 * plus `npm run build:ko`, and `node scripts/generate-og-card.mjs`, to refresh.
 */
async function checkCopyCounts(summary) {
  const total = summary.tests?.total;
  const passed = summary.tests?.passed;
  if (!Number.isInteger(total) || !Number.isInteger(passed)) return; // already failed above
  const parseCount = (text) => Number.parseInt(text.replaceAll(',', ''), 10);
  for (const pageName of CONTENT_PAGES) {
    const html = await readFile(join(root, pageName), 'utf8').catch(() => null);
    if (html === null) continue; // missing page already reported
    const description = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i)?.[1] ?? '';
    const descCount = description.match(/([\d,]+) (?:verified |unit )?tests/)?.[1] ?? description.match(/([\d,]+)개 단위 테스트/)?.[1];
    if (!descCount || parseCount(descCount) !== total) {
      failures.push(`${pageName}: meta description test count (${descCount ?? 'none'}) != evidence total ${total} — run scripts/sync-copy-counts.mjs and npm run build:ko`);
    }
    for (const alt of [...html.matchAll(/(?:og|twitter):image:alt" content="([^"]*)"/g)].map((m) => m[1])) {
      const altCount = alt.match(/([\d,]+) tests/)?.[1];
      if (!altCount || parseCount(altCount) !== total) {
        failures.push(`${pageName}: image alt test count (${altCount ?? 'none'}) != evidence total ${total} — run scripts/sync-copy-counts.mjs and npm run build:ko`);
      }
    }
  }
  const indexHtml = await readFile(join(root, 'index.html'), 'utf8').catch(() => '');
  const fallbacks = [
    [/data-evidence="tests\.formatted">([^<]*)</, total.toLocaleString('en-US')],
    [/data-count="(\d+)" data-decimals="0" data-evidence-count="tests\.passed"/, String(passed)]
  ];
  for (const [pattern, expected] of fallbacks) {
    const actual = indexHtml.match(pattern)?.[1];
    if (actual !== expected) {
      failures.push(`index.html: static fallback ${pattern} is "${actual ?? 'missing'}", expected "${expected}" — run scripts/sync-copy-counts.mjs`);
    }
  }
  const ledgerCount = indexHtml.match(/data-evidence="ledger\.verify">[^<]*?([\d,]+) unit tests/)?.[1];
  if (!ledgerCount || parseCount(ledgerCount) !== total) {
    failures.push(`index.html: ledger.verify fallback count (${ledgerCount ?? 'none'}) != evidence total ${total} — run scripts/sync-copy-counts.mjs`);
  }
  const ogMeta = await readFile(join(root, 'assets', 'og-card-meta.json'), 'utf8')
    .then((raw) => JSON.parse(raw.replace(/^\uFEFF/, '')))
    .catch(() => null);
  if (!ogMeta || ogMeta.schemaVersion !== 'pendulum-og-card/v1') {
    failures.push('assets/og-card-meta.json missing or wrong schema — run node scripts/generate-og-card.mjs');
  } else if (ogMeta.testsTotal !== total) {
    failures.push(`og-card pixels quote ${ogMeta.testsTotal} tests but evidence says ${total} — run node scripts/generate-og-card.mjs`);
  } else if (ogMeta.sourceEvidenceCommit !== summary.provenance?.sourceCommit) {
    failures.push(`og-card provenance ${ogMeta.sourceEvidenceCommit || 'missing'} does not match evidence ${summary.provenance?.sourceCommit || 'missing'} — regenerate the social card from current evidence`);
  }
}

async function checkPngDimensions(relativePath, expectedWidth, expectedHeight) {
  const bytes = await readFile(join(root, relativePath)).catch(() => null);
  if (!bytes || bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') {
    failures.push(`${relativePath}: missing or invalid PNG`);
    return;
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    failures.push(`${relativePath}: expected ${expectedWidth}x${expectedHeight}, got ${width}x${height}`);
  }
}

async function checkSitemap() {
  const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
  const urls = [...sitemap.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<lastmod>([^<]+)<\/lastmod>[\s\S]*?<\/url>/g)];
  if (urls.length !== 2) failures.push('sitemap must contain two URLs with lastmod values');
  for (const [, loc, lastmod] of urls) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod) || !Number.isFinite(Date.parse(lastmod))) failures.push(`sitemap ${loc}: invalid lastmod ${lastmod}`);
  }
}

function shouldSkip(ref) {
  return (
    ref.startsWith('#') ||
    ref.startsWith('data:') ||
    ref.startsWith('mailto:') ||
    ref.startsWith('tel:') ||
    ref.startsWith('http://') ||
    ref.startsWith('https://')
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function checkEvidenceFreshness(summary) {
  const maxAgeDays = Number.parseFloat(process.env.PENDULUM_EVIDENCE_MAX_AGE_DAYS || '14');
  const generated = Date.parse(summary.generatedAt || '');
  if (!Number.isFinite(generated)) {
    failures.push('evidence summary generatedAt is missing or invalid');
    return;
  }
  const ageDays = (Date.now() - generated) / 86_400_000;
  if (ageDays > maxAgeDays) {
    warnings.push(`evidence summary is ${ageDays.toFixed(1)} days old; refresh from the main repo before release`);
  }
  const expiresAt = Date.parse(summary.provenance?.expiresAt || '');
  if (!Number.isFinite(expiresAt)) failures.push('evidence provenance.expiresAt is missing or invalid');
  else if (Date.now() > expiresAt) failures.push('evidence summary has expired; regenerate it from the main repo');
  if (!/^[a-f0-9]{40}$/i.test(summary.provenance?.sourceCommit || '')) failures.push('evidence provenance.sourceCommit is missing or invalid');
  if (!/^[a-f0-9]{64}$/i.test(summary.provenance?.lockfileSha256 || '')) failures.push('evidence provenance.lockfileSha256 is missing or invalid');
  const expectedCommit = process.env.PENDULUM_EXPECTED_SOURCE_COMMIT;
  if (expectedCommit && summary.provenance?.sourceCommit !== expectedCommit) {
    failures.push(`evidence source commit ${summary.provenance?.sourceCommit ?? 'missing'} does not match dispatched release ${expectedCommit}`);
  }
}

async function compareMainEvidenceIfProvided(summary) {
  const evidencePath = process.env.PENDULUM_LAB_EVIDENCE_PATH;
  if (!evidencePath) return;
  const source = JSON.parse(await readFile(evidencePath, 'utf8'));
  for (const key of ['schemaVersion', 'generatedAt']) {
    if (source[key] !== summary[key]) failures.push(`evidence ${key} mismatch: landing=${summary[key]} main=${source[key]}`);
  }
  for (const key of ['total', 'passed', 'failed', 'files']) {
    if (source.tests?.[key] !== summary.tests?.[key]) failures.push(`evidence tests.${key} mismatch: landing=${summary.tests?.[key]} main=${source.tests?.[key]}`);
  }
  if (source.gpu?.status !== summary.gpu?.status) failures.push(`evidence gpu.status mismatch: landing=${summary.gpu?.status} main=${source.gpu?.status}`);
  if (source.publication?.status !== summary.publication?.status) failures.push(`evidence publication.status mismatch: landing=${summary.publication?.status} main=${source.publication?.status}`);
  if (source.provenance?.sourceCommit !== summary.provenance?.sourceCommit) failures.push('evidence provenance.sourceCommit mismatch');
  if (source.provenance?.lockfileSha256 !== summary.provenance?.lockfileSha256) failures.push('evidence provenance.lockfileSha256 mismatch');
}

async function checkTextEncoding() {
  for (const file of await walk(root)) {
    const rel = relative(root, file).replace(/\\/g, '/');
    const text = await readFile(file, 'utf8');
    text.split(/\r?\n/).forEach((line, index) => {
      for (const [label, regex] of mojibakeRegexes) {
        regex.lastIndex = 0;
        if (!regex.test(line)) continue;
        failures.push(`mojibake ${label}: ${rel}:${index + 1}: ${line.trim().slice(0, 140)}`);
      }
      if (/\?{2,}/.test(line) && !looksLikeCode(line)) {
        failures.push(`mojibake literal-question-run-in-display-text: ${rel}:${index + 1}: ${line.trim().slice(0, 140)}`);
      }
      if (/\?{2,}<\/|<[^>]*>\?{2,}\/?[a-z]/i.test(line)) {
        failures.push(`possibly mangled HTML token: ${rel}:${index + 1}: ${line.trim().slice(0, 140)}`);
      }
    });
  }
}

function looksLikeCode(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.includes('${') ||
    trimmed.includes('=>') ||
    /\b(?:const|let|var|return|if|for|while|switch|case|type|interface|export|import)\b/.test(trimmed) ||
    ((trimmed.includes('??') || trimmed.includes('?.')) && /[`=;(){}[\]]/.test(trimmed))
  );
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry);
    const rel = relative(root, path).replace(/\\/g, '/');
    if ([...ignoredDirs].some((ignored) => rel === ignored || rel.startsWith(`${ignored}/`))) continue;
    const info = await stat(path);
    if (info.isDirectory()) out.push(...await walk(path));
    else if (info.isFile() && textExtensions.has(extname(path).toLowerCase())) out.push(path);
  }
  return out;
}
