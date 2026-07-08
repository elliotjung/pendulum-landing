import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = await readFile(join(root, 'index.html'), 'utf8');
const failures = [];

for (const forbidden of ['fonts.googleapis.com', 'fonts.gstatic.com']) {
  if (html.includes(forbidden)) failures.push(`external font host still referenced: ${forbidden}`);
}

const attrPattern = /\b(?:href|src)=["']([^"']+)["']/g;
for (const match of html.matchAll(attrPattern)) {
  const ref = match[1];
  if (!ref || shouldSkip(ref)) continue;
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean) continue;
  try {
    await access(join(root, clean));
  } catch {
    failures.push(`missing local asset: ${ref}`);
  }
}

const evidence = JSON.parse(await readFile(join(root, 'assets', 'evidence-summary.json'), 'utf8'));
if (evidence.schemaVersion !== 'pendulum-evidence-summary/v1') {
  failures.push(`unexpected evidence schema: ${evidence.schemaVersion ?? 'missing'}`);
}
if (!Number.isFinite(evidence.tests?.total) || evidence.tests.total <= 0) {
  failures.push('evidence summary is missing a positive tests.total');
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
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
