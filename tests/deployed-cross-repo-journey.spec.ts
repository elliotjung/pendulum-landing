import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, test, type APIRequestContext, type APIResponse, type Browser, type Page, type Response } from '@playwright/test';

const landingEnUrl = process.env.PENDULUM_LIVE_LANDING_EN_URL;
const landingKoUrl = process.env.PENDULUM_LIVE_LANDING_KO_URL;
const labUrl = process.env.PENDULUM_LIVE_LAB_URL;
const expectedLandingCommit = process.env.PENDULUM_EXPECTED_LANDING_COMMIT || null;
const configured = Boolean(landingEnUrl && landingKoUrl && labUrl);
test.skip(!configured, 'Set all three PENDULUM_LIVE_* URLs to run the public deployed journey.');

const expectedQuery = {
  goal: 'explore',
  audience: 'beginner',
  tab: 'lab',
  sysType: 'double',
  th1: '2.18',
  th2: '2.64',
  iw1: '0',
  iw2: '0',
  m1: '1',
  m2: '1',
  l1: '1',
  l2: '1',
  g: '9.81',
  gamma: '0.06',
} as const;
const headerNames = [
  'content-security-policy',
  'strict-transport-security',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'x-content-type-options',
  'x-frame-options',
  'origin-agent-cluster',
  'referrer-policy',
  'permissions-policy',
] as const;
const claimIds = [
  'tests.unit',
  'validation.scipy.regular',
  'testing.mutation',
  'benchmark.energy.methods',
  'gpu.vendor-matrix',
  'publication.release',
] as const;
const claimLevels = ['withheld', 'informational', 'measured', 'validated', 'publication-ready'] as const;
const claimLevelRank = Object.fromEntries(claimLevels.map((level, index) => [level, index]));

function selectedHeaders(headers: Record<string, string>): Record<string, string | null> {
  return Object.fromEntries(headerNames.map((name) => [name, headers[name] ?? null]));
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function contract(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseBoundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isInteger(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

function errorDetails(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: 'Error', message: String(error) };
}

function assertCtaQuery(url: URL, language: 'en' | 'ko', hydrated: boolean): void {
  for (const [name, value] of Object.entries(expectedQuery)) expect(url.searchParams.get(name), name).toBe(value);
  expect(url.searchParams.get('lang')).toBe(language);
  if (hydrated) {
    expect(url.searchParams.get('utm_source')).toBe('pendulum-landing');
    expect(url.searchParams.get('utm_medium')).toBe('referral');
    expect(url.searchParams.get('utm_campaign')).toBe('research-lab');
    expect(url.searchParams.get('utm_content')).toBe('orbit-primary');
  }
}

function assertLabTarget(url: URL): void {
  const expected = new URL(labUrl!);
  expect(url.origin).toBe(expected.origin);
  expect(url.pathname.replace(/\/+$/, '') || '/').toBe(expected.pathname.replace(/\/+$/, '') || '/');
}

function responseEvidence(response: Response | null) {
  expect(response).not.toBeNull();
  expect(response!.ok(), `${response!.url()} returned ${response!.status()}`).toBe(true);
  return {
    url: response!.url(),
    status: response!.status(),
    headers: selectedHeaders(response!.headers()),
  };
}

function probeUrl(rawUrl: string, attempt: number, label: string): string {
  const url = new URL(rawUrl);
  const coordinate = expectedLandingCommit?.slice(0, 12) ?? 'manual';
  url.searchParams.set('__pendulum_probe', `${coordinate}-${attempt}-${label}`);
  return url.href;
}

async function fetchBytes(request: APIRequestContext, rawUrl: string, attempt: number, label: string) {
  const response: APIResponse = await request.get(probeUrl(rawUrl, attempt, label), {
    timeout: 30_000,
    headers: {
      'cache-control': 'no-cache',
      pragma: 'no-cache',
    },
  });
  contract(response.ok(), `${label} returned ${response.status()} at ${response.url()}`);
  return {
    url: response.url(),
    status: response.status(),
    headers: selectedHeaders(response.headers()),
    bytes: await response.body(),
  };
}

function parseJson(bytes: Uint8Array, label: string): Record<string, any> {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '')) as Record<string, any>;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${errorDetails(error).message}`);
  }
}

function deployedClaimEvidence(summary: Record<string, any>) {
  const surface = summary.claimEvidence;
  contract(surface?.schemaVersion === 'pendulum-claim-evidence-surface/v1', 'canonical claim evidence schema is missing');
  contract(surface.loadState === 'loaded', 'canonical claim evidence did not load');
  contract(surface.evidenceSourceCommit === summary.provenance?.sourceCommit, 'claim evidence source commit mismatch');
  contract(surface.evidenceExpiresAt === summary.provenance?.expiresAt, 'claim evidence expiry mismatch');
  contract(Array.isArray(surface.claims) && surface.claims.length === claimIds.length, 'claim evidence set is incomplete');
  const originalCounts = Object.fromEntries(claimLevels.map((level) => [level, 0]));
  const byId = new Map<string, Record<string, any>>();
  for (const claim of surface.claims) {
    contract(claimIds.includes(claim?.id) && !byId.has(claim.id), `invalid or duplicate canonical claim ${String(claim?.id)}`);
    contract(claimLevels.includes(claim.effectiveVisibleLevel), `invalid visible level for ${claim.id}`);
    contract(Array.isArray(claim.caveats), `claim caveats are malformed for ${claim.id}`);
    contract(typeof claim.sourceArtifact === 'string', `claim source artifact is missing for ${claim.id}`);
    contract(
      /^[a-f0-9]{64}$/.test(summary.sourceReportSha256?.[claim.sourceArtifact] || '')
        && claim.sourceArtifactSha256 === summary.sourceReportSha256[claim.sourceArtifact],
      `claim source artifact SHA-256 mismatch for ${claim.id}`,
    );
    contract(claim.effectiveVisibleLevel !== 'withheld' || claim.displayValue === null, `withheld claim leaked a value for ${claim.id}`);
    originalCounts[claim.effectiveVisibleLevel] += 1;
    byId.set(claim.id, claim);
  }
  contract(claimIds.every((id) => byId.has(id)), 'canonical claim evidence IDs are incomplete');
  contract(claimLevels.every((level) => surface.counts?.[level] === originalCounts[level]), 'canonical claim counts are inconsistent');

  const evidenceExpiry = Date.parse(String(summary.provenance?.expiresAt || ''));
  const claims = claimIds.map((id) => {
    const claim = byId.get(id)!;
    const claimExpiry = Date.parse(String(claim.validUntil || ''));
    const validExpiries = [evidenceExpiry, claimExpiry].filter(Number.isFinite);
    const expiresAt = validExpiries.length ? Math.min(...validExpiries) : Number.NaN;
    const expired = Number.isFinite(expiresAt) && Date.now() >= expiresAt;
    const effectiveVisibleLevel = expired && claimLevelRank[claim.effectiveVisibleLevel] > claimLevelRank.informational
      ? 'informational'
      : claim.effectiveVisibleLevel;
    return {
      id,
      effectiveVisibleLevel,
      sourceArtifact: claim.sourceArtifact,
      sourceArtifactSha256: claim.sourceArtifactSha256,
    };
  });
  return { schemaVersion: surface.schemaVersion, claims };
}

async function assertHydratedClaimSurface(
  page: Page,
  language: 'en' | 'ko',
  expected: ReturnType<typeof deployedClaimEvidence>,
): Promise<void> {
  const labels = language === 'ko'
    ? { withheld: '보류', informational: '정보용', measured: '측정됨', validated: '검증됨', 'publication-ready': '출판 준비 완료' }
    : { withheld: 'withheld', informational: 'informational', measured: 'measured', validated: 'validated', 'publication-ready': 'publication-ready' };
  await expect(page.locator('body')).toHaveAttribute('data-claim-evidence', 'canonical');
  for (const claim of expected.claims) {
    const expectedLabel = labels[claim.effectiveVisibleLevel as keyof typeof labels];
    const statuses = page.locator(`[data-claim-status="${claim.id}"]`);
    await expect(statuses.first()).toHaveText(expectedLabel);
    expect(new Set(await statuses.allTextContents()), claim.id).toEqual(new Set([expectedLabel]));
    const caveats = page.locator(`[data-claim-caveat="${claim.id}"]`);
    await expect(caveats.first()).not.toHaveText('');
  }
  const structuredClaims = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => {
    const graph = scripts.flatMap((script) => JSON.parse(script.textContent || '{}')['@graph'] || []);
    const source = graph.find((entry) => entry['@type'] === 'SoftwareSourceCode');
    return Object.fromEntries((source?.additionalProperty || []).map((property) => [property.propertyID, property.value]));
  });
  expect(structuredClaims).toMatchObject(
    Object.fromEntries(expected.claims.map((claim) => [claim.id, claim.effectiveVisibleLevel])),
  );
}

async function readDeploymentSnapshot(request: APIRequestContext, attempt: number) {
  if (expectedLandingCommit) {
    contract(/^[a-f0-9]{40}$/.test(expectedLandingCommit), 'expected Landing commit must be a full lowercase SHA-1');
  }
  const [expectedEn, expectedKo] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url)),
    readFile(new URL('../ko.html', import.meta.url)),
  ]);
  const [liveEn, liveKo, landingEvidenceResponse, kernelManifestResponse, kernelResponse, labEvidenceResponse] = await Promise.all([
    fetchBytes(request, landingEnUrl!, attempt, 'landing-en'),
    fetchBytes(request, landingKoUrl!, attempt, 'landing-ko'),
    fetchBytes(request, new URL('assets/evidence-summary.json', landingEnUrl!).href, attempt, 'landing-evidence'),
    fetchBytes(request, new URL('assets/demo-kernel-manifest.json', landingEnUrl!).href, attempt, 'kernel-manifest'),
    fetchBytes(request, new URL('assets/pendulum-demo-kernel.js', landingEnUrl!).href, attempt, 'kernel-bytes'),
    fetchBytes(request, new URL('reports/evidence-summary.json', labUrl!).href, attempt, 'lab-evidence'),
  ]);

  const expectedEnSha256 = sha256(expectedEn);
  const expectedKoSha256 = sha256(expectedKo);
  const liveEnSha256 = sha256(liveEn.bytes);
  const liveKoSha256 = sha256(liveKo.bytes);
  contract(liveEnSha256 === expectedEnSha256, `live EN HTML ${liveEnSha256} != checkout ${expectedEnSha256}`);
  contract(liveKoSha256 === expectedKoSha256, `live KO HTML ${liveKoSha256} != checkout ${expectedKoSha256}`);

  const landingEvidence = parseJson(landingEvidenceResponse.bytes, 'Landing evidence');
  const kernelManifest = parseJson(kernelManifestResponse.bytes, 'kernel manifest');
  const labEvidence = parseJson(labEvidenceResponse.bytes, 'Lab evidence');
  const landingEvidenceSha256 = sha256(landingEvidenceResponse.bytes);
  const labEvidenceSha256 = sha256(labEvidenceResponse.bytes);
  contract(
    landingEvidenceSha256 === labEvidenceSha256,
    `Landing evidence bytes ${landingEvidenceSha256} != deployed Lab evidence ${labEvidenceSha256}`,
  );
  contract(landingEvidence.schemaVersion === 'pendulum-evidence-summary/v1', 'unexpected Landing evidence schema');
  contract(labEvidence.schemaVersion === 'pendulum-evidence-summary/v1', 'unexpected Lab evidence schema');
  contract(kernelManifest.schemaVersion === 'pendulum-demo-kernel-manifest/v1', 'unexpected kernel manifest schema');
  contract(landingEvidence.tests?.success === true, 'Landing evidence tests are not successful');
  contract(landingEvidence.tests?.failed === 0, 'Landing evidence reports failed tests');
  contract(landingEvidence.provenance?.dirtyWorktree === false, 'Landing evidence came from a dirty worktree');
  const claimEvidence = deployedClaimEvidence(landingEvidence);
  contract(
    landingEvidence.provenance?.sourceCommit === labEvidence.provenance?.sourceCommit,
    'Landing and Lab evidence source commits differ',
  );
  contract(kernelManifest.sourceCommit === labEvidence.provenance?.sourceCommit, 'kernel and Lab evidence commits differ');
  contract(
    kernelManifest.sourcePackageVersion === labEvidence.provenance?.packageVersion,
    'kernel and Lab evidence package versions differ',
  );
  contract(kernelManifest.kernel === 'assets/pendulum-demo-kernel.js', 'kernel manifest points to an unexpected path');
  contract(/^[a-f0-9]{64}$/.test(kernelManifest.sha256), 'kernel manifest SHA-256 is malformed');
  const liveKernelSha256 = sha256(kernelResponse.bytes);
  contract(liveKernelSha256 === kernelManifest.sha256, `live kernel ${liveKernelSha256} != manifest ${kernelManifest.sha256}`);

  return {
    attempt,
    expectedLandingCommit,
    documents: {
      en: {
        url: liveEn.url,
        status: liveEn.status,
        headers: liveEn.headers,
        liveSha256: liveEnSha256,
        checkoutSha256: expectedEnSha256,
      },
      ko: {
        url: liveKo.url,
        status: liveKo.status,
        headers: liveKo.headers,
        liveSha256: liveKoSha256,
        checkoutSha256: expectedKoSha256,
      },
    },
    sourceCommit: labEvidence.provenance.sourceCommit as string,
    packageVersion: labEvidence.provenance.packageVersion as string,
    kernelSha256: liveKernelSha256,
    claimEvidence,
    landingEvidence: {
      url: landingEvidenceResponse.url,
      status: landingEvidenceResponse.status,
      headers: landingEvidenceResponse.headers,
      sha256: landingEvidenceSha256,
    },
    labEvidence: {
      url: labEvidenceResponse.url,
      status: labEvidenceResponse.status,
      headers: labEvidenceResponse.headers,
      sha256: labEvidenceSha256,
    },
    kernelManifest: {
      url: kernelManifestResponse.url,
      status: kernelManifestResponse.status,
      headers: kernelManifestResponse.headers,
    },
    kernel: {
      url: kernelResponse.url,
      status: kernelResponse.status,
      headers: kernelResponse.headers,
    },
  };
}

async function waitForDeploymentSnapshot(request: APIRequestContext) {
  const timeoutMs = parseBoundedInteger('PENDULUM_JOURNEY_POLL_TIMEOUT_MS', 180_000, 10_000, 600_000);
  const intervalMs = parseBoundedInteger('PENDULUM_JOURNEY_POLL_INTERVAL_MS', 5_000, 1_000, 30_000);
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastError: unknown = new Error('deployment probe did not run');
  while (Date.now() <= deadline) {
    attempt += 1;
    try {
      return await readDeploymentSnapshot(request, attempt);
    } catch (error) {
      lastError = error;
      if (Date.now() >= deadline) break;
      await delay(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
    }
  }
  throw new Error(
    `deployment did not converge within ${timeoutMs} ms after ${attempt} attempts: ${errorDetails(lastError).message}`,
  );
}

async function verifyLabControls(browser: Browser, launchUrl: string, language: 'en' | 'ko') {
  const context = await browser.newContext();
  const page = await context.newPage();
  const response = await page.goto(launchUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell), null, { timeout: 60_000 });
  await expect(page.locator('body')).toHaveClass(/audience-beginner/);
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await expect(page.locator('#tab-lab')).toHaveClass(/active/);
  await expect(page.getByTestId('control-sysType')).toHaveValue('double');
  for (const [id, expected] of Object.entries(expectedQuery).filter(([key]) => !['goal', 'audience', 'tab', 'sysType'].includes(key))) {
    expect(Number(await page.locator(`#${id}`).inputValue()), id).toBeCloseTo(Number(expected), 6);
  }
  await page.getByTestId('share-experiment').click();
  const hash = await page.evaluate(() => location.hash);
  expect(hash).toMatch(/^#experiment=/);
  const sharedUrl = new URL(page.url());

  const restoreContext = await browser.newContext();
  const restorePage = await restoreContext.newPage();
  const restoreResponse = await restorePage.goto(sharedUrl.href, { waitUntil: 'domcontentloaded' });
  await restorePage.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell), null, { timeout: 60_000 });
  await expect(restorePage.locator('body')).toHaveClass(/audience-beginner/);
  await expect(restorePage.locator('#tab-lab')).toHaveClass(/active/);
  await expect(restorePage.getByTestId('control-sysType')).toHaveValue('double');
  for (const [id, expected] of Object.entries(expectedQuery).filter(([key]) => !['goal', 'audience', 'tab', 'sysType'].includes(key))) {
    expect(Number(await restorePage.locator(`#${id}`).inputValue()), `restored ${id}`).toBeCloseTo(Number(expected), 6);
  }
  const result = {
    document: responseEvidence(response),
    shareHashPrefix: hash.slice(0, 13),
    shareUrlLength: sharedUrl.href.length,
    restoredDocument: responseEvidence(restoreResponse),
  };
  await restoreContext.close();
  await context.close();
  return result;
}

test('EN/KO Landing CTAs launch, share, restore, and match deployed evidence', async ({ browser, request }, testInfo) => {
  const artifact: Record<string, unknown> = {
    schemaVersion: 'pendulum-deployed-cross-repo-journey/v2',
    checkedAt: new Date().toISOString(),
    retry: testInfo.retry,
    expectedLandingCommit,
    urls: { landingEnUrl, landingKoUrl, labUrl },
    variants: [],
    success: false,
  };
  const outputPath = resolve(process.env.PENDULUM_JOURNEY_ARTIFACT || 'reports/deployment/deployed-cross-repo-journey.json');
  try {
    const deployment = await waitForDeploymentSnapshot(request);
    artifact.deployment = deployment;

    for (const variant of [
      { language: 'en' as const, url: landingEnUrl! },
      { language: 'ko' as const, url: landingKoUrl! },
    ]) {
      const rawContext = await browser.newContext({ javaScriptEnabled: false });
      const rawPage = await rawContext.newPage();
      const rawResponse = await rawPage.goto(variant.url, { waitUntil: 'domcontentloaded' });
      const rawHref = await rawPage.locator('a[data-utm-content="orbit-primary"]').getAttribute('href');
      expect(rawHref).toBeTruthy();
      const rawTarget = new URL(rawHref!, variant.url);
      assertLabTarget(rawTarget);
      assertCtaQuery(rawTarget, variant.language, false);
      const rawDocument = responseEvidence(rawResponse);
      await rawContext.close();

      const hydratedContext = await browser.newContext();
      const hydratedPage = await hydratedContext.newPage();
      const hydratedResponse = await hydratedPage.goto(variant.url, { waitUntil: 'domcontentloaded' });
      const cta = hydratedPage.locator('a[data-utm-content="orbit-primary"]');
      await expect(cta).toHaveAttribute('href', /utm_source=pendulum-landing/);
      const hydratedTarget = new URL(await cta.getAttribute('href') ?? '', variant.url);
      assertLabTarget(hydratedTarget);
      assertCtaQuery(hydratedTarget, variant.language, true);
      await assertHydratedClaimSurface(hydratedPage, variant.language, deployment.claimEvidence);
      const hydratedDocument = responseEvidence(hydratedResponse);
      await hydratedContext.close();

      const lab = await verifyLabControls(browser, hydratedTarget.href, variant.language);
      (artifact.variants as unknown[]).push({
        language: variant.language,
        raw: { href: rawTarget.href, document: rawDocument },
        hydrated: { href: hydratedTarget.href, document: hydratedDocument },
        lab,
      });
    }

    artifact.success = true;
  } catch (error) {
    artifact.error = errorDetails(error);
    throw error;
  } finally {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  }
});
