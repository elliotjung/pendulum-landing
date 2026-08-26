import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const lhciCli = require.resolve('@lhci/cli/src/cli.js');
const isWindows = process.platform === 'win32';
const runtimeTemp = join(root, '.lhci-runtime');

if (isWindows) {
  await resetRuntimeTemp();
}

const inheritedNodeOptions = process.env.NODE_OPTIONS?.trim();
const recoveryPreload = '--require=./scripts/lhci-windows-recovery.cjs';
const env = {
  ...process.env,
  ...(isWindows
    ? {
        TEMP: runtimeTemp,
        TMP: runtimeTemp,
        TMPDIR: runtimeTemp,
        PENDULUM_LHCI_TEMP: runtimeTemp,
        NODE_OPTIONS: [inheritedNodeOptions, recoveryPreload].filter(Boolean).join(' ')
      }
    : {})
};

// GitHub-hosted runners consistently pay a one-time Chrome/Lighthouse startup
// penalty on the first document (and sometimes the first locale). Calibrate the
// runtime with the existing independent three-run median gate before LHCI's
// stricter pessimistic gate. This keeps every measured LHCI run accountable
// without lowering any release threshold to accommodate host cold-start noise.
if (process.env.CI === 'true' && process.env.PENDULUM_LHCI_SKIP_CALIBRATION !== '1') {
  console.log('[lhci] Calibrating the cold CI runtime before the pessimistic release gate...');
  const calibration = spawn(process.execPath, [join(root, 'scripts', 'run-lighthouse.mjs')], {
    cwd: root,
    env: { ...env, LIGHTHOUSE_PORT: '4176' },
    stdio: 'inherit',
    windowsHide: true
  });
  const calibrationResult = await waitForChild(calibration);
  if (calibrationResult.signal || calibrationResult.code !== 0) {
    const reason = calibrationResult.signal
      ? `signal ${calibrationResult.signal}`
      : `exit code ${calibrationResult.code ?? 1}`;
    throw new Error(`Lighthouse CI calibration failed with ${reason}.`);
  }
}

const child = spawn(process.execPath, [lhciCli, 'autorun', ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: true
});

const result = await waitForChild(child);

let cleanupFailed = false;
if (isWindows) {
  try {
    await resetRuntimeTemp({ recreate: false });
  } catch (error) {
    cleanupFailed = true;
    console.error(`[lhci] Could not remove the isolated Chrome runtime directory: ${error.message}`);
  }
}

if (result.signal) {
  console.error(`[lhci] Lighthouse CI terminated by ${result.signal}.`);
  process.exitCode = 1;
} else if (result.code !== 0) {
  process.exitCode = result.code ?? 1;
} else if (cleanupFailed) {
  process.exitCode = 1;
}

async function resetRuntimeTemp({ recreate = true } = {}) {
  await rm(runtimeTemp, {
    force: true,
    maxRetries: 30,
    recursive: true,
    retryDelay: 100
  });
  if (await exists(runtimeTemp)) {
    throw new Error(`${runtimeTemp} still exists after recursive cleanup`);
  }
  if (recreate) await mkdir(runtimeTemp, { recursive: true });
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
