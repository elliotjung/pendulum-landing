'use strict';

const os = require('node:os');
const path = require('node:path');

const RECOVERY_MARK = Symbol.for('pendulum.lhci.windowsCleanupRecovery');

function normalizeWindowsPath(value) {
  if (typeof value !== 'string' || !value) return '';
  return path.win32
    .resolve(value.replace(/^\\\\\?\\/, ''))
    .replace(/[\\/]+$/, '')
    .toLowerCase();
}

function isCompleteLhr(stdout, LighthouseRunner) {
  const output = typeof stdout === 'string' ? stdout.trim() : '';
  if (!LighthouseRunner.isOutputLhrLike(output)) return false;

  try {
    const lhr = JSON.parse(output);
    return (
      typeof lhr.lighthouseVersion === 'string'
      && typeof lhr.requestedUrl === 'string'
      && typeof lhr.finalUrl === 'string'
      && typeof lhr.fetchTime === 'string'
      && lhr.categories !== null
      && typeof lhr.categories === 'object'
      && Object.keys(lhr.categories).length > 0
      && lhr.audits !== null
      && typeof lhr.audits === 'object'
      && Object.keys(lhr.audits).length > 0
      && !lhr.runtimeError
    );
  } catch {
    return false;
  }
}

function isRecoverableWindowsCleanupError(
  error,
  {
    LighthouseRunner,
    platform = process.platform,
    allowedTempRoot = process.env.PENDULUM_LHCI_TEMP,
    systemTempRoot = os.tmpdir()
  } = {}
) {
  if (platform !== 'win32' || !error || !LighthouseRunner) return false;
  if (!/^Lighthouse failed with exit code 1$/.test(String(error.message))) return false;
  if (!isCompleteLhr(error.stdout, LighthouseRunner)) return false;

  const stderr = typeof error.stderr === 'string'
    ? error.stderr.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    : '';
  if (!stderr.includes('Generating results...')) return false;
  if ((stderr.match(/^Error:\s*(?:EPERM|EACCES),/gim) ?? []).length !== 1) return false;
  if (!/at Launcher\.destroyTmp\s+\([^\r\n]*chrome-launcher[\\/]+dist[\\/]+chrome-launcher\.js:\d+:\d+\)/.test(stderr)) {
    return false;
  }

  const errorMatch = stderr.match(
    /^Error:\s*(EPERM|EACCES),\s*(?:Permission denied|access denied):\s*((?:\\\\\?\\)?[A-Za-z]:\\[^\r\n]*?\\lighthouse\.\d+)(?:\s+'((?:\\\\\?\\)?[A-Za-z]:\\[^'\r\n]*?\\lighthouse\.\d+)')?\s*$/im
  );
  if (!errorMatch) return false;

  const runtimeMatches = stderr.match(/Runtime error encountered:/g) ?? [];
  const runtimeMatch = stderr.match(
    /^Runtime error encountered:\s*(EPERM|EACCES),\s*(?:Permission denied|access denied):\s*((?:\\\\\?\\)?[A-Za-z]:\\[^\r\n]*?\\lighthouse\.\d+)(?:\s+'((?:\\\\\?\\)?[A-Za-z]:\\[^'\r\n]*?\\lighthouse\.\d+)')?\s*$/im
  );
  const isHandledRuntimeError = runtimeMatches.length === 1 && runtimeMatch;
  const isUncaughtNodeError = runtimeMatches.length === 0 && isStructuredNodeRmError(stderr, errorMatch);
  if (!isHandledRuntimeError && !isUncaughtNodeError) return false;
  if (
    runtimeMatch
    && (
      runtimeMatch[1].toUpperCase() !== errorMatch[1].toUpperCase()
      || normalizeWindowsPath(runtimeMatch[2]) !== normalizeWindowsPath(errorMatch[2])
      || normalizeWindowsPath(runtimeMatch[3]) !== normalizeWindowsPath(errorMatch[3])
    )
  ) {
    return false;
  }

  const allowed = normalizeWindowsPath(allowedTempRoot);
  const systemTemp = normalizeWindowsPath(systemTempRoot);
  const cleanupDir = normalizeWindowsPath(errorMatch[2]);
  const repeatedCleanupDir = normalizeWindowsPath(errorMatch[3]);
  if (!allowed || allowed !== systemTemp) return false;
  if (repeatedCleanupDir && repeatedCleanupDir !== cleanupDir) return false;
  if (path.win32.basename(cleanupDir).match(/^lighthouse\.\d+$/i) === null) return false;
  return normalizeWindowsPath(path.win32.dirname(cleanupDir)) === allowed;
}

function isStructuredNodeRmError(stderr, errorMatch) {
  if (!/^\s*at rmSync \(node:fs:\d+:\d+\)\s*$/m.test(stderr)) return false;
  if (!/^Node\.js v\d+\.\d+\.\d+\s*$/m.test(stderr)) return false;
  if (!/^\s*errno:\s*-?\d+,\s*$/m.test(stderr)) return false;
  if (!/^\s*syscall:\s*'rm'\s*$/m.test(stderr)) return false;

  const structuredCode = stderr.match(/^\s*code:\s*'(EPERM|EACCES)',\s*$/m)?.[1];
  if (!structuredCode || structuredCode.toUpperCase() !== errorMatch[1].toUpperCase()) return false;

  const inspectedPath = errorMatch[2].replaceAll('\\', '\\\\').replaceAll("'", "\\'");
  return stderr.includes(`  path: '${inspectedPath}',`);
}

function installWindowsCleanupRecovery() {
  const entry = String(process.argv[1] ?? '').replaceAll('\\', '/');
  if (
    process.platform !== 'win32'
    || process.argv[2] !== 'collect'
    || !entry.endsWith('/@lhci/cli/src/cli.js')
  ) {
    return;
  }

  const LighthouseRunner = require('@lhci/cli/src/collect/node-runner.js');
  if (LighthouseRunner.prototype[RECOVERY_MARK]) return;

  const originalRun = LighthouseRunner.prototype.run;
  LighthouseRunner.prototype.run = async function runWithWindowsCleanupRecovery(url, options) {
    try {
      return await originalRun.call(this, url, options);
    } catch (error) {
      if (!isRecoverableWindowsCleanupError(error, { LighthouseRunner })) throw error;
      process.stderr.write(
        '[lhci] Accepted a complete LHR after an isolated Windows Chrome-profile cleanup error; deferred cleanup remains mandatory.\n'
      );
      return error.stdout;
    }
  };
  Object.defineProperty(LighthouseRunner.prototype, RECOVERY_MARK, { value: true });
}

installWindowsCleanupRecovery();

module.exports = {
  isCompleteLhr,
  isRecoverableWindowsCleanupError,
  isStructuredNodeRmError,
  normalizeWindowsPath
};
