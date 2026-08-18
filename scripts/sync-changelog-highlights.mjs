import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// Curated translations are intentionally keyed by both source fields. A title
// alone is not stable enough to safely reuse a Korean summary after upstream
// copy changes. Unknown future entries remain current, explicitly source
// English rather than silently presenting an obsolete machine translation.
const CURATED_KOREAN_HIGHLIGHTS = new Map([
  [
    'Folder rename\u0000the entire docs/ tree moved to documents/ via git mv (history preserved).',
    {
      titleKo: '폴더 이름 변경',
      summaryKo: 'docs/ 트리 전체를 git mv로 documents/로 옮겨 기록을 보존했습니다.'
    }
  ],
  [
    'Cross-repo link\u0000the companion pendulum-landing page (EN + KO) and its docs were repointed to .../blob/master/documents/...',
    {
      titleKo: '저장소 간 연결',
      summaryKo: '연결된 pendulum-landing 페이지(EN + KO)와 문서 링크를 .../blob/master/documents/...로 다시 지정했습니다.'
    }
  ],
  [
    'Historical entries preserved\u0000older CHANGELOG entries keep their original docs/...',
    {
      titleKo: '기존 기록 보존',
      summaryKo: '이전 CHANGELOG 항목은 기존 docs/... 경로를 유지합니다.'
    }
  ]
]);
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
  const summary = sentence;
  const korean = CURATED_KOREAN_HIGHLIGHTS.get(`${title}\u0000${summary}`);
  return korean ? { title, summary, ...korean } : { title, summary };
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

// Keep the no-JS/failed-fetch page truthful too. Runtime hydration still reads
// the same JSON, but this committed fallback must never trail the release it
// claims to summarize.
const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const staticCards = highlights.map((highlight, index) =>
  `      <article class="changelog-card"><span>${String(index + 1).padStart(2, '0')}</span><h3>${escapeHtml(highlight.title)}</h3><p>${escapeHtml(highlight.summary)}</p></article>`
).join('\n');
const indexPath = join(root, 'index.html');
const indexHtml = await readFile(indexPath, 'utf8');
const changelogFallback = /(<div class="changelog-grid" data-changelog-list>)[\s\S]*?(<\/div>\s*<div class="guide-foot reveal">)/;
if (!changelogFallback.test(indexHtml)) throw new Error('could not locate the static changelog fallback in index.html');
const syncedIndex = indexHtml.replace(
  changelogFallback,
  `$1\n${staticCards}\n    $2`
);
if (syncedIndex !== indexHtml) await writeFile(indexPath, syncedIndex, 'utf8');
console.log(`changelog highlights synced from ${sourceCommit.slice(0, 12)}`);
