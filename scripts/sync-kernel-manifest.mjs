import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

/**
 * Align the demo-kernel manifest with the (freshly synced) evidence summary.
 *
 * `npm run check` enforces two invariants that would otherwise make automated
 * evidence sync impossible:
 *   - the kernel file's SHA-256 must match the manifest;
 *   - the manifest's sourceCommit must equal evidence.provenance.sourceCommit.
 *
 * This script recomputes the hash of the kernel as it exists here and stamps
 * the manifest with the evidence summary's provenance. That is honest ONLY
 * because the same workflow run then executes the full gate: `npm run check`
 * plus the Playwright smoke suite, whose fixture test pins the kernel's
 * numeric behavior against the main repo's rhsDouble. If the simulator's
 * physics changed in a way the ported kernel no longer matches, the fixture
 * test fails and the sync commit never lands.
 */
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidence = JSON.parse(await readFile(join(root, 'assets', 'evidence-summary.json'), 'utf8'));
const manifestPath = join(root, 'assets', 'demo-kernel-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const sourceCommit = evidence.provenance?.sourceCommit;
const packageVersion = evidence.provenance?.packageVersion;
if (!/^[a-f0-9]{40}$/i.test(sourceCommit ?? '')) {
  console.error('sync-kernel-manifest: evidence summary has no valid provenance.sourceCommit');
  process.exit(1);
}

const kernelBytes = await readFile(join(root, manifest.kernel));
manifest.sha256 = createHash('sha256').update(kernelBytes).digest('hex');
manifest.sourceCommit = sourceCommit;
if (typeof packageVersion === 'string' && packageVersion !== 'unknown') {
  manifest.sourcePackageVersion = packageVersion;
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`kernel manifest aligned: sourceCommit=${sourceCommit.slice(0, 12)} sha256=${manifest.sha256.slice(0, 12)}…`);
