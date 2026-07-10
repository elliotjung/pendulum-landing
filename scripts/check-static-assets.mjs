import { access, readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = await readFile(join(root, 'index.html'), 'utf8');
const failures = [];
const warnings = [];

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

for (const forbidden of ['fonts.googleapis.com', 'fonts.gstatic.com']) {
  if (html.includes(forbidden)) failures.push(`external font host still referenced: ${forbidden}`);
}
const csp = html.match(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"/i)?.[1] ?? '';
const scriptPolicy = csp.match(/(?:^|;)\s*script-src\s+([^;]+)/i)?.[1] ?? '';
if (scriptPolicy.includes("'unsafe-inline'")) {
  failures.push('CSP script-src must not allow unsafe-inline');
}
if (/style-src-attr[^;]*'unsafe-inline'/i.test(csp)) {
  warnings.push('CSP style-src-attr remains narrowly enabled for runtime animation state');
}

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
      failures.push(`missing local asset: ${ref}`);
    }
  }
}

const evidence = JSON.parse(await readFile(join(root, 'assets', 'evidence-summary.json'), 'utf8'));
const kernelManifest = JSON.parse(await readFile(join(root, 'assets', 'demo-kernel-manifest.json'), 'utf8'));
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
