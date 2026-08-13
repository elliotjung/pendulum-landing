import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidence = JSON.parse(await readFile(join(root, 'assets', 'evidence-summary.json'), 'utf8'));
const sourceCommit = evidence.provenance?.sourceCommit;
if (!/^[a-f0-9]{40}$/i.test(sourceCommit ?? '')) throw new Error('evidence summary has no valid source commit');
const generatedAt = evidence.generatedAt;
if (!generatedAt || new Date(generatedAt).toISOString() !== generatedAt) {
  throw new Error('evidence summary has no canonical generatedAt timestamp');
}

let markdown;
const localPath = process.env.PENDULUM_LAB_CHANGELOG_PATH;
if (localPath) markdown = await readFile(localPath, 'utf8');
else {
  const url = `https://raw.githubusercontent.com/elliotjung/pendulum-lab/${sourceCommit}/CHANGELOG.md`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
  markdown = await response.text();
}

const sections = markdown.split(/^##\s+/m);
const unreleased = sections.find((section) => section.startsWith('Unreleased')) ?? '';
const packageVersion = String(evidence.provenance?.packageVersion ?? '');
const releaseSection = sections.find((section) => section.startsWith(`${packageVersion} `)) ?? '';
const selectedSection = /^-\s+/m.test(unreleased) ? unreleased : releaseSection;
const bullets = [];
let current = '';
for (const line of selectedSection.split(/\r?\n/).slice(1)) {
  if (/^###\s+/.test(line)) continue;
  if (/^-\s+/.test(line)) {
    if (current) bullets.push(current);
    current = line.replace(/^-\s+/, '');
  } else if (current && /^\s{2,}\S/.test(line)) current += ` ${line.trim()}`;
  if (bullets.length >= 3) break;
}
if (current && bullets.length < 3) bullets.push(current);
const plain = (value) => value
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/[*_`]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const highlights = bullets.slice(0, 3).map((bullet) => {
  const titleMatch = bullet.match(/^\*\*([^*]+)\*\*:?\s*(.*)$/);
  const title = plain(titleMatch?.[1] ?? bullet.split(':')[0] ?? bullet);
  const rest = plain(titleMatch?.[2] ?? bullet.slice(title.length));
  const sentence = rest.match(/^(.{1,236}?[.!?])(?:\s|$)/)?.[1] ?? `${rest.slice(0, 233)}${rest.length > 233 ? '…' : ''}`;
  return { title, summary: sentence };
});
if (highlights.length !== 3) throw new Error(`expected three highlights for Unreleased or ${packageVersion}, found ${highlights.length}`);

const output = {
  schemaVersion: 'pendulum-changelog-highlights/v1',
  generatedAt,
  sourceCommit,
  sourceUrl: `https://github.com/elliotjung/pendulum-lab/blob/${sourceCommit}/CHANGELOG.md`,
  highlights
};
await writeFile(join(root, 'assets', 'changelog-highlights.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`changelog highlights synced from ${sourceCommit.slice(0, 12)}`);
