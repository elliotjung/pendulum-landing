import { mkdir, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const port = process.env.LIGHTHOUSE_PORT ?? '4177';
const url = `http://127.0.0.1:${port}/`;
const reportDir = join('reports', 'lighthouse');
const reportPath = join(reportDir, 'lighthouse.json');
const warnThresholds = {
  performance: 0.65,
  accessibility: 0.9,
  'best-practices': 0.85,
  seo: 0.9,
};

await mkdir(reportDir, { recursive: true });
await rm(reportPath, { force: true });

const server = spawn(process.execPath, ['scripts/static-server.mjs', port], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await waitForServer(server);
  const result = await runLighthouse();
  const lhr = JSON.parse(await readFile(reportPath, 'utf8'));
  printScores(lhr);

  if (result.code !== 0) {
    const cleanupOnly =
      process.platform === 'win32' &&
      result.stderr.includes('EPERM') &&
      result.stderr.includes('lighthouse.');

    if (!cleanupOnly) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      console.error(`Lighthouse exited with code ${result.code ?? 1}.`);
      process.exitCode = result.code ?? 1;
    } else {
      console.warn('Lighthouse completed and wrote a report, but Windows Chrome cleanup returned EPERM.');
    }
  }
} finally {
  if (!server.killed) server.kill();
}

async function runLighthouse() {
  return capture(...npxInvocation([
    '--yes',
    'lighthouse@12.6.1',
    url,
    '--quiet',
    '--output=json',
    `--output-path=${reportPath}`,
    '--chrome-flags=--headless=new --no-sandbox --user-data-dir=.lighthouseci/chrome-profile',
  ]));
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let ready = false;
    const timer = setTimeout(() => reject(new Error('Timed out waiting for static server.')), 15000);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      if (!ready && text.includes('Serving HTTP')) {
        ready = true;
        clearTimeout(timer);
        resolve();
      }
    });

    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('exit', (code) => {
      if (!ready) {
        clearTimeout(timer);
        reject(new Error(`Static server exited before it was ready, code ${code}.`));
      }
    });
  });
}

function capture(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

function npxInvocation(args) {
  if (process.platform !== 'win32') return ['npx', args];
  return ['cmd.exe', ['/d', '/s', '/c', 'npx.cmd', ...args]];
}

function printScores(lhr) {
  const scores = Object.entries(warnThresholds).map(([name, threshold]) => {
    const score = lhr.categories?.[name]?.score;
    if (typeof score !== 'number') throw new Error(`Missing Lighthouse category: ${name}`);
    const percent = Math.round(score * 100);
    if (score < threshold) {
      console.warn(`Lighthouse ${name} score ${percent} is below warning threshold ${Math.round(threshold * 100)}.`);
    }
    return `${name} ${percent}`;
  });

  console.log(`Lighthouse scores: ${scores.join(', ')}`);
  console.log(`Lighthouse report: ${reportPath}`);
}
