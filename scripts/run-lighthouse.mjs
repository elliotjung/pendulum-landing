import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const port = process.env.LIGHTHOUSE_PORT ?? '4177';
const url = `http://127.0.0.1:${port}/`;
const reportDir = join('reports', 'lighthouse');
const categoryThresholds = {
  performance: 0.9,
  accessibility: 0.95,
  'best-practices': 1,
  seo: 0.95
};
const metricThresholds = {
  'largest-contentful-paint': { label: 'LCP', maximum: 2500, unit: 'ms' },
  'cumulative-layout-shift': { label: 'CLS', maximum: 0.05, unit: '' },
  'total-blocking-time': { label: 'TBT', maximum: 150, unit: 'ms' }
};
const runCount = 3;

await mkdir(reportDir, { recursive: true });
const server = spawn(process.execPath, ['scripts/static-server.mjs', port], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe']
});

try {
  await waitForServer(server);
  const reports = [];
  for (let index = 1; index <= runCount; index += 1) {
    const reportPath = join(reportDir, `lighthouse-run-${index}.json`);
    const profilePath = join('.lighthouseci', `chrome-profile-${index}`);
    await rm(reportPath, { force: true });
    await rm(profilePath, { recursive: true, force: true }).catch(() => undefined);
    const result = await runLighthouse(reportPath, profilePath);
    let lhr;
    try {
      lhr = JSON.parse(await readFile(reportPath, 'utf8'));
    } catch (error) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      throw new Error(`Lighthouse run ${index} did not produce a readable report: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (result.code !== 0 && !isWindowsCleanupOnly(result)) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      throw new Error(`Lighthouse run ${index} exited with code ${result.code ?? 1}.`);
    }
    if (result.code !== 0) console.warn(`Lighthouse run ${index} completed; Windows profile cleanup returned EPERM.`);
    reports.push({ lhr, reportPath });
  }

  const summary = buildMedianSummary(reports.map((item) => item.lhr));
  const representative = reports
    .map((item) => ({ ...item, distance: Math.abs(item.lhr.categories.performance.score - summary.categories.performance) }))
    .sort((a, b) => a.distance - b.distance)[0];
  await copyFile(representative.reportPath, join(reportDir, 'lighthouse.json'));
  await writeFile(join(reportDir, 'lighthouse-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  printSummary(summary);
  assertThresholds(summary);
} finally {
  if (!server.killed) server.kill();
}

function runLighthouse(reportPath, profilePath) {
  return capture(...npxInvocation([
    '--yes',
    'lighthouse@12.6.1',
    url,
    '--quiet',
    '--output=json',
    `--output-path=${reportPath}`,
    `--chrome-flags=--headless=new --no-sandbox --user-data-dir=${profilePath}`
  ]));
}

function buildMedianSummary(lhrs) {
  const categories = Object.fromEntries(Object.keys(categoryThresholds).map((name) => [
    name,
    median(lhrs.map((lhr) => requiredNumber(lhr.categories?.[name]?.score, `category ${name}`)))
  ]));
  const metrics = Object.fromEntries(Object.keys(metricThresholds).map((name) => [
    name,
    median(lhrs.map((lhr) => requiredNumber(lhr.audits?.[name]?.numericValue, `audit ${name}`)))
  ]));
  return { generatedAt: new Date().toISOString(), url, runCount: lhrs.length, aggregation: 'median', categories, metrics };
}

function assertThresholds(summary) {
  const failures = [];
  for (const [name, minimum] of Object.entries(categoryThresholds)) {
    if (summary.categories[name] < minimum) failures.push(`${name} ${(summary.categories[name] * 100).toFixed(0)} < ${minimum * 100}`);
  }
  for (const [name, config] of Object.entries(metricThresholds)) {
    if (summary.metrics[name] > config.maximum) failures.push(`${config.label} ${summary.metrics[name].toFixed(2)}${config.unit} > ${config.maximum}${config.unit}`);
  }
  if (failures.length) throw new Error(`Lighthouse hard gate failed:\n- ${failures.join('\n- ')}`);
}

function printSummary(summary) {
  const scores = Object.entries(summary.categories).map(([name, score]) => `${name} ${Math.round(score * 100)}`);
  const metrics = Object.entries(metricThresholds).map(([name, config]) => `${config.label} ${summary.metrics[name].toFixed(name === 'cumulative-layout-shift' ? 3 : 0)}${config.unit}`);
  console.log(`Lighthouse median (${summary.runCount} runs): ${scores.join(', ')}; ${metrics.join(', ')}`);
  console.log(`Lighthouse reports: ${reportDir}`);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function requiredNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Missing Lighthouse ${label}.`);
  return value;
}

function isWindowsCleanupOnly(result) {
  return process.platform === 'win32' && result.stderr.includes('EPERM') && result.stderr.includes('lighthouse.');
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let ready = false;
    const timer = setTimeout(() => reject(new Error('Timed out waiting for static server.')), 15000);
    child.stdout.on('data', (chunk) => {
      if (!ready && chunk.toString().includes('Serving HTTP')) {
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
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function npxInvocation(args) {
  if (process.platform !== 'win32') return ['npx', args];
  return ['cmd.exe', ['/d', '/s', '/c', 'npx.cmd', ...args]];
}
