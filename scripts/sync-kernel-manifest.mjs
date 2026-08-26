import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const assets = join(root, 'assets');
const kernelName = 'pendulum-demo-kernel.js';
const manifestName = 'demo-kernel-manifest.json';
const kernelPath = join(assets, kernelName);
const manifestPath = join(assets, manifestName);
const expectedSchema = 'pendulum-demo-kernel-manifest/v1';
const expectedKernelPath = `assets/${kernelName}`;
const expectedKernelVersion = 'pendulum-demo-kernel/v3';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireLowerHex(name, value, length) {
  if (!new RegExp(`^[0-9a-f]{${length}}$`, 'u').test(value)) {
    throw new Error(`${name} must be a ${length}-character lowercase hexadecimal value`);
  }
}

function decodeCanonicalBase64(name, value) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new Error(`${name} is not canonical base64`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length === 0 || bytes.toString('base64') !== value) {
    throw new Error(`${name} is empty or not canonical base64`);
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

async function readEvidence() {
  const evidence = parseJson('assets/evidence-summary.json', await readFile(join(assets, 'evidence-summary.json')));
  const sourceCommit = evidence?.provenance?.sourceCommit;
  const packageVersion = evidence?.provenance?.packageVersion;
  requireLowerHex('evidence provenance.sourceCommit', sourceCommit ?? '', 40);
  if (typeof packageVersion !== 'string' || packageVersion.trim() === '' || packageVersion === 'unknown') {
    throw new Error('evidence provenance.packageVersion must be a concrete version');
  }
  return { sourceCommit, packageVersion };
}

function validatePair(kernelBytes, manifestBytes, evidenceCoordinate, dispatchedHashes = undefined) {
  const manifest = parseJson('demo-kernel-manifest.json', manifestBytes);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('demo-kernel-manifest.json must contain a JSON object');
  }

  const kernelSha256 = sha256(kernelBytes);
  const manifestSha256 = sha256(manifestBytes);
  if (dispatchedHashes) {
    if (kernelSha256 !== dispatchedHashes.kernelSha256) {
      throw new Error(`kernel SHA-256 ${kernelSha256} does not match dispatched ${dispatchedHashes.kernelSha256}`);
    }
    if (manifestSha256 !== dispatchedHashes.manifestSha256) {
      throw new Error(
        `kernel manifest SHA-256 ${manifestSha256} does not match dispatched ${dispatchedHashes.manifestSha256}`
      );
    }
  }

  const expected = {
    schemaVersion: expectedSchema,
    kernel: expectedKernelPath,
    kernelVersion: expectedKernelVersion,
    sourcePackageVersion: evidenceCoordinate.packageVersion,
    sourceCommit: evidenceCoordinate.sourceCommit,
    sha256: kernelSha256
  };
  for (const [key, value] of Object.entries(expected)) {
    if (manifest[key] !== value) throw new Error(`kernel manifest ${key} mismatch`);
  }
  requireLowerHex('kernel manifest sha256', manifest.sha256, 64);
  return { kernelSha256, manifestSha256, manifest };
}

async function regularFileExists(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile()) throw new Error(`refusing to replace non-regular file: ${path}`);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function writeExclusiveAndSync(path, bytes) {
  const handle = await open(path, 'wx', 0o644);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function replacePair(kernelBytes, manifestBytes, evidenceCoordinate, dispatchedHashes) {
  const token = `${process.pid}.${randomUUID()}`;
  const stagedKernel = join(assets, `.${kernelName}.${token}.tmp`);
  const stagedManifest = join(assets, `.${manifestName}.${token}.tmp`);
  const backupKernel = join(assets, `.${kernelName}.${token}.bak`);
  const backupManifest = join(assets, `.${manifestName}.${token}.bak`);
  const lockPath = join(assets, '.demo-kernel-pair.lock');
  let lock;
  let hadKernel = false;
  let hadManifest = false;
  let kernelReplaced = false;
  let manifestReplaced = false;

  try {
    try {
      lock = await open(lockPath, 'wx', 0o600);
      await lock.writeFile(`${token}\n`);
      await lock.sync();
    } catch (error) {
      if (error?.code === 'EEXIST') throw new Error('another demo-kernel pair materialization is in progress');
      throw error;
    }

    await writeExclusiveAndSync(stagedKernel, kernelBytes);
    await writeExclusiveAndSync(stagedManifest, manifestBytes);
    const [stagedKernelBytes, stagedManifestBytes] = await Promise.all([
      readFile(stagedKernel),
      readFile(stagedManifest)
    ]);
    validatePair(stagedKernelBytes, stagedManifestBytes, evidenceCoordinate, dispatchedHashes);

    hadKernel = await regularFileExists(kernelPath);
    hadManifest = await regularFileExists(manifestPath);
    if (hadKernel) await copyFile(kernelPath, backupKernel, constants.COPYFILE_EXCL);
    if (hadManifest) await copyFile(manifestPath, backupManifest, constants.COPYFILE_EXCL);

    try {
      // The manifest is the commit marker: install bytes first, provenance last.
      await rename(stagedKernel, kernelPath);
      kernelReplaced = true;
      await rename(stagedManifest, manifestPath);
      manifestReplaced = true;
      const [installedKernel, installedManifest] = await Promise.all([readFile(kernelPath), readFile(manifestPath)]);
      validatePair(installedKernel, installedManifest, evidenceCoordinate, dispatchedHashes);
    } catch (replacementError) {
      const rollbackErrors = [];
      if (kernelReplaced) {
        try {
          if (hadKernel) await rename(backupKernel, kernelPath);
          else await rm(kernelPath, { force: true });
        } catch (error) {
          rollbackErrors.push(error);
        }
      }
      if (manifestReplaced) {
        try {
          if (hadManifest) await rename(backupManifest, manifestPath);
          else await rm(manifestPath, { force: true });
        } catch (error) {
          rollbackErrors.push(error);
        }
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [replacementError, ...rollbackErrors],
          'demo-kernel pair replacement and rollback both failed'
        );
      }
      throw replacementError;
    }
  } finally {
    for (const path of [stagedKernel, stagedManifest, backupKernel, backupManifest]) {
      await rm(path, { force: true }).catch((error) => {
        console.error(`sync-kernel-manifest: unable to clean ${path}: ${error.message}`);
      });
    }
    await lock?.close().catch((error) => {
      console.error(`sync-kernel-manifest: unable to close pair lock: ${error.message}`);
    });
    if (lock) {
      await rm(lockPath, { force: true }).catch((error) => {
        console.error(`sync-kernel-manifest: unable to remove pair lock: ${error.message}`);
      });
    }
  }
}

async function materializeDispatchedPair({ requireReleaseTag }) {
  const evidenceCoordinate = await readEvidence();
  if (requireReleaseTag) {
    const releaseTag = requiredEnvironment('RELEASE_TAG');
    if (releaseTag !== `v${evidenceCoordinate.packageVersion}`) {
      throw new Error('RELEASE_TAG does not match evidence provenance.packageVersion');
    }
  }
  const expectedSourceCommit = requiredEnvironment('EXPECTED_SOURCE_COMMIT');
  requireLowerHex('EXPECTED_SOURCE_COMMIT', expectedSourceCommit, 40);
  if (expectedSourceCommit !== evidenceCoordinate.sourceCommit) {
    throw new Error('EXPECTED_SOURCE_COMMIT does not match evidence provenance.sourceCommit');
  }

  const kernelSha256 = requiredEnvironment('EXPECTED_KERNEL_SHA256');
  const manifestSha256 = requiredEnvironment('EXPECTED_KERNEL_MANIFEST_SHA256');
  requireLowerHex('EXPECTED_KERNEL_SHA256', kernelSha256, 64);
  requireLowerHex('EXPECTED_KERNEL_MANIFEST_SHA256', manifestSha256, 64);
  const kernelBytes = decodeCanonicalBase64('KERNEL_BASE64', requiredEnvironment('KERNEL_BASE64'));
  const manifestBytes = decodeCanonicalBase64('KERNEL_MANIFEST_BASE64', requiredEnvironment('KERNEL_MANIFEST_BASE64'));
  const dispatchedHashes = { kernelSha256, manifestSha256 };
  validatePair(kernelBytes, manifestBytes, evidenceCoordinate, dispatchedHashes);
  await replacePair(kernelBytes, manifestBytes, evidenceCoordinate, dispatchedHashes);
  console.log(
    `exact demo-kernel pair installed: sourceCommit=${expectedSourceCommit.slice(0, 12)} sha256=${kernelSha256.slice(0, 12)}…`
  );
}

async function verifyCurrentPair() {
  const evidenceCoordinate = await readEvidence();
  const [kernelBytes, manifestBytes] = await Promise.all([readFile(kernelPath), readFile(manifestPath)]);
  const result = validatePair(kernelBytes, manifestBytes, evidenceCoordinate);
  console.log(
    `demo-kernel pair verified without provenance rewrite: sourceCommit=${evidenceCoordinate.sourceCommit.slice(0, 12)} sha256=${result.kernelSha256.slice(0, 12)}…`
  );
}

try {
  const modes = process.argv.slice(2);
  if (
    modes.length !== 1
    || !['--materialize-dispatched', '--materialize-handoff', '--verify-current'].includes(modes[0])
  ) {
    throw new Error(
      'usage: node scripts/sync-kernel-manifest.mjs '
        + '--materialize-dispatched|--materialize-handoff|--verify-current',
    );
  }
  if (modes[0] === '--materialize-dispatched') await materializeDispatchedPair({ requireReleaseTag: true });
  else if (modes[0] === '--materialize-handoff') await materializeDispatchedPair({ requireReleaseTag: false });
  else await verifyCurrentPair();
} catch (error) {
  console.error(`sync-kernel-manifest: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
