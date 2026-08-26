import { createHash, randomUUID } from 'node:crypto';
import { open, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidenceOutput = resolve(process.env.PENDULUM_EVIDENCE_OUTPUT || join(root, 'assets', 'evidence-summary.json'));
const auditOutput = resolve(
  process.env.PENDULUM_HANDOFF_AUDIT_OUTPUT || join(root, 'reports', 'deployment', 'lab-evidence-handoff.json'),
);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireLowerHex(name, value, length) {
  if (!new RegExp(`^[0-9a-f]{${length}}$`, 'u').test(value)) {
    throw new Error(`${name} must be a ${length}-character lowercase hexadecimal value`);
  }
}

function requirePositiveIntegerString(name, value) {
  if (!/^[1-9][0-9]*$/u.test(value)) throw new Error(`${name} must be a positive integer string`);
}

function decodeCanonicalBase64(name, value) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new Error(`${name} is not canonical base64`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length === 0 || bytes.length > 256 * 1024 || bytes.toString('base64') !== value) {
    throw new Error(`${name} is empty, oversized, or not canonical base64`);
  }
  return bytes;
}

function parseJson(name, bytes) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(`${name} is not valid UTF-8 JSON`, { cause: error });
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function writeAtomic(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${path.split(/[\\/]/u).at(-1)}.${process.pid}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o644);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

const schemaVersion = required('HANDOFF_SCHEMA');
const coordinatePolicy = required('HANDOFF_POLICY');
if (schemaVersion !== 'pendulum-deployed-evidence-handoff/v1') throw new Error('unsupported handoff schema');
if (coordinatePolicy !== 'continuous-pages-artifact') throw new Error('unsupported handoff coordinate policy');

const sourceCommit = required('EXPECTED_SOURCE_COMMIT');
const packageVersion = required('EXPECTED_PACKAGE_VERSION');
const mainlineRunId = required('LAB_MAINLINE_RUN_ID');
const pagesRunId = required('LAB_PAGES_RUN_ID');
const pagesRunAttempt = required('LAB_PAGES_RUN_ATTEMPT');
const evidenceSha256 = required('EXPECTED_EVIDENCE_SHA256');
const deploymentManifestSha256 = required('EXPECTED_DEPLOYMENT_MANIFEST_SHA256');
requireLowerHex('EXPECTED_SOURCE_COMMIT', sourceCommit, 40);
requireLowerHex('EXPECTED_EVIDENCE_SHA256', evidenceSha256, 64);
requireLowerHex('EXPECTED_DEPLOYMENT_MANIFEST_SHA256', deploymentManifestSha256, 64);
for (const [name, value] of Object.entries({ mainlineRunId, pagesRunId, pagesRunAttempt })) {
  requirePositiveIntegerString(name, value);
}
if (!packageVersion.trim() || packageVersion === 'unknown') throw new Error('EXPECTED_PACKAGE_VERSION is invalid');

const evidenceBytes = decodeCanonicalBase64('EVIDENCE_BASE64', required('EVIDENCE_BASE64'));
const actualEvidenceSha256 = sha256(evidenceBytes);
if (actualEvidenceSha256 !== evidenceSha256) {
  throw new Error(`evidence SHA-256 ${actualEvidenceSha256} does not match dispatched ${evidenceSha256}`);
}
const evidence = parseJson('evidence summary', evidenceBytes);
if (evidence?.schemaVersion !== 'pendulum-evidence-summary/v1') throw new Error('unsupported evidence schema');
if (evidence?.provenance?.sourceCommit !== sourceCommit) throw new Error('evidence source commit mismatch');
if (evidence?.provenance?.packageVersion !== packageVersion) throw new Error('evidence package version mismatch');
if (evidence?.provenance?.dirtyWorktree !== false) throw new Error('refusing evidence generated from a dirty worktree');
requireLowerHex('evidence provenance.lockfileSha256', evidence?.provenance?.lockfileSha256 ?? '', 64);
const generatedAt = Date.parse(evidence?.generatedAt ?? '');
const expiresAt = Date.parse(evidence?.provenance?.expiresAt ?? '');
if (!Number.isFinite(generatedAt) || !Number.isFinite(expiresAt) || expiresAt <= generatedAt || expiresAt <= Date.now()) {
  throw new Error('refusing malformed or expired evidence');
}
const total = evidence?.tests?.total;
if (
  !Number.isInteger(total)
  || total <= 0
  || evidence?.tests?.passed !== total
  || evidence?.tests?.failed !== 0
  || evidence?.tests?.success !== true
) {
  throw new Error('refusing unsuccessful or incomplete evidence');
}
const claimIds = [
  'tests.unit',
  'validation.scipy.regular',
  'testing.mutation',
  'benchmark.energy.methods',
  'gpu.vendor-matrix',
  'publication.release',
];
const claimLevels = new Set(['withheld', 'informational', 'measured', 'validated', 'publication-ready']);
const claimSurface = evidence?.claimEvidence;
if (
  claimSurface?.schemaVersion !== 'pendulum-claim-evidence-surface/v1'
  || claimSurface?.loadState !== 'loaded'
  || claimSurface?.evidenceSourceCommit !== sourceCommit
  || claimSurface?.evidenceExpiresAt !== evidence?.provenance?.expiresAt
  || !Array.isArray(claimSurface?.claims)
  || claimSurface.claims.length !== claimIds.length
) {
  throw new Error('refusing evidence without a canonical source-bound claim surface');
}
const claimById = new Map();
for (const claim of claimSurface.claims) {
  if (
    !claimIds.includes(claim?.id)
    || claimById.has(claim.id)
    || !claimLevels.has(claim?.effectiveVisibleLevel)
    || (claim.effectiveVisibleLevel === 'withheld' && claim.displayValue !== null)
    || !Array.isArray(claim?.caveats)
    || typeof claim?.sourceArtifact !== 'string'
    || !/^[a-f0-9]{64}$/.test(evidence?.sourceReportSha256?.[claim.sourceArtifact] || '')
    || claim.sourceArtifactSha256 !== evidence.sourceReportSha256[claim.sourceArtifact]
  ) {
    throw new Error(`refusing malformed canonical claim ${String(claim?.id || 'unknown')}`);
  }
  claimById.set(claim.id, claim);
}
if (claimIds.some((id) => !claimById.has(id))) throw new Error('canonical claim surface is incomplete');

await writeAtomic(evidenceOutput, evidenceBytes);
const installedBytes = await readFile(evidenceOutput);
if (sha256(installedBytes) !== evidenceSha256) throw new Error('installed evidence failed its post-write hash check');

const audit = {
  schemaVersion: 'pendulum-landing-evidence-handoff-audit/v1',
  materializedAt: new Date().toISOString(),
  landingWorkflowRunId: process.env.GITHUB_RUN_ID || null,
  coordinate: {
    policy: coordinatePolicy,
    sourceCommit,
    packageVersion,
    mainlineRunId,
    pagesRunId,
    pagesRunAttempt,
  },
  evidence: { sha256: evidenceSha256, bytes: evidenceBytes.length },
  deployment: { manifestSha256: deploymentManifestSha256 },
  expectedKernel: {
    sha256: process.env.EXPECTED_KERNEL_SHA256 || null,
    manifestSha256: process.env.EXPECTED_KERNEL_MANIFEST_SHA256 || null,
  },
};
await writeAtomic(auditOutput, Buffer.from(`${JSON.stringify(audit, null, 2)}\n`));
console.log(
  `exact deployed evidence installed: sourceCommit=${sourceCommit.slice(0, 12)} `
    + `pagesRun=${pagesRunId} sha256=${evidenceSha256.slice(0, 12)}…`,
);
