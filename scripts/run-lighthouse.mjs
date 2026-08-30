import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpus, totalmem } from 'node:os';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const lighthouseCli = require.resolve('lighthouse/cli');
const port = process.env.LIGHTHOUSE_PORT ?? '4177';
const fixtureMode = process.argv.includes('--regression-fixture');
// Pin both documents explicitly so the host locale cannot silently change
// which language Lighthouse measures.
const targets = fixtureMode
  ? [{ id: 'en-fixture', url: `http://127.0.0.1:${port}/?lang=en&lhFixture=bundle-long-task` }]
  : [
      { id: 'en', url: `http://127.0.0.1:${port}/?lang=en` },
      { id: 'ko', url: `http://127.0.0.1:${port}/ko.html?lang=ko` }
    ];
const reportDir = join('reports', 'lighthouse');
const coldPolicy = {
  categories: { performance: 0.85, accessibility: 0.95, 'best-practices': 1, seo: 0.95 },
  metrics: {
    'largest-contentful-paint': { label: 'LCP', maximum: 3000, unit: 'ms' },
    'cumulative-layout-shift': { label: 'CLS', maximum: 0.05, unit: '' },
    'total-blocking-time': { label: 'TBT', maximum: 300, unit: 'ms' }
  }
};
const warmPolicy = {
  categories: { performance: 0.9, accessibility: 0.95, 'best-practices': 1, seo: 0.95 },
  metrics: {
    'largest-contentful-paint': { label: 'LCP', maximum: 2500, unit: 'ms' },
    'cumulative-layout-shift': { label: 'CLS', maximum: 0.05, unit: '' },
    'total-blocking-time': { label: 'TBT', maximum: 150, unit: 'ms' }
  }
};
const warmRunCount = 3;

await mkdir(reportDir, { recursive: true });
const server = spawn(process.execPath, ['scripts/static-server.mjs', port], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe']
});

try {
  await waitForServer(server);
  if (fixtureMode) await runRegressionFixture();
  else await runLanguageMatrix();
} finally {
  if (!server.killed) server.kill();
}

async function runLanguageMatrix() {
  const matrix = {};
  const runId = Date.now();

  for (const target of targets) {
    const coldReportPath = join(reportDir, `lighthouse-${target.id}-cold.json`);
    const coldProfile = join('.lighthouseci', `chrome-profile-${target.id}-${runId}-cold`);
    const coldLhr = await collectRun(target.url, coldReportPath, coldProfile, { resetProfile: true });
    const coldSummary = buildSummary(target.url, [coldLhr], 'cold-single');

    const warmProfile = join('.lighthouseci', `chrome-profile-${target.id}-${runId}-warm`);
    const warmupPath = join(reportDir, `lighthouse-${target.id}-warmup.json`);
    await collectRun(target.url, warmupPath, warmProfile, { resetProfile: true });
    await rm(warmupPath, { force: true });

    const warmReports = [];
    for (let index = 1; index <= warmRunCount; index += 1) {
      const reportPath = join(reportDir, `lighthouse-${target.id}-warm-${index}.json`);
      const lhr = await collectRun(target.url, reportPath, warmProfile, { preserveStorage: true });
      warmReports.push({ lhr, reportPath });
    }

    const warmMedian = buildSummary(target.url, warmReports.map(({ lhr }) => lhr), 'warm-median');
    const warmPessimistic = buildSummary(target.url, warmReports.map(({ lhr }) => lhr), 'warm-pessimistic');
    const representative = warmReports
      .map((item) => ({
        ...item,
        distance: Math.abs(item.lhr.categories.performance.score - warmMedian.categories.performance)
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    await copyFile(representative.reportPath, join(reportDir, `lighthouse-${target.id}.json`));
    if (target.id === 'en') await copyFile(representative.reportPath, join(reportDir, 'lighthouse.json'));
    await writeJson(join(reportDir, `lighthouse-${target.id}-cold-summary.json`), coldSummary);
    await writeJson(join(reportDir, `lighthouse-${target.id}-summary.json`), warmMedian);

    const slo = {
      generatedAt: new Date().toISOString(),
      target: target.id,
      url: target.url,
      policies: { cold: coldPolicy, warm: warmPolicy },
      cold: coldSummary,
      warm: { median: warmMedian, pessimistic: warmPessimistic },
      runnerFingerprint: await runnerFingerprint([coldLhr, ...warmReports.map(({ lhr }) => lhr)])
    };
    await writeJson(join(reportDir, `lighthouse-${target.id}-slo.json`), slo);

    printSummary(target.id, coldSummary, coldPolicy);
    printSummary(target.id, warmMedian, warmPolicy);
    printSummary(target.id, warmPessimistic, warmPolicy);
    assertThresholds(`${target.id.toUpperCase()} cold`, coldSummary, coldPolicy);
    assertThresholds(`${target.id.toUpperCase()} warm median`, warmMedian, warmPolicy);
    assertThresholds(`${target.id.toUpperCase()} warm pessimistic`, warmPessimistic, warmPolicy);
    matrix[target.id] = slo;
  }

  await writeJson(join(reportDir, 'lighthouse-summary.json'), {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    measurement: {
      coldRunsPerTarget: 1,
      discardedWarmupRunsPerTarget: 1,
      warmRunsPerTarget: warmRunCount,
      aggregations: ['cold-single', 'warm-median', 'warm-pessimistic']
    },
    targets: matrix
  });
}

async function runRegressionFixture() {
  const target = targets[0];
  const reportPath = join(reportDir, 'lighthouse-regression-fixture.json');
  const profilePath = join('.lighthouseci', `chrome-profile-fixture-${Date.now()}`);
  const lhr = await collectRun(target.url, reportPath, profilePath, { resetProfile: true });
  const summary = buildSummary(target.url, [lhr], 'cold-single');
  const failures = thresholdFailures(summary, warmPolicy);
  const longTaskDuration = summary.longTaskAttribution.totalDuration;
  const fixtureDetected = failures.length > 0 && longTaskDuration >= 800;
  await writeJson(join(reportDir, 'lighthouse-regression-fixture-summary.json'), {
    generatedAt: new Date().toISOString(),
    expectedResult: 'hard-gate-failure',
    fixtureDetected,
    failures,
    summary,
    runnerFingerprint: await runnerFingerprint([lhr])
  });
  if (!fixtureDetected) {
    throw new Error(`Actual-bundle Lighthouse regression fixture was not detected (long-task duration ${longTaskDuration.toFixed(0)}ms; failures: ${failures.join(', ') || 'none'}).`);
  }
  console.log(`Lighthouse regression fixture correctly failed the real bundle gate: ${failures.join('; ')}.`);
}

async function collectRun(targetUrl, reportPath, profilePath, { resetProfile = false, preserveStorage = false } = {}) {
  await rm(reportPath, { force: true });
  if (resetProfile) await rm(profilePath, { recursive: true, force: true }).catch(() => undefined);
  const result = await runLighthouse(targetUrl, reportPath, profilePath, { preserveStorage });
  let lhr;
  try {
    lhr = JSON.parse(await readFile(reportPath, 'utf8'));
  } catch (error) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`Lighthouse did not produce a readable report: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (result.code !== 0 && !isWindowsCleanupOnly(result)) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`Lighthouse exited with code ${result.code ?? 1}.`);
  }
  if (result.code !== 0) console.warn('Lighthouse completed; Windows profile cleanup returned EPERM/EBUSY.');
  return lhr;
}

function runLighthouse(targetUrl, reportPath, profilePath, { preserveStorage = false } = {}) {
  const args = [
    lighthouseCli,
    targetUrl,
    '--quiet',
    '--output=json',
    `--output-path=${reportPath}`,
    `--chrome-flags=--headless=new --no-sandbox --user-data-dir=${profilePath}`
  ];
  if (preserveStorage) args.push('--disable-storage-reset');
  return capture(process.execPath, args);
}

function buildSummary(targetUrl, lhrs, aggregation) {
  const aggregate = aggregation === 'warm-pessimistic'
    ? { category: (values) => Math.min(...values), metric: (values) => Math.max(...values) }
    : { category: median, metric: median };
  const categories = Object.fromEntries(Object.keys(warmPolicy.categories).map((name) => [
    name,
    aggregate.category(lhrs.map((lhr) => requiredNumber(lhr.categories?.[name]?.score, `category ${name}`)))
  ]));
  const metrics = Object.fromEntries(Object.keys(warmPolicy.metrics).map((name) => [
    name,
    aggregate.metric(lhrs.map((lhr) => requiredNumber(lhr.audits?.[name]?.numericValue, `audit ${name}`)))
  ]));
  return {
    generatedAt: new Date().toISOString(),
    url: targetUrl,
    runCount: lhrs.length,
    aggregation,
    categories,
    metrics,
    longTaskAttribution: aggregateLongTasks(lhrs, aggregation)
  };
}

function aggregateLongTasks(lhrs, aggregation) {
  const entries = lhrs.map((lhr) => {
    const tasks = Array.isArray(lhr.audits?.['long-tasks']?.details?.items)
      ? lhr.audits['long-tasks'].details.items
      : [];
    const byUrl = new Map();
    for (const task of tasks) {
      const url = typeof task.url === 'string' && task.url ? task.url : '(unattributed)';
      const duration = Number.isFinite(task.duration) ? task.duration : 0;
      byUrl.set(url, (byUrl.get(url) ?? 0) + duration);
    }
    return {
      totalDuration: [...byUrl.values()].reduce((sum, duration) => sum + duration, 0),
      unattributedDuration: byUrl.get('(unattributed)') ?? 0,
      sources: [...byUrl.entries()]
        .map(([url, duration]) => ({ url, duration }))
        .sort((a, b) => b.duration - a.duration)
    };
  });
  const index = aggregation === 'warm-pessimistic'
    ? entries.reduce((worst, item, itemIndex) => item.totalDuration > entries[worst].totalDuration ? itemIndex : worst, 0)
    : entries
        .map((item, itemIndex) => ({ itemIndex, distance: Math.abs(item.totalDuration - median(entries.map(({ totalDuration }) => totalDuration))) }))
        .sort((a, b) => a.distance - b.distance)[0].itemIndex;
  return entries[index];
}

function thresholdFailures(summary, policy) {
  const failures = [];
  for (const [name, minimum] of Object.entries(policy.categories)) {
    if (summary.categories[name] < minimum) failures.push(`${name} ${(summary.categories[name] * 100).toFixed(0)} < ${minimum * 100}`);
  }
  for (const [name, config] of Object.entries(policy.metrics)) {
    if (summary.metrics[name] > config.maximum) failures.push(`${config.label} ${summary.metrics[name].toFixed(2)}${config.unit} > ${config.maximum}${config.unit}`);
  }
  return failures;
}

function assertThresholds(label, summary, policy) {
  const failures = thresholdFailures(summary, policy);
  if (failures.length) throw new Error(`Lighthouse ${label} hard gate failed:\n- ${failures.join('\n- ')}`);
}

function printSummary(targetId, summary, policy) {
  const scores = Object.entries(summary.categories).map(([name, score]) => `${name} ${Math.round(score * 100)}`);
  const metrics = Object.entries(policy.metrics).map(([name, config]) => `${config.label} ${summary.metrics[name].toFixed(name === 'cumulative-layout-shift' ? 3 : 0)}${config.unit}`);
  console.log(`Lighthouse ${targetId.toUpperCase()} ${summary.aggregation} (${summary.runCount} run${summary.runCount === 1 ? '' : 's'}): ${scores.join(', ')}; ${metrics.join(', ')}`);
}

async function runnerFingerprint(lhrs) {
  const lighthousePackage = JSON.parse(await readFile(join(dirname(lighthouseCli), '..', 'package.json'), 'utf8'));
  const processors = cpus();
  return {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpuModel: processors[0]?.model ?? 'unknown',
    logicalCpuCount: processors.length,
    totalMemoryBytes: totalmem(),
    ci: process.env.CI === 'true',
    githubRunnerImage: process.env.ImageOS || null,
    lighthouse: lighthousePackage.version,
    benchmarkIndex: median(lhrs.map((lhr) => requiredNumber(lhr.environment?.benchmarkIndex, 'environment benchmarkIndex')))
  };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
  return process.platform === 'win32'
    && /EPERM|EBUSY/.test(result.stderr)
    && /lighthouse\.|chrome-profile/.test(result.stderr);
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
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
