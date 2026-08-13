'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const LighthouseRunner = require('@lhci/cli/src/collect/node-runner.js');
const {
  isRecoverableWindowsCleanupError
} = require('./lhci-windows-recovery.cjs');

const tempRoot = path.win32.resolve('C:\\workspace\\pendulum-landing\\.lhci-runtime');
const cleanupDir = path.win32.join(tempRoot, 'lighthouse.18278047');
const completeLhr = JSON.stringify({
  lighthouseVersion: '12.6.1',
  requestedUrl: 'http://127.0.0.1:4177/?lang=en',
  finalUrl: 'http://127.0.0.1:4177/?lang=en',
  fetchTime: '2026-07-27T00:00:00.000Z',
  categories: { performance: { score: 0.99 } },
  audits: { 'largest-contentful-paint': { numericValue: 1574 } }
});

function makeError({
  message = 'Lighthouse failed with exit code 1',
  stdout = completeLhr,
  code = 'EPERM',
  reason = 'Permission denied',
  directory = cleanupDir,
  repeatedDirectory = directory,
  variant = 'handled',
  structuredCode = code,
  structuredPath,
  syscall = 'rm',
  generating = true,
  stack = true,
  extraRuntimeError = false
} = {}) {
  const extendedDirectory = `\\\\?\\${directory}`;
  const inspectedStructuredPath = structuredPath ?? extendedDirectory;
  const errorLine = `Error: ${code}, ${reason}: ${extendedDirectory} '\\\\?\\${repeatedDirectory}'`;
  const cleanupDetails = variant === 'uncaught'
    ? [
        'node:fs:1206',
        '  return binding.rmSync(getValidatedPath(path), opts.maxRetries, opts.recursive, opts.retryDelay);',
        '                 ^',
        '',
        errorLine
      ]
    : [
        `Runtime error encountered: ${code}, ${reason}: ${extendedDirectory} '\\\\?\\${repeatedDirectory}'`,
        errorLine
      ];
  const stderr = [
    generating ? '2026-07-27T00:00:00.000Z LH:status Generating results...' : 'Collecting artifacts...',
    ...cleanupDetails,
    variant === 'uncaught' ? '    at rmSync (node:fs:1206:18)' : '',
    stack
      ? '    at Launcher.destroyTmp (file:///C:/workspace/node_modules/chrome-launcher/dist/chrome-launcher.js:367:9)'
      : '    at unrelatedCleanup (file:///C:/workspace/scripts/example.js:1:1)',
    ...(variant === 'uncaught'
      ? [
          '{',
          '  errno: 1,',
          `  code: '${structuredCode}',`,
          `  path: '${inspectedStructuredPath.replaceAll('\\', '\\\\')}',`,
          `  syscall: '${syscall}'`,
          '}',
          '',
          'Node.js v26.3.0'
        ]
      : []),
    extraRuntimeError ? 'Runtime error encountered: PROTOCOL_TIMEOUT' : ''
  ].filter(Boolean).join('\n');
  return { message, stdout, stderr };
}

function recovers(error, overrides = {}) {
  return isRecoverableWindowsCleanupError(error, {
    LighthouseRunner,
    platform: 'win32',
    allowedTempRoot: tempRoot,
    systemTempRoot: tempRoot,
    ...overrides
  });
}

assert.equal(recovers(makeError()), true, 'accepts the one validated post-LHR cleanup failure');
assert.equal(
  recovers(makeError({ variant: 'uncaught' })),
  true,
  'accepts the exact structured uncaught Node rmSync cleanup variant'
);
assert.equal(recovers(makeError(), { platform: 'linux' }), false, 'never applies outside Windows');
assert.equal(recovers(makeError({ message: 'Lighthouse failed with exit code 2' })), false, 'requires exit code 1');
assert.equal(recovers(makeError({ stdout: '{"lighthouseVersion":"12.6.1"}' })), false, 'requires a complete LHR');
assert.equal(
  recovers(makeError({ stdout: completeLhr.slice(0, -1) })),
  false,
  'rejects truncated Lighthouse output'
);
assert.equal(
  recovers(makeError({ stdout: JSON.stringify({ ...JSON.parse(completeLhr), runtimeError: { code: 'ERRORED_DOCUMENT_REQUEST' } }) })),
  false,
  'rejects an LHR with a Lighthouse runtime error'
);
assert.equal(recovers(makeError({ generating: false })), false, 'requires completed result generation');
assert.equal(recovers(makeError({ code: 'EIO', reason: 'I/O error' })), false, 'rejects unrelated I/O errors');
assert.equal(recovers(makeError({ stack: false })), false, 'requires the chrome-launcher destroyTmp stack');
assert.equal(
  recovers(makeError({ directory: 'C:\\Users\\runner\\AppData\\Local\\Temp\\lighthouse.18278047' })),
  false,
  'rejects cleanup outside the isolated runtime directory'
);
assert.equal(
  recovers(makeError({ directory: path.win32.join(tempRoot, 'nested', 'lighthouse.18278047') })),
  false,
  'rejects cleanup below an unexpected nested directory'
);
assert.equal(recovers(makeError({ extraRuntimeError: true })), false, 'rejects multiple runtime errors');
assert.equal(
  recovers(makeError({ repeatedDirectory: path.win32.join(tempRoot, 'lighthouse.99999999') })),
  false,
  'rejects a mismatched repeated cleanup path'
);
assert.equal(
  recovers(makeError({ variant: 'uncaught', structuredCode: 'EACCES' })),
  false,
  'rejects a structured Node error whose code disagrees with the error header'
);
assert.equal(
  recovers(makeError({ variant: 'uncaught', structuredPath: '\\\\?\\C:\\outside\\lighthouse.18278047' })),
  false,
  'rejects a structured Node error whose path disagrees with the error header'
);
assert.equal(
  recovers(makeError({ variant: 'uncaught', syscall: 'unlink' })),
  false,
  'rejects a structured Node error for a different filesystem operation'
);
assert.equal(
  recovers(makeError(), { systemTempRoot: 'C:\\Users\\runner\\AppData\\Local\\Temp' }),
  false,
  'requires the isolated directory to be the child process temp root'
);

console.log('LHCI Windows cleanup recovery contract passed (18 cases)');
