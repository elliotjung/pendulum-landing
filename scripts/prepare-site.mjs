import { access, cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Materialize the only files that may be published. Both GitHub Pages and the
 * optional Cloudflare mirror use this same deterministic staging step, so a
 * dashboard build cannot accidentally expose repository source, reports, or
 * package metadata.
 *
 * Run: npm run prepare:site [-- --headers]
 */
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argumentsList = process.argv.slice(2);
const includeHeaders = argumentsList.includes('--headers');
if (argumentsList.some((argument) => argument !== '--headers')) {
  throw new Error('usage: npm run prepare:site [-- --headers]');
}

const site = resolve(root, '_site');
if (relative(root, site) !== '_site') {
  throw new Error('refusing to prepare a publish directory outside this repository');
}

const publicEntries = [
  'index.html',
  'ko.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  'assets'
];
if (includeHeaders) publicEntries.push('_headers');

for (const entry of publicEntries) {
  try {
    await access(join(root, entry));
  } catch {
    throw new Error(`required publish entry is missing: ${entry}`);
  }
}

// `_site` is an ignored, generated directory. Clearing this exact, resolved
// child prevents stale assets from surviving between Pages builds.
await rm(site, { recursive: true, force: true });
await mkdir(site, { recursive: true });
for (const entry of publicEntries) {
  await cp(join(root, entry), join(site, entry), { recursive: entry === 'assets' });
}

const forbidden = ['package.json', 'package-lock.json', 'scripts', 'tests', '_headers'];
for (const entry of forbidden) {
  if (includeHeaders && entry === '_headers') continue;
  try {
    await access(join(site, entry));
    throw new Error(`forbidden publish entry was staged: ${entry}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

console.log(`prepared _site/ with ${publicEntries.length} allowlisted entries${includeHeaders ? ' and headers' : ''}`);
