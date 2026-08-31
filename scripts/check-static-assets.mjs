import { access, readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { evidenceFreshnessText, koreanEvidenceFallbacks } from './evidence-copy.mjs';
import { CLAIM_IDS, claimById, claimCaveatLabel, claimEvidenceView, claimLevelLabel } from './evidence-claims.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const warnings = [];
// English source page + the generated Korean page (scripts/build-ko-page.mjs):
// both must satisfy the same CSP/inline-hash and local-asset invariants.
const PAGES = ['index.html', 'ko.html', '404.html'];
const CONTENT_PAGES = new Set(['index.html', 'ko.html']);

const ignoredDirs = new Set(['.git', '.lighthouseci', 'node_modules', 'reports', 'test-results', 'assets/vendor']);
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.txt', '.xml']);
const mojibakeTokens = [
  '\uCA0C',
  '\uCC55',
  '\uD69E',
  '\uBBB6',
  '\uBD55',
  '\uBC1A',
  '\uBC23',
  '\uBC04',
  '\uBC2A',
  '\uBC33',
  '\uBC20',
  '\uBC06',
  '\uAC4E',
  '\uBB56',
  '\uBBCA',
  '\uBBCB',
  '\u7F50',
  '\u6B3E',
  '\u8CAB',
];
const mojibakeRegexes = [
  ['replacement-character', /\uFFFD/],
  ['latin1-utf8-c1', /\u00C3[\u0080-\u00BF]/],
  ['stray-cp1252-latin1', /\u00C2[\u0080-\u00BF]?/],
  ['cp1252-punctuation', /\u00E2[\u0080-\u2122]{1,2}/],
  ['emoji-mojibake', /\u00F0\u0178[\u0080-\u00BF]?/],
  ['known-rendered-mojibake-token', new RegExp(mojibakeTokens.map(escapeRegExp).join('|'))],
];

for (const pageName of PAGES) {
  let html;
  try {
    html = await readFile(join(root, pageName), 'utf8');
  } catch {
    failures.push(`${pageName}: page is missing (run npm run build:ko for the Korean page)`);
    continue;
  }
  for (const forbidden of ['fonts.googleapis.com', 'fonts.gstatic.com']) {
    if (html.includes(forbidden)) failures.push(`${pageName}: external font host still referenced: ${forbidden}`);
  }
  const csp = html.match(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"/i)?.[1] ?? '';
  const scriptPolicy = csp.match(/(?:^|;)\s*script-src\s+([^;]+)/i)?.[1] ?? '';
  if (scriptPolicy.includes("'unsafe-inline'")) {
    failures.push(`${pageName}: CSP script-src must not allow unsafe-inline`);
  }
  verifyCspInlineScriptHashes(pageName, html, scriptPolicy);
  if (pageName === 'index.html' && /style-src-attr[^;]*'unsafe-inline'/i.test(csp)) {
    warnings.push('CSP style-src-attr remains narrowly enabled for runtime animation state');
  }
  if (CONTENT_PAGES.has(pageName)) {
    verifyMetaCspSourceAllowlist(pageName, html, csp);
    const cspIndex = html.indexOf('http-equiv="Content-Security-Policy"');
    const firstScriptIndex = html.indexOf('<script');
    if (cspIndex < 0 || firstScriptIndex < 0 || cspIndex > firstScriptIndex) {
      failures.push(`${pageName}: the meta CSP must precede every script so the hashed pre-paint boot is enforced`);
    }
    verifySocialMetadata(pageName, html);
    verifyBrandMark(pageName, html);
    verifyLanguagePreloads(pageName, html);
    verifySkipLinkOrder(pageName, html);
    if (/Cyan and violet histories|시안과 보라색 이력/.test(html)) {
      failures.push(`${pageName}: stale cyan/violet hero palette copy remains`);
    }
  }

  const attrPattern = /\b(?:href|src|srcset)=["']([^"']+)["']/g;
  for (const match of html.matchAll(attrPattern)) {
    const refs = match[0].startsWith('srcset=')
      ? match[1]
          .split(',')
          .map((candidate) => candidate.trim().split(/\s+/)[0])
          .filter(Boolean)
      : [match[1]];
    for (const ref of refs) {
      if (!ref || shouldSkip(ref)) continue;
      const clean = ref.split('#')[0].split('?')[0];
      if (!clean) continue;
      try {
        await access(join(root, clean));
      } catch {
        failures.push(`${pageName}: missing local asset: ${ref}`);
      }
    }
  }
}

const evidence = JSON.parse(await readFile(join(root, 'assets', 'evidence-summary.json'), 'utf8'));
const kernelManifest = JSON.parse(await readFile(join(root, 'assets', 'demo-kernel-manifest.json'), 'utf8'));
const changelog = JSON.parse(await readFile(join(root, 'assets', 'changelog-highlights.json'), 'utf8'));
if (kernelManifest.schemaVersion !== 'pendulum-demo-kernel-manifest/v1') {
  failures.push(`unexpected demo kernel manifest schema: ${kernelManifest.schemaVersion ?? 'missing'}`);
}
if (kernelManifest.kernel !== 'assets/pendulum-demo-kernel.js') {
  failures.push(`unexpected demo kernel path: ${kernelManifest.kernel ?? 'missing'}`);
}
const kernelBytes = await readFile(join(root, 'assets', 'pendulum-demo-kernel.js'));
if (createHash('sha256').update(kernelBytes).digest('hex') !== kernelManifest.sha256) {
  failures.push('demo kernel SHA-256 does not match its manifest');
}
if (kernelManifest.kernelVersion !== 'pendulum-demo-kernel/v3') {
  failures.push(`unexpected demo kernel version: ${kernelManifest.kernelVersion ?? 'missing'}`);
}
if (kernelManifest.sourceCommit !== evidence.provenance?.sourceCommit) {
  failures.push('demo kernel sourceCommit does not match the evidence summary');
}
if (kernelManifest.sourcePackageVersion !== evidence.provenance?.packageVersion) {
  failures.push('demo kernel sourcePackageVersion does not match the evidence summary');
}
if (evidence.schemaVersion !== 'pendulum-evidence-summary/v1') {
  failures.push(`unexpected evidence schema: ${evidence.schemaVersion ?? 'missing'}`);
}
if (!Number.isInteger(evidence.tests?.total) || evidence.tests.total <= 0) {
  failures.push('evidence summary is missing a positive tests.total');
}
if (evidence.provenance?.dirtyWorktree !== false) {
  failures.push('evidence summary must come from a clean worktree (provenance.dirtyWorktree must be false)');
}
if (evidence.tests?.success !== true) {
  failures.push('evidence summary tests.success must be true');
}
if (evidence.tests?.failed !== 0) {
  failures.push(`evidence summary tests.failed must be 0, got ${evidence.tests?.failed ?? 'missing'}`);
}
if (!Number.isInteger(evidence.tests?.passed) || evidence.tests.passed !== evidence.tests?.total) {
  failures.push(`evidence summary tests.passed must equal tests.total (${evidence.tests?.passed ?? 'missing'} != ${evidence.tests?.total ?? 'missing'})`);
}
checkEvidenceFreshness(evidence);
checkChangelog(changelog, evidence);
await checkStaticEvidenceFallbacks(evidence, changelog);
await checkCopyCounts(evidence);
await checkClaimEvidenceSurfaces(evidence);
await checkPngDimensions('assets/favicon-32.png', 32, 32);
await checkPngDimensions('assets/apple-touch-icon.png', 180, 180);
await checkPngDimensions('assets/og-card.png', 1200, 630);
await checkPngDimensions('assets/og-card-base.png', 1200, 630);
await checkSitemap(evidence);
await checkPublishArtifactContract();
await checkLighthouseLanguageMatrix();
await checkDeploymentHeaderContracts();
await checkDeployedJourneyContract();
await checkDemoKernelContracts();
await checkHeroRuntimeContracts();
await checkWorkflowNetworkContracts();
await checkKernelPairReleaseContract();
await checkWorkflowTimeoutContracts();
await checkPagesDeploymentContract();
await checkPlaywrightServerContract();
await compareMainEvidenceIfProvided(evidence);
await checkTextEncoding();

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn(warnings.map((warning) => `- warning: ${warning}`).join('\n'));
}
console.log('static asset check passed');

async function checkClaimEvidenceSurfaces(summary) {
  const view = claimEvidenceView(summary);
  if (view.source === 'unavailable') {
    failures.push('claim evidence surface is present but malformed; public claims must fail closed');
  } else if (view.source === 'legacy') {
    warnings.push('legacy evidence summary has no canonical claimEvidence surface; next Lab sync must upgrade it');
  }

  const tampered = { ...summary, claimEvidence: { schemaVersion: 'pendulum-claim-evidence-surface/v1' } };
  const tamperedView = claimEvidenceView(tampered);
  if (tamperedView.source !== 'unavailable' || tamperedView.claims.some((claim) => claim.effectiveVisibleLevel !== 'withheld')) {
    failures.push('scripts/evidence-claims.mjs must fail closed on a malformed canonical claim surface');
  }
  const missingEnergy = structuredClone(summary);
  delete missingEnergy.claimEvidence;
  missingEnergy.energy = { profiledMethods: 0 };
  const missingEnergyClaim = claimById(claimEvidenceView(missingEnergy), 'benchmark.energy.methods');
  if (missingEnergyClaim?.effectiveVisibleLevel !== 'withheld' || missingEnergyClaim.displayValue !== null) {
    failures.push('missing energy evidence must be withheld rather than displayed as measured');
  }

  const koreanFallbacks = koreanEvidenceFallbacks(summary);
  for (const pageName of CONTENT_PAGES) {
    const html = await readFile(join(root, pageName), 'utf8');
    const korean = pageName === 'ko.html';
    for (const id of CLAIM_IDS) {
      const claim = claimById(view, id);
      const expectedLevel = korean ? koreanFallbacks[`claim.${id}.level`] : claimLevelLabel(claim?.effectiveVisibleLevel);
      const expectedCaveat = korean ? koreanFallbacks[`claim.${id}.caveat`] : claimCaveatLabel(claim);
      const escapedId = escapeRegExp(id);
      const levels = [...html.matchAll(new RegExp(`<[^>]+data-claim-status="${escapedId}"[^>]*>([^<]*)<\\/[^>]+>`, 'g'))].map((match) => match[1]);
      if (levels.length === 0 || levels.some((value) => value !== expectedLevel)) {
        failures.push(`${pageName}: claim status ${id} is missing or does not equal ${expectedLevel}`);
      }
      const caveats = [...html.matchAll(new RegExp(`<[^>]+data-claim-caveat="${escapedId}"[^>]*>([^<]*)<\\/[^>]+>`, 'g'))].map((match) => match[1].replaceAll('&amp;', '&'));
      if (caveats.length === 0 || caveats.some((value) => value !== expectedCaveat)) {
        failures.push(`${pageName}: claim caveat ${id} is missing or stale`);
      }
    }

    const software = structuredGraphEntries(html, pageName).find((entry) => entry?.['@type'] === 'SoftwareSourceCode');
    const properties = Array.isArray(software?.additionalProperty) ? software.additionalProperty : [];
    const propertyMap = new Map(properties.map((entry) => [entry?.propertyID, entry?.value]));
    if (properties.length !== CLAIM_IDS.length || CLAIM_IDS.some((id) => propertyMap.get(id) !== claimById(view, id)?.effectiveVisibleLevel)) {
      failures.push(`${pageName}: JSON-LD claim levels do not match the evaluated evidence surface`);
    }

    const freshness = html.match(/data-evidence-freshness[^>]*>([^<]*)</)?.[1];
    const expectedFreshness = evidenceFreshnessText(summary.provenance?.expiresAt, korean, summary);
    if (freshness !== expectedFreshness) failures.push(`${pageName}: claim-aware evidence freshness copy is stale`);
    const description = html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? '';
    const testClaim = claimById(view, 'tests.unit');
    if (testClaim?.effectiveVisibleLevel === 'withheld' && /[\d,]+ (?:verified|measured) tests|[\d,]+개 (?:단위|측정) 테스트/.test(description)) {
      failures.push(`${pageName}: withheld test evidence remains quantified in discovery metadata`);
    }
  }
}

async function checkWorkflowNetworkContracts() {
  const contracts = [
    {
      file: '.github/workflows/cross-repo-release.yml',
      step: 'Materialize the exact release evidence payload',
      required: ['curl ', '--retry 5', '--retry-all-errors', '--connect-timeout 10', '--max-time 60'],
    },
    {
      file: '.github/workflows/cloudflare-pages.yml',
      step: 'Verify deployed isolation and security headers',
      required: ['curl ', '--retry 5', '--retry-all-errors', '--connect-timeout 10', '--max-time 60'],
    },
  ];

  for (const contract of contracts) {
    const source = await readFile(join(root, ...contract.file.split('/')), 'utf8').catch(() => null);
    if (source === null) {
      failures.push(`${contract.file}: workflow is missing`);
      continue;
    }
    const marker = `- name: ${contract.step}`;
    const start = source.indexOf(marker);
    if (start < 0) {
      failures.push(`${contract.file}: workflow step is missing: ${contract.step}`);
      continue;
    }
    const next = source.indexOf('\n      - ', start + marker.length);
    const block = source.slice(start, next < 0 ? source.length : next);
    for (const token of contract.required) {
      if (!block.includes(token)) failures.push(`${contract.file}: ${contract.step} must include ${token}`);
    }
  }
}

async function checkKernelPairReleaseContract() {
  const [releaseWorkflow, evidenceWorkflow, syncScript, handoffScript] = await Promise.all([
    readFile(join(root, '.github', 'workflows', 'cross-repo-release.yml'), 'utf8').catch(() => ''),
    readFile(join(root, '.github', 'workflows', 'evidence-sync.yml'), 'utf8').catch(() => ''),
    readFile(join(root, 'scripts', 'sync-kernel-manifest.mjs'), 'utf8').catch(() => ''),
    readFile(join(root, 'scripts', 'materialize-evidence-handoff.mjs'), 'utf8').catch(() => ''),
  ]);

  for (const token of [
    'github.event.client_payload.kernel_base64',
    'github.event.client_payload.kernel_sha256',
    'github.event.client_payload.kernel_manifest_base64',
    'github.event.client_payload.kernel_manifest_sha256',
    'The exact kernel and manifest base64 payloads are required',
    'Materialize and verify the exact dispatched demo-kernel pair',
    'node scripts/sync-kernel-manifest.mjs --materialize-dispatched',
    'assets/pendulum-demo-kernel.js assets/demo-kernel-manifest.json',
  ]) {
    if (!releaseWorkflow.includes(token)) {
      failures.push(`.github/workflows/cross-repo-release.yml: missing exact kernel-pair contract ${token}`);
    }
  }
  const materializePosition = releaseWorkflow.indexOf('node scripts/sync-kernel-manifest.mjs --materialize-dispatched');
  const staticGatePosition = releaseWorkflow.indexOf('- name: Static, accessibility, and browser gate');
  if (materializePosition < 0 || staticGatePosition <= materializePosition) {
    failures.push('cross-repo release: the exact kernel pair must be materialized before any static/browser gate');
  }

  for (const token of [
    'github.event.client_payload.schema_version',
    'github.event.client_payload.coordinate.mainline_run_id',
    'github.event.client_payload.coordinate.pages_run_id',
    'github.event.client_payload.evidence.base64',
    'github.event.client_payload.evidence.sha256',
    'github.event.client_payload.kernel.base64',
    'github.event.client_payload.kernel.manifest_base64',
    'node scripts/materialize-evidence-handoff.mjs',
    'node scripts/sync-kernel-manifest.mjs --materialize-handoff',
    'assets/pendulum-demo-kernel.js assets/demo-kernel-manifest.json',
    'landing-evidence-handoff-${{ github.run_id }}',
  ]) {
    if (!evidenceWorkflow.includes(token)) failures.push(`evidence sync: missing exact Pages handoff contract ${token}`);
  }
  for (const forbidden of ['raw.githubusercontent.com/elliotjung/pendulum-lab', 'git ls-remote', 'schedule:', 'workflow_dispatch:']) {
    if (evidenceWorkflow.includes(forbidden)) failures.push(`evidence sync: forbidden non-artifact fallback remains: ${forbidden}`);
  }
  if (/node scripts\/sync-kernel-manifest\.mjs\s*(?:\r?\n|$)/u.test(evidenceWorkflow)) {
    failures.push('evidence sync: sync-kernel-manifest must always receive an explicit fail-closed mode');
  }

  for (const token of [
    'decodeCanonicalBase64',
    "requiredEnvironment('EXPECTED_KERNEL_SHA256')",
    "requiredEnvironment('EXPECTED_KERNEL_MANIFEST_SHA256')",
    'RELEASE_TAG does not match evidence provenance.packageVersion',
    'EXPECTED_SOURCE_COMMIT does not match evidence provenance.sourceCommit',
    'kernelSha256 !== dispatchedHashes.kernelSha256',
    'manifestSha256 !== dispatchedHashes.manifestSha256',
    'sourcePackageVersion: evidenceCoordinate.packageVersion',
    'sourceCommit: evidenceCoordinate.sourceCommit',
    "const expectedKernelVersion = 'pendulum-demo-kernel/v3'",
    'validatePair(stagedKernelBytes, stagedManifestBytes, evidenceCoordinate, dispatchedHashes)',
    'constants.COPYFILE_EXCL',
    "['--materialize-dispatched', '--materialize-handoff', '--verify-current']",
    'materializeDispatchedPair({ requireReleaseTag: true })',
    'materializeDispatchedPair({ requireReleaseTag: false })',
  ]) {
    if (!syncScript.includes(token)) failures.push(`scripts/sync-kernel-manifest.mjs: missing pair contract ${token}`);
  }
  for (const forbidden of ['manifest.sha256 =', 'manifest.sourceCommit =', 'manifest.sourcePackageVersion =']) {
    if (syncScript.includes(forbidden)) {
      failures.push(`scripts/sync-kernel-manifest.mjs: forbidden provenance restamp remains: ${forbidden}`);
    }
  }
  const kernelRename = syncScript.indexOf('await rename(stagedKernel, kernelPath)');
  const manifestRename = syncScript.indexOf('await rename(stagedManifest, manifestPath)');
  if (kernelRename < 0 || manifestRename <= kernelRename) {
    failures.push('scripts/sync-kernel-manifest.mjs: kernel bytes must be replaced before the manifest commit marker');
  }

  for (const token of [
    "schemaVersion !== 'pendulum-deployed-evidence-handoff/v1'",
    "coordinatePolicy !== 'continuous-pages-artifact'",
    "required('LAB_MAINLINE_RUN_ID')",
    "required('LAB_PAGES_RUN_ID')",
    "required('EXPECTED_EVIDENCE_SHA256')",
    "required('EVIDENCE_BASE64')",
    'actualEvidenceSha256 !== evidenceSha256',
    'evidence?.provenance?.sourceCommit !== sourceCommit',
    'evidence?.provenance?.dirtyWorktree !== false',
    'evidence?.tests?.success !== true',
    'installed evidence failed its post-write hash check',
    'pendulum-landing-evidence-handoff-audit/v1',
  ]) {
    if (!handoffScript.includes(token)) {
      failures.push(`scripts/materialize-evidence-handoff.mjs: missing fail-closed handoff contract ${token}`);
    }
  }
}

async function checkWorkflowTimeoutContracts() {
  const contracts = [
    { file: '.github/workflows/landing-ci.yml', job: 'smoke', timeout: 90, required: ['npm run smoke:ci'] },
    {
      file: '.github/workflows/pages.yml',
      job: 'quality-gate',
      timeout: 10,
      required: ['actions/download-artifact@', 'validated-source-sha.txt', 'actions/upload-pages-artifact@'],
    },
    {
      file: '.github/workflows/cloudflare-pages.yml',
      job: 'deploy',
      timeout: 90,
      required: ['--project=chromium --project=mobile-chrome', 'npm run lighthouse:lhci'],
    },
    {
      file: '.github/workflows/evidence-sync.yml',
      job: 'sync',
      timeout: 90,
      required: ['npm run smoke:ci', 'npm run lighthouse:lhci'],
    },
    {
      file: '.github/workflows/cross-repo-release.yml',
      job: 'gate-and-tag',
      timeout: 90,
      required: ['npm run smoke:ci', 'npm run lighthouse:lhci'],
    },
  ];

  for (const contract of contracts) {
    const source = await readFile(join(root, ...contract.file.split('/')), 'utf8').catch(() => null);
    if (source === null) {
      failures.push(`${contract.file}: workflow is missing`);
      continue;
    }
    const marker = `  ${contract.job}:`;
    const start = source.indexOf(marker);
    if (start < 0) {
      failures.push(`${contract.file}: workflow job is missing: ${contract.job}`);
      continue;
    }
    const tail = source.slice(start + marker.length);
    const nextOffset = tail.search(/\n  \S/);
    const next = nextOffset < 0 ? source.length : start + marker.length + nextOffset;
    const block = source.slice(start, next);
    const required = [`timeout-minutes: ${contract.timeout}`, ...contract.required];
    for (const token of required) {
      if (!block.includes(token)) failures.push(`${contract.file}: ${contract.job} must include ${token}`);
    }
  }
}

async function checkPagesDeploymentContract() {
  const workflowPath = '.github/workflows/pages.yml';
  const source = await readFile(join(root, ...workflowPath.split('/')), 'utf8').catch(() => null);
  if (source === null) {
    failures.push(`${workflowPath}: workflow is missing`);
    return;
  }

  const qualityStart = source.indexOf('  quality-gate:');
  const deployStart = source.indexOf('\n  deploy:', qualityStart);
  if (qualityStart < 0 || deployStart < 0) {
    failures.push(`${workflowPath}: quality-gate and deploy jobs must both exist`);
    return;
  }

  const qualityBlock = source.slice(qualityStart, deployStart);
  for (const token of [
    'timeout-minutes: 10',
    'actions/download-artifact@',
    'name: landing-validated-site',
    'run-id: ${{ github.event.workflow_run.id }}',
    'github-token: ${{ github.token }}',
    'validated-source-sha.txt',
    'gh api "repos/${GITHUB_REPOSITORY}/commits/main" --jq .sha',
    'actions/upload-pages-artifact@',
    'path: validated-handoff/_site',
  ]) {
    if (!qualityBlock.includes(token)) failures.push(`${workflowPath}: quality-gate must include ${token}`);
  }
  const orderedTokens = ['actions/download-artifact@', 'Verify exact artifact provenance', 'actions/upload-pages-artifact@'];
  const positions = orderedTokens.map((token) => qualityBlock.indexOf(token));
  if (positions.some((position) => position < 0) || positions.some((position, index) => index > 0 && position <= positions[index - 1])) {
    failures.push(`${workflowPath}: artifact download and provenance verification must finish before the Pages upload`);
  }
  for (const forbidden of ['npm run smoke', 'npm run lighthouse', 'actions/checkout@']) {
    if (qualityBlock.includes(forbidden)) {
      failures.push(`${workflowPath}: quality-gate must reuse its producer artifact instead of rerunning ${forbidden}`);
    }
  }

  for (const token of [
    'workflow_run:',
    'workflows: ["Landing CI", "Evidence Sync", "Cross-repository release"]',
    'types: [completed]',
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.head_branch == 'main'",
    'github.event.workflow_run.head_repository.full_name == github.repository',
    "github.event.workflow_run.name == 'Landing CI'",
    "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.name == 'Evidence Sync'",
    "github.event.workflow_run.event == 'schedule'",
    "github.event.workflow_run.name == 'Cross-repository release'",
  ]) {
    if (!source.includes(token)) failures.push(`${workflowPath}: missing trusted producer handoff contract ${token}`);
  }

  const deployBlock = source.slice(deployStart);
  if (!/needs:\s*quality-gate/.test(deployBlock)) {
    failures.push(`${workflowPath}: deploy must remain gated by quality-gate`);
  }
}

async function checkPlaywrightServerContract() {
  const [config, server] = await Promise.all([
    readFile(join(root, 'playwright.config.js'), 'utf8').catch(() => ''),
    readFile(join(root, 'scripts', 'static-server.mjs'), 'utf8').catch(() => ''),
  ]);
  if (!config.includes("command: 'node scripts/static-server.mjs 4177'")) {
    failures.push('playwright.config.js: webServer must use the repository Node static server');
  }
  if (/python\s+-m\s+http\.server/.test(config)) {
    failures.push('playwright.config.js: Python http.server can orphan on Windows teardown');
  }
  for (const token of [
    "process.once('SIGINT'",
    "process.once('SIGTERM'",
    'server.close(',
    'server.closeIdleConnections',
    'server.closeAllConnections',
    'Static server shutdown timed out',
    'process.exit(1)',
    '5_000',
  ]) {
    if (!server.includes(token)) failures.push(`scripts/static-server.mjs: graceful shutdown must include ${token}`);
  }
  for (const token of ['decodeURIComponent(url.pathname)', "response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })", "response.end('Bad request')"]) {
    if (!server.includes(token)) failures.push(`scripts/static-server.mjs: malformed request handling must include ${token}`);
  }
}

function verifyMetaCspSourceAllowlist(pageName, pageHtml, policy) {
  const directives = new Map();
  for (const part of policy
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/);
    const normalizedName = name.toLowerCase();
    if (directives.has(normalizedName)) {
      failures.push(`${pageName}: meta CSP duplicates ${normalizedName}`);
      continue;
    }
    directives.set(normalizedName, values);
  }
  const executableTypes = new Set(['', 'text/javascript', 'application/javascript', 'module', 'importmap']);
  const executableHashes = [...pageHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/i.test(match[1] ?? ''))
    .filter((match) => {
      const type = (match[1]?.match(/type\s*=\s*"([^"]*)"/i)?.[1] ?? '').trim().toLowerCase();
      return executableTypes.has(type);
    })
    .map(
      (match) =>
        `'sha256-${createHash('sha256')
          .update(match[2] ?? '', 'utf8')
          .digest('base64')}'`,
    );
  const expected = {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...executableHashes],
    'style-src': ["'self'"],
    'style-src-attr': ["'unsafe-inline'"],
    'font-src': ["'self'"],
    'img-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'none'"],
  };
  for (const [directive, expectedValues] of Object.entries(expected)) {
    const actual = directives.get(directive) ?? [];
    if (actual.length !== expectedValues.length || expectedValues.some((value) => !actual.includes(value))) {
      failures.push(`${pageName}: meta CSP ${directive} must be exactly ${expectedValues.join(' ')}; ` + `got ${actual.join(' ') || 'missing'}`);
    }
  }
  for (const directive of directives.keys()) {
    if (!Object.hasOwn(expected, directive)) failures.push(`${pageName}: meta CSP has unexpected directive ${directive}`);
  }
}

/**
 * The CSP pins inline <script> blocks by SHA-256, and those hashes are
 * maintained by hand. Editing the inline importmap without updating the hash
 * silently breaks the hero (CSP blocks the import map, Three.js never loads,
 * the page "cleanly" falls back to the static background). Recompute both
 * directions here:
 *   - every executable inline script (importmap / module / classic JS) must
 *     have its exact hash present in script-src;
 *   - every sha256 token in script-src must correspond to some inline script
 *     (otherwise it is a stale leftover that no longer covers anything).
 * Data blocks (application/ld+json) are not executed and need no allowance,
 * but their hashes are still legal in the policy, so the reverse check
 * accepts them.
 */
function verifyCspInlineScriptHashes(pageName, pageHtml, policy) {
  const cspHashes = new Set([...policy.matchAll(/'sha256-([A-Za-z0-9+/=]+)'/g)].map((match) => match[1]));
  const executableTypes = new Set(['', 'text/javascript', 'application/javascript', 'module', 'importmap']);
  const inline = [];
  for (const match of pageHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1] ?? '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = (attrs.match(/type\s*=\s*"([^"]*)"/i)?.[1] ?? '').trim().toLowerCase();
    const hash = createHash('sha256')
      .update(match[2] ?? '', 'utf8')
      .digest('base64');
    inline.push({ type, hash, executable: executableTypes.has(type) });
  }
  for (const script of inline) {
    if (script.executable && !cspHashes.has(script.hash)) {
      failures.push(
        `${pageName}: CSP script-src is missing the hash of an inline ${script.type || 'classic'} script: 'sha256-${script.hash}' — update the CSP after editing the inline block`,
      );
    }
  }
  const inlineHashes = new Set(inline.map((script) => script.hash));
  for (const hash of cspHashes) {
    if (!inlineHashes.has(hash)) {
      failures.push(`${pageName}: CSP script-src lists a stale sha256 that matches no inline script: 'sha256-${hash}'`);
    }
  }
}

function verifySocialMetadata(pageName, html) {
  const expectedLocale = pageName === 'ko.html' ? 'ko_KR' : 'en_US';
  const expectedAlternate = pageName === 'ko.html' ? 'en_US' : 'ko_KR';
  const expectedTitle = pageName === 'ko.html' ? 'Pendulum Lab — 비선형 동역학 워크벤치' : 'Pendulum Lab — Nonlinear Dynamics Workbench';
  const required = [
    [`<title>${expectedTitle}</title>`, 'canonical page title'],
    [`property="og:title" content="${expectedTitle}"`, 'canonical OG title'],
    [`name="twitter:title" content="${expectedTitle}"`, 'canonical Twitter title'],
    [`property="og:locale" content="${expectedLocale}"`, 'primary OG locale'],
    [`property="og:locale:alternate" content="${expectedAlternate}"`, 'alternate OG locale'],
    ['property="og:image" content="https://elliotjung.github.io/pendulum-landing/assets/og-card.png"', 'dedicated OG image'],
    ['property="og:image:type" content="image/png"', 'OG image MIME type'],
    ['property="og:image:width" content="1200"', 'OG image width'],
    ['property="og:image:height" content="630"', 'OG image height'],
    ['name="twitter:image" content="https://elliotjung.github.io/pendulum-landing/assets/og-card.png"', 'Twitter image'],
    ['rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png"', 'PNG favicon'],
    ['rel="apple-touch-icon" sizes="180x180" href="assets/apple-touch-icon.png"', 'Apple touch icon'],
  ];
  for (const [token, label] of required) if (!html.includes(token)) failures.push(`${pageName}: missing ${label}`);
}

function verifyBrandMark(pageName, html) {
  const inlineMark = [
    '<circle cx="16" cy="5" r="2" fill="#8d99a3"',
    '<path d="M16 7 L22.5 16.5 L18.5 25" fill="none" stroke="#8d99a3" stroke-width="1.35"',
    '<circle cx="22.5" cy="16.5" r="2.2" fill="#75b8c7"',
    '<circle cx="18.5" cy="25" r="2.8" fill="#d2a968"',
  ];
  for (const token of inlineMark) {
    if (html.split(token).length !== 3) {
      failures.push(`${pageName}: canonical pendulum mark token must appear in both page marks: ${token}`);
    }
  }
  for (const token of [
    "r='2' fill='%238d99a3'",
    "d='M16 7 L22.5 16.5 L18.5 25' fill='none' stroke='%238d99a3' stroke-width='1.35'",
    "cx='22.5' cy='16.5' r='2.2' fill='%2375b8c7'",
    "cx='18.5' cy='25' r='2.8' fill='%23d2a968'",
  ]) {
    if (!html.includes(token)) failures.push(`${pageName}: SVG favicon diverges from the canonical pendulum mark: ${token}`);
  }
}

function verifyLanguagePreloads(pageName, html) {
  const regularFontPreload =
    /<link[^>]+rel="preload"[^>]+href="assets\/fonts\/Pretendard-Regular\.subset\.woff2"[^>]+as="font"[^>]+type="font\/woff2"[^>]+crossorigin="anonymous"/i;
  if (pageName === 'ko.html' && !regularFontPreload.test(html)) {
    failures.push('ko.html: missing early Pretendard regular font preload');
  }
  if (pageName === 'index.html' && regularFontPreload.test(html)) {
    failures.push('index.html: Korean-only font preload must not compete with the English hero image');
  }
}

function verifySkipLinkOrder(pageName, html) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';
  const firstFocusable = body.match(/<(?:a\b[^>]*\bhref=|button\b|input\b|select\b|textarea\b|summary\b)/i)?.[0] ?? '';
  if (!/^<a\b/i.test(firstFocusable) || !/class=["'][^"']*\bskip-link\b/i.test(firstFocusable)) {
    failures.push(`${pageName}: skip link must be the first focusable element in body`);
  }
  if (!/<main\b[^>]*\bid=["']main["'][^>]*\btabindex=["']-1["']/i.test(body)) {
    failures.push(`${pageName}: skip-link target #main must accept programmatic focus with tabindex="-1"`);
  }
}

function checkChangelog(summary, evidenceSummary) {
  if (summary.schemaVersion !== 'pendulum-changelog-highlights/v1') failures.push('unexpected changelog highlights schema');
  if (!Array.isArray(summary.highlights) || summary.highlights.length !== 3) failures.push('changelog highlights must contain exactly three entries');
  else if (summary.highlights.some((item) => typeof item.title !== 'string' || !item.title.trim() || typeof item.summary !== 'string' || !item.summary.trim())) {
    failures.push('changelog highlights contain an empty title or summary');
  } else if (
    summary.highlights.some((item) => {
      const titleKo = item.titleKo;
      const summaryKo = item.summaryKo;
      const hasEither = titleKo !== undefined || summaryKo !== undefined;
      return hasEither && (typeof titleKo !== 'string' || !titleKo.trim() || typeof summaryKo !== 'string' || !summaryKo.trim());
    })
  ) {
    failures.push('changelog highlights must provide titleKo and summaryKo together when localized copy exists');
  }
  const suspiciousEncoding = /(?:\uFFFD|\u00C3.|\u00C2.|\u00E2\u20AC|\u00F0\u0178|\?{3,})/u;
  if (
    Array.isArray(summary.highlights) &&
    summary.highlights.some((item) => suspiciousEncoding.test(String(item?.title ?? '')) || suspiciousEncoding.test(String(item?.summary ?? '')))
  ) {
    failures.push('changelog highlights contain likely mojibake');
  }
  if (summary.sourceCommit !== evidenceSummary.provenance?.sourceCommit) failures.push('changelog sourceCommit does not match evidence sourceCommit');
  if (summary.generatedAt !== evidenceSummary.generatedAt) failures.push('changelog generatedAt must equal evidence generatedAt for deterministic sync');
  if (!/^https:\/\/github\.com\/elliotjung\/pendulum-lab\/blob\/[a-f0-9]{40}\/CHANGELOG\.md$/i.test(summary.sourceUrl || '')) {
    failures.push('changelog sourceUrl is missing or not commit-pinned');
  }
}

async function checkStaticEvidenceFallbacks(summary, changelogSummary) {
  const [indexHtml, koreanHtml] = await Promise.all([readFile(join(root, 'index.html'), 'utf8').catch(() => ''), readFile(join(root, 'ko.html'), 'utf8').catch(() => '')]);
  const expectedEnglishFreshness = evidenceFreshnessText(summary.provenance?.expiresAt, false, summary);
  const expectedKoreanFreshness = evidenceFreshnessText(summary.provenance?.expiresAt, true, summary);
  for (const [pageName, html, expected] of [
    ['index.html', indexHtml, expectedEnglishFreshness],
    ['ko.html', koreanHtml, expectedKoreanFreshness],
  ]) {
    const actual = html.match(/data-evidence-freshness[^>]*>([^<]*)</)?.[1]?.trim();
    if (!expected || actual !== expected) {
      failures.push(`${pageName}: evidence freshness fallback (${actual ?? 'missing'}) must match current evidence (${expected ?? 'invalid'})`);
    }
  }

  const koreanFallbacks = koreanEvidenceFallbacks(summary);
  for (const [key, expected] of Object.entries(koreanFallbacks)) {
    if (typeof expected !== 'string') continue;
    const matcher = new RegExp(`data-evidence="${escapeRegExp(key)}">([^<]*)<`, 'g');
    const values = [...koreanHtml.matchAll(matcher)].map((match) => match[1].trim());
    if (!values.length || values.some((value) => value !== expected)) {
      failures.push(`ko.html: static ${key} fallback must be localized from evidence`);
    }
  }

  const englishFallbacks = {
    'validation.scipyAgreement': summary.validation?.scipyAgreement?.display,
    'energy.profileLabel': Number.isInteger(summary.energy?.profiledMethods) ? `${summary.energy.profiledMethods} methods profiled` : null,
  };
  for (const [key, expected] of Object.entries(englishFallbacks)) {
    if (typeof expected !== 'string') {
      failures.push(`evidence summary has no usable English fallback for ${key}`);
      continue;
    }
    const matcher = new RegExp(`data-evidence="${escapeRegExp(key)}">([^<]*)<`, 'g');
    const values = [...indexHtml.matchAll(matcher)].map((match) => match[1].trim());
    if (!values.length || values.some((value) => value !== expected)) {
      failures.push(`index.html: static ${key} fallback must match current evidence`);
    }
  }
  const scipyDisplay = summary.validation?.scipyAgreement?.display;
  if (typeof scipyDisplay === 'string') {
    if (!indexHtml.includes(`Regular orbits agree to ${scipyDisplay} over 20 s;`)) {
      failures.push('index.html: SciPy narrative must match the current evidence display');
    }
    if (!koreanHtml.includes(`규칙 궤도는 20초 동안 ${scipyDisplay} 수준으로 일치하고`)) {
      failures.push('ko.html: SciPy narrative must match the current evidence display');
    }
  }

  const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const staticCards =
    changelogSummary.highlights?.map(
      (highlight, index) =>
        `<article class="changelog-card"><span>${String(index + 1).padStart(2, '0')}</span><h3>${escapeHtml(highlight.title)}</h3><p>${escapeHtml(highlight.summary)}</p></article>`,
    ) ?? [];
  for (const card of staticCards) {
    if (!indexHtml.includes(card)) failures.push('index.html: static changelog fallback must match changelog-highlights.json');
  }
  for (const [index, highlight] of (changelogSummary.highlights ?? []).entries()) {
    const hasKorean = typeof highlight.titleKo === 'string' && typeof highlight.summaryKo === 'string';
    const language = hasKorean ? 'ko' : 'en';
    const title = escapeHtml(hasKorean ? highlight.titleKo : highlight.title);
    const summary = escapeHtml(hasKorean ? highlight.summaryKo : highlight.summary);
    const card = `<article class="changelog-card" lang="${language}"><span>${String(index + 1).padStart(2, '0')}</span><h3>${title}</h3><p>${summary}</p></article>`;
    if (!koreanHtml.includes(card)) failures.push('ko.html: static changelog fallback must match current localized-or-source release data');
  }
}

/**
 * Every static copy of the test count must equal the live evidence summary:
 * the SEO meta descriptions and OG/Twitter alt text on both pages, the no-JS
 * fallback spans, and the count baked into the og-card pixels (tracked via
 * its sidecar assets/og-card-meta.json). Run `node scripts/sync-copy-counts.mjs`
 * plus `npm run build:ko`, and `node scripts/generate-og-card.mjs`, to refresh.
 */
async function checkCopyCounts(summary) {
  const total = summary.tests?.total;
  const passed = summary.tests?.passed;
  if (!Number.isInteger(total) || !Number.isInteger(passed)) return; // already failed above
  const parseCount = (text) => Number.parseInt(text.replaceAll(',', ''), 10);
  for (const pageName of CONTENT_PAGES) {
    const html = await readFile(join(root, pageName), 'utf8').catch(() => null);
    if (html === null) continue; // missing page already reported
    const description = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i)?.[1] ?? '';
    const descCount = description.match(/([\d,]+) (?:verified |unit )?tests/)?.[1] ?? description.match(/([\d,]+)개 단위 테스트/)?.[1];
    if (!descCount || parseCount(descCount) !== total) {
      failures.push(`${pageName}: meta description test count (${descCount ?? 'none'}) != evidence total ${total} — run scripts/sync-copy-counts.mjs and npm run build:ko`);
    }
    const graph = structuredGraphEntries(html, pageName);
    const webPages = graph.filter((entry) => entry?.['@type'] === 'WebPage');
    if (webPages.length !== 1) {
      failures.push(`${pageName}: expected exactly one JSON-LD WebPage, found ${webPages.length}`);
    } else {
      const jsonDescription = String(webPages[0].description ?? '');
      const jsonCount = jsonDescription.match(/([\d,]+) (?:verified |unit )?tests/)?.[1] ?? jsonDescription.match(/([\d,]+)개 단위 테스트/)?.[1];
      if (!jsonCount || parseCount(jsonCount) !== total) {
        failures.push(`${pageName}: JSON-LD WebPage test count (${jsonCount ?? 'none'}) != evidence total ${total} — run scripts/sync-copy-counts.mjs and npm run build:ko`);
      }
    }
    for (const alt of [...html.matchAll(/(?:og|twitter):image:alt" content="([^"]*)"/g)].map((m) => m[1])) {
      const altCount = alt.match(/([\d,]+)(?: tests|개 테스트)/)?.[1];
      if (!altCount || parseCount(altCount) !== total) {
        failures.push(`${pageName}: image alt test count (${altCount ?? 'none'}) != evidence total ${total} — run scripts/sync-copy-counts.mjs and npm run build:ko`);
      }
    }
  }
  const indexHtml = await readFile(join(root, 'index.html'), 'utf8').catch(() => '');
  const fallbacks = [
    [/data-evidence="tests\.formatted">([^<]*)</, total.toLocaleString('en-US')],
    [/data-count="(\d+)" data-decimals="0" data-evidence-count="tests\.passed"/, String(passed)],
  ];
  for (const [pattern, expected] of fallbacks) {
    const actual = indexHtml.match(pattern)?.[1];
    if (actual !== expected) {
      failures.push(`index.html: static fallback ${pattern} is "${actual ?? 'missing'}", expected "${expected}" — run scripts/sync-copy-counts.mjs`);
    }
  }
  const ledgerCount = indexHtml.match(/data-evidence="ledger\.verify">[^<]*?([\d,]+) unit tests/)?.[1];
  if (!ledgerCount || parseCount(ledgerCount) !== total) {
    failures.push(`index.html: ledger.verify fallback count (${ledgerCount ?? 'none'}) != evidence total ${total} — run scripts/sync-copy-counts.mjs`);
  }
  const ogMeta = await readFile(join(root, 'assets', 'og-card-meta.json'), 'utf8')
    .then((raw) => JSON.parse(raw.replace(/^\uFEFF/, '')))
    .catch(() => null);
  if (!ogMeta || ogMeta.schemaVersion !== 'pendulum-og-card/v1') {
    failures.push('assets/og-card-meta.json missing or wrong schema — run node scripts/generate-og-card.mjs');
  } else if (ogMeta.testsTotal !== total) {
    failures.push(`og-card pixels quote ${ogMeta.testsTotal} tests but evidence says ${total} — run node scripts/generate-og-card.mjs`);
  } else if (ogMeta.sourceEvidenceCommit !== summary.provenance?.sourceCommit) {
    failures.push(
      `og-card provenance ${ogMeta.sourceEvidenceCommit || 'missing'} does not match evidence ${summary.provenance?.sourceCommit || 'missing'} — regenerate the social card from current evidence`,
    );
  } else {
    const [baseBytes, cardBytes, rendererBytes] = await Promise.all([
      readFile(join(root, 'assets', 'og-card-base.png')),
      readFile(join(root, 'assets', 'og-card.png')),
      readFile(join(root, 'scripts', 'generate-og-card.mjs')),
    ]);
    const baseSha256 = createHash('sha256').update(baseBytes).digest('hex');
    const cardSha256 = createHash('sha256').update(cardBytes).digest('hex');
    const rendererSha256 = createHash('sha256').update(rendererBytes).digest('hex');
    const claimView = claimEvidenceView(summary);
    const testsClaimLevel = claimById(claimView, 'tests.unit')?.effectiveVisibleLevel ?? 'withheld';
    const scipyClaimLevel = claimById(claimView, 'validation.scipy.regular')?.effectiveVisibleLevel ?? 'withheld';
    if (ogMeta.baseSha256 !== baseSha256) {
      failures.push('og-card base art changed after the social card was rendered — regenerate the social card');
    }
    if (ogMeta.rendererSha256 !== rendererSha256) {
      failures.push('og-card renderer changed after the social card was rendered — regenerate the social card');
    }
    if (ogMeta.tagline !== 'Nonlinear dynamics workbench.') {
      failures.push('og-card tagline metadata does not match the canonical workbench label');
    }
    if (ogMeta.testsClaimLevel !== testsClaimLevel || ogMeta.scipyClaimLevel !== scipyClaimLevel) {
      failures.push('og-card claim levels do not match the current fail-closed evidence surface');
    }
    if (ogMeta.cardSha256 !== cardSha256) {
      failures.push('og-card PNG does not match cardSha256 in its metadata — regenerate the social card');
    }
  }
}

function structuredGraphEntries(html, pageName) {
  const blocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const entries = [];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1]);
      entries.push(...(Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : [parsed]));
    } catch (error) {
      failures.push(`${pageName}: invalid JSON-LD: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (blocks.length === 0) failures.push(`${pageName}: JSON-LD block is missing`);
  return entries;
}

async function checkPngDimensions(relativePath, expectedWidth, expectedHeight) {
  const bytes = await readFile(join(root, relativePath)).catch(() => null);
  if (!bytes || bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') {
    failures.push(`${relativePath}: missing or invalid PNG`);
    return;
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    failures.push(`${relativePath}: expected ${expectedWidth}x${expectedHeight}, got ${width}x${height}`);
  }
}

async function checkSitemap(_evidenceSummary) {
  const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
  const urls = [...sitemap.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<lastmod>([^<]+)<\/lastmod>[\s\S]*?<\/url>/g)];
  if (urls.length !== 2) failures.push('sitemap must contain two URLs with lastmod values');
  for (const [, loc, lastmod] of urls) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod) || !Number.isFinite(Date.parse(lastmod))) failures.push(`sitemap ${loc}: invalid lastmod ${lastmod}`);
  }
  const documentDays = [];
  for (const pageName of CONTENT_PAGES) {
    const html = await readFile(join(root, pageName), 'utf8').catch(() => '');
    const dates = structuredGraphEntries(html, pageName)
      .filter((entry) => Object.hasOwn(entry ?? {}, 'dateModified'))
      .map((entry) => entry.dateModified);
    if (dates.length < 2) failures.push(`${pageName}: expected at least two JSON-LD dateModified claims`);
    const pageDays = new Set(dates);
    if (pageDays.size === 1) documentDays.push(dates[0]);
    else failures.push(`${pageName}: JSON-LD dateModified claims must agree with each other`);
    for (const dateModified of dates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateModified) || !Number.isFinite(Date.parse(dateModified))) {
        failures.push(`${pageName}: structured-data dateModified is missing or invalid (${dateModified ?? 'missing'})`);
      }
    }
  }
  const currentDocumentDay = documentDays[0];
  if (!currentDocumentDay || documentDays.some((day) => day !== currentDocumentDay)) {
    failures.push('EN and KO dateModified claims must agree');
  } else {
    for (const [, loc, lastmod] of urls) {
      if (lastmod !== currentDocumentDay) {
        failures.push(`sitemap ${loc}: lastmod ${lastmod} must equal document dateModified ${currentDocumentDay}`);
      }
    }
  }
}

async function checkPublishArtifactContract() {
  const [prepare, packageJson, pages, landingCi, evidenceSync, crossRepoRelease, cloudflare, wrangler, gitignore, cloudflareDocs] = await Promise.all([
    readFile(join(root, 'scripts', 'prepare-site.mjs'), 'utf8'),
    readFile(join(root, 'package.json'), 'utf8'),
    readFile(join(root, '.github', 'workflows', 'pages.yml'), 'utf8'),
    readFile(join(root, '.github', 'workflows', 'landing-ci.yml'), 'utf8'),
    readFile(join(root, '.github', 'workflows', 'evidence-sync.yml'), 'utf8'),
    readFile(join(root, '.github', 'workflows', 'cross-repo-release.yml'), 'utf8'),
    readFile(join(root, '.github', 'workflows', 'cloudflare-pages.yml'), 'utf8'),
    readFile(join(root, 'wrangler.toml'), 'utf8'),
    readFile(join(root, '.gitignore'), 'utf8'),
    readFile(join(root, 'docs', 'cloudflare-pages.md'), 'utf8'),
  ]);
  for (const token of [
    "'index.html'",
    "'ko.html'",
    "'404.html'",
    "'robots.txt'",
    "'sitemap.xml'",
    "'assets'",
    "'_headers'",
    'await rm(site, { recursive: true, force: true })',
    "relative(root, site) !== '_site'",
    "'package.json'",
    "'scripts'",
    "'tests'",
    "'assets/og-card-base.png'",
  ]) {
    if (!prepare.includes(token)) failures.push(`scripts/prepare-site.mjs: missing allowlist safety contract ${token}`);
  }
  if (!packageJson.includes('"prepare:site": "node scripts/prepare-site.mjs"')) {
    failures.push('package.json: missing deterministic publish-staging command');
  }
  const producers = [
    ['Landing CI', landingCi],
    ['Evidence Sync', evidenceSync],
    ['Cross-repository release', crossRepoRelease],
  ];
  for (const [name, producer] of producers) {
    for (const token of [
      'test -z "$(git status --porcelain)"',
      'run: npm run prepare:site',
      'git rev-parse HEAD > validated-source-sha.txt',
      'name: landing-validated-site',
      'validated-source-sha.txt',
    ]) {
      if (!producer.includes(token)) failures.push(`${name}: publish handoff must include ${token}`);
    }
  }
  if (!pages.includes('path: validated-handoff/_site') || pages.includes('run: npm run prepare:site')) {
    failures.push('pages workflow: must deploy only the allowlisted artifact prepared by its validated producer');
  }
  if (!cloudflare.includes('run: npm run prepare:site -- --headers')) {
    failures.push('cloudflare workflow: must stage its artifact through the shared publish allowlist with headers');
  }
  if (!prepare.includes('sourceOnlyAssets.has(relativeSource)')) {
    failures.push('scripts/prepare-site.mjs: source-only social-card base art must be deterministically excluded');
  }
  if (!/pages_build_output_dir\s*=\s*"\.\/_site"/.test(wrangler)) {
    failures.push('wrangler.toml: Cloudflare dashboard output must be the staged _site directory');
  }
  if (!gitignore.includes('_site/')) failures.push('.gitignore: generated publish directory must stay untracked');
  if (!cloudflareDocs.includes('Output directory: `_site`')) {
    failures.push('docs/cloudflare-pages.md: dashboard output directory must document the staged _site directory');
  }
}

async function checkLighthouseLanguageMatrix() {
  const config = JSON.parse(await readFile(join(root, 'lighthouserc.json'), 'utf8'));
  const urls = config?.ci?.collect?.url;
  const required = ['http://127.0.0.1:4177/?lang=en', 'http://127.0.0.1:4177/ko.html?lang=ko'];
  if (!Array.isArray(urls) || urls.length !== required.length || required.some((url) => !urls.includes(url))) {
    failures.push('lighthouserc.json: EN and KO must be measured as two explicit documents');
  }
  if (config?.ci?.assert?.aggregationMethod !== 'pessimistic') {
    failures.push('lighthouserc.json: assertions must use pessimistic aggregation so the worst run gates release');
  }
  const runner = await readFile(join(root, 'scripts', 'run-lighthouse.mjs'), 'utf8');
  if (!runner.includes('/?lang=en`')) failures.push('scripts/run-lighthouse.mjs: standalone Lighthouse matrix must pin lang=en');
  if (!runner.includes('/ko.html?lang=ko`')) failures.push('scripts/run-lighthouse.mjs: standalone Lighthouse matrix must pin lang=ko');
  if (!runner.includes("require.resolve('lighthouse/cli')") || runner.includes('lighthouse@')) {
    failures.push('scripts/run-lighthouse.mjs: Lighthouse must resolve from the audited local lockfile');
  }
  if (!runner.includes("{ id: 'en'") || !runner.includes("{ id: 'ko'")) {
    failures.push('scripts/run-lighthouse.mjs: standalone Lighthouse matrix must retain distinct EN/KO summaries');
  }
  for (const token of [
    "'cold-single'",
    "'warm-median'",
    "'warm-pessimistic'",
    "args.push('--disable-storage-reset')",
    'longTaskAttribution',
    'runnerFingerprint',
    "process.argv.includes('--regression-fixture')",
    'lighthouse-regression-fixture-summary.json'
  ]) {
    if (!runner.includes(token)) failures.push(`scripts/run-lighthouse.mjs: missing cold/warm SLO contract ${token}`);
  }
  const lhciRunner = await readFile(join(root, 'scripts', 'run-lhci.mjs'), 'utf8');
  if (
    !lhciRunner.includes("process.env.CI === 'true'")
    || !lhciRunner.includes("join(root, 'scripts', 'run-lighthouse.mjs')")
    || !lhciRunner.includes("runPreGate(['--regression-fixture'], '4175'")
    || !lhciRunner.includes("runPreGate([], '4176'")
  ) {
    failures.push('scripts/run-lhci.mjs: CI must self-test the actual bundle and measure both locales before the pessimistic LHCI gate');
  }
  const [mainSource, fixtureSource, packageJson] = await Promise.all([
    readFile(join(root, 'assets', 'main.js'), 'utf8'),
    readFile(join(root, 'assets', 'lighthouse-regression-fixture.js'), 'utf8'),
    readFile(join(root, 'package.json'), 'utf8')
  ]);
  if (
    !mainSource.includes("['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)") ||
    !mainSource.includes("get('lhFixture') === 'bundle-long-task'") ||
    !mainSource.includes("import('./lighthouse-regression-fixture.js')")
  ) {
    failures.push('assets/main.js: the actual-bundle Lighthouse fixture must remain explicit and loopback-only');
  }
  if (!fixtureSource.includes('performance.now() - startedAt < 900')) {
    failures.push('assets/lighthouse-regression-fixture.js: deterministic long-task fixture is missing');
  }
  if (!packageJson.includes('"lighthouse:fixture": "node scripts/run-lighthouse.mjs --regression-fixture"')) {
    failures.push('package.json: Lighthouse regression fixture command is missing');
  }
}

async function checkDemoKernelContracts() {
  const [orbitSource, sceneSource] = await Promise.all([readFile(join(root, 'assets', 'orbit-console.js'), 'utf8'), readFile(join(root, 'assets', 'scene.js'), 'utf8')]);

  for (const token of [
    'runtimeParams.damping = damping;',
    'runtimeController = new AbortController();',
    'runtimeController?.abort();',
    'cancelWarmChunk?.();',
    'consoleResizeObserver?.disconnect();',
    'visibilityObserver?.disconnect();',
    'if (event.persisted) resumeRuntime();',
    'window.__orbitConsoleLifecycle',
  ]) {
    if (!orbitSource.includes(token)) failures.push(`assets/orbit-console.js: missing damping/lifecycle contract ${token}`);
  }
  if (/Math\.exp\(-damping\s*\*\s*dt\)|s\[[23]\]\s*\*=\s*decay/.test(orbitSource)) {
    failures.push('assets/orbit-console.js: damping must stay inside the shared RK4 RHS, not post-process angular velocities');
  }
  if (!sceneSource.includes('const params = Object.freeze({ m1: 1, m2: 1, l1: 1.14, l2: 1.02, g: 9.81 });')) {
    failures.push('assets/scene.js: the hero must keep using the conservative shared-kernel parameter set');
  }

  try {
    const kernelUrl = `${pathToFileURL(join(root, 'assets', 'pendulum-demo-kernel.js')).href}?static-contract`;
    const { DEMO_KERNEL_VERSION, createRk4Work, rhsDoubleInto, rk4StepDouble } = await import(kernelUrl);
    if (DEMO_KERNEL_VERSION !== 'pendulum-demo-kernel/v3') {
      failures.push(`demo kernel runtime version is ${DEMO_KERNEL_VERSION ?? 'missing'}, expected pendulum-demo-kernel/v3`);
    }
    if (typeof createRk4Work !== 'function' || typeof rhsDoubleInto !== 'function' || typeof rk4StepDouble !== 'function') {
      failures.push('demo kernel v3 must expose the RK4 integration contract');
      return;
    }
    const parameters = { m1: 1.2, m2: 0.8, l1: 1.1, l2: 0.9, g: 9.81 };
    const state = [0.9, -0.4, 1.1, -0.7];
    const conservative = [0, 0, 0, 0];
    const explicitZero = [0, 0, 0, 0];
    const damped = [0, 0, 0, 0];
    rhsDoubleInto(state, conservative, parameters);
    rhsDoubleInto(state, explicitZero, { ...parameters, damping: 0 });
    const gamma = 0.25;
    rhsDoubleInto(state, damped, { ...parameters, damping: gamma });
    if (conservative.some((value, index) => value !== explicitZero[index])) {
      failures.push('demo kernel: omitted damping and damping=0 must share the exact conservative RHS path');
    }

    const delta = state[0] - state[1];
    const m11 = (parameters.m1 + parameters.m2) * parameters.l1 * parameters.l1;
    const m12 = parameters.m2 * parameters.l1 * parameters.l2 * Math.cos(delta);
    const m22 = parameters.m2 * parameters.l2 * parameters.l2;
    const accelerationDelta1 = damped[2] - conservative[2];
    const accelerationDelta2 = damped[3] - conservative[3];
    const torqueResidual1 = m11 * accelerationDelta1 + m12 * accelerationDelta2 + gamma * state[2];
    const torqueResidual2 = m12 * accelerationDelta1 + m22 * accelerationDelta2 + gamma * state[3];
    if (Math.max(Math.abs(torqueResidual1), Math.abs(torqueResidual2)) > 1e-12) {
      failures.push('demo kernel: damped acceleration does not solve M(q) q-double-dot = F - gamma q-dot');
    }

    let dampingReads = 0;
    const stagedParameters = { ...parameters };
    Object.defineProperty(stagedParameters, 'damping', {
      enumerable: true,
      get() {
        dampingReads += 1;
        return gamma;
      },
    });
    rk4StepDouble([...state], stagedParameters, 1 / 240, createRk4Work());
    if (dampingReads < 4) {
      failures.push(`demo kernel: RK4 must evaluate damping in all four RHS stages (observed ${dampingReads})`);
    }

    const energy = (sample) => {
      const [a1, a2, v1, v2] = sample;
      const y1 = -parameters.l1 * Math.cos(a1);
      const y2 = y1 - parameters.l2 * Math.cos(a2);
      const v1Squared = parameters.l1 * parameters.l1 * v1 * v1;
      const v2Squared = v1Squared + parameters.l2 * parameters.l2 * v2 * v2 + 2 * parameters.l1 * parameters.l2 * v1 * v2 * Math.cos(a1 - a2);
      return 0.5 * parameters.m1 * v1Squared + 0.5 * parameters.m2 * v2Squared + parameters.g * (parameters.m1 * y1 + parameters.m2 * y2);
    };
    const dampedState = [...state];
    const initialEnergy = energy(dampedState);
    const work = createRk4Work();
    for (let step = 0; step < 1200; step += 1) {
      rk4StepDouble(dampedState, { ...parameters, damping: gamma }, 1 / 600, work);
    }
    if (!Number.isFinite(energy(dampedState)) || energy(dampedState) >= initialEnergy - 0.01) {
      failures.push('demo kernel: positive generalized damping must produce a finite, dissipative RK4 trajectory');
    }
  } catch (error) {
    failures.push(`demo kernel numeric contract failed to execute: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function checkHeroRuntimeContracts() {
  const [html, main, scene, i18n, enhancements, orbitConsole, landingCss, packageJson, smoke, heroSmoke] = await Promise.all([
    readFile(join(root, 'index.html'), 'utf8'),
    readFile(join(root, 'assets', 'main.js'), 'utf8'),
    readFile(join(root, 'assets', 'scene.js'), 'utf8'),
    readFile(join(root, 'assets', 'i18n-core.js'), 'utf8'),
    readFile(join(root, 'assets', 'enhancements-loader.js'), 'utf8'),
    readFile(join(root, 'assets', 'orbit-console.js'), 'utf8'),
    readFile(join(root, 'assets', 'landing.css'), 'utf8'),
    readFile(join(root, 'package.json'), 'utf8'),
    readFile(join(root, 'tests', 'landing-smoke.spec.ts'), 'utf8'),
    readFile(join(root, 'tests', 'hero-runtime.spec.ts'), 'utf8'),
  ]);
  const requiredHtml = [
    'data-hero-toggle',
    'data-hero-status',
    'data-hero-view-reset',
    'aria-controls="hero-canvas"',
    'aria-describedby="orbit-theta-output"',
    'aria-describedby="orbit-separation-output"',
    'aria-describedby="orbit-damping-output"',
    'aria-controls="orbit-console"',
    'src="assets/enhancements-loader.js"',
    '<html lang="en" class="no-js js-ready">',
  ];
  for (const token of requiredHtml) if (!html.includes(token)) failures.push(`index.html: missing hero/accessibility contract ${token}`);
  for (const eagerAsset of ['orbit-console.js']) {
    if (new RegExp(`<script[^>]+src=["']assets/${eagerAsset.replaceAll('.', '\\.')}["']`, 'i').test(html)) {
      failures.push(`index.html: ${eagerAsset} must load through the intent/viewport enhancement loader`);
    }
  }
  if (/requestIdleCallback\s*\(\s*requestHeroScene|setTimeout\s*\(\s*requestHeroScene/.test(main)) {
    failures.push('assets/main.js: the heavyweight hero must not auto-load from idle/timer callbacks');
  }
  if (main.includes("window.addEventListener('keydown', requestHeroScene")) {
    failures.push('assets/main.js: keyboard navigation must not eagerly load the heavy hero renderer');
  }
  for (const token of ['canCreateWebGL2', 'heroUnavailable', 'heroEnsurePromise', 'window.__heroLifecycle', 'import(sceneUrl)', "setHeroState('static')"]) {
    if (!main.includes(token)) failures.push(`assets/main.js: missing deferred/fallback hero contract ${token}`);
  }
  for (const token of [
    'requestHeroFromScroll',
    'Math.abs(window.scrollY) < 8',
    'orbitMetricsReady',
    'ensureOrbitMetrics',
    'const liveGeometry',
    'const hasOrbitMetrics',
    'window.__hero?.setScrollActive?.(descentActive)',
    "document.documentElement.classList.remove('no-js')",
    'let previousScrollY = 0',
    'let previousScrollTime = 0',
    'event.persisted || window.location.hash',
  ]) {
    if (!main.includes(token)) failures.push(`assets/main.js: missing deferred hero/descent lifecycle contract ${token}`);
  }
  if (/\n\s*cacheOrbitMetrics\(\);\s*\n\s*onScroll\(\);/.test(main)) {
    failures.push('assets/main.js: offscreen orbit geometry must not force layout during initial boot');
  }
  if (main.includes('previousScrollY = window.scrollY')) {
    failures.push('assets/main.js: initial boot must not force layout by reading scrollY');
  }
  for (const token of [
    'document.documentElement,w=window',
    'd.classList.remove("no-js")',
    'w.__PENDULUM_MAIN_WATCHDOG=setTimeout',
    'w.__PENDULUM_MAIN_READY!==true',
    'd.classList.add("no-js")',
    '},4000)',
  ]) {
    if (!html.includes(token)) failures.push(`index.html: missing pre-paint/no-JS watchdog contract ${token}`);
  }
  for (const token of [
    'window.__PENDULUM_MAIN_READY = true',
    'clearTimeout(window.__PENDULUM_MAIN_WATCHDOG)',
    'window.__PENDULUM_MAIN_WATCHDOG = 0',
    "document.documentElement.classList.contains('no-js')",
    'const recoveredFromNoJs',
    "document.documentElement.classList.remove('no-js')",
  ]) {
    if (!main.includes(token)) failures.push(`assets/main.js: missing main-readiness watchdog contract ${token}`);
  }
  if (landingCss.includes('html:not(.js-ready)')) {
    failures.push('assets/landing.css: no-JS fallbacks must key off the explicit no-js class');
  }
  if (!landingCss.includes('--orbit-scroll:0;')) {
    failures.push('assets/landing.css: orbit descent must define a zero visual progress before the first scroll frame');
  }
  for (const token of ['orbit-static-fallback-template', 'html.no-js .orbit-console canvas', ':not(.is-visible):focus-within', '[data-stagger] > :not(.is-visible):focus']) {
    if (!landingCss.includes(token)) failures.push(`assets/landing.css: missing accessible visual-state contract ${token}`);
  }
  for (const removedToken of ['window.gsap', 'cinematic-static', 'cursor-glow', 'data-mouse', '--mx', '--my']) {
    if (main.includes(removedToken) || landingCss.includes(removedToken) || html.includes(removedToken)) {
      failures.push(`landing runtime: removed decorative implementation token remains: ${removedToken}`);
    }
  }
  for (const token of [
    "import('./orbit-console.js')",
    'IntersectionObserver',
    "rootMargin: '640px 0px'",
    'pendingOrbitInputs',
    'MAX_PENDING_ORBIT_BUTTONS',
    'pendingOrbitButtons',
    'orbitReplayScheduled',
    'syncOrbitMotionControl',
    '동작 줄임',
    "'동작 줄임' : 'Motion reduced'",
    'markOrbitUnavailable',
    'controls.hidden = true',
    'consoleCanvas.hidden = true',
    '실시간 궤적을 사용할 수 없어 정적인 이중 진자 궤적을 표시합니다.',
    '실시간 궤적을 사용할 수 없어 정적 이중 진자 궤적을 표시합니다.',
    'Live trajectory unavailable; showing a static double-pendulum trace.',
  ]) {
    if (/[^\x00-\x7f]/u.test(token)) continue;
    if (!enhancements.includes(token)) failures.push(`assets/enhancements-loader.js: missing deferred enhancement contract ${token}`);
  }
  for (const token of [
    'initialSeparation',
    'handleSeparationInput',
    'twin[0] = initialTheta + initialSeparation',
    'data-orbit-caption="separation"',
    "listen(controls.separation, 'input', handleSeparationInput)",
    'separationCaption',
    'pushTrail();\n    draw();\n    updateReadouts();',
    "const experimentContract = Object.freeze({ method: 'rk4', dt: 0.001 });",
    'const fixedStep = experimentContract.dt;',
    'const maximumPhysicsSteps = Math.ceil(maximumFrameElapsed / fixedStep);',
    'rk4StepDouble(s, runtimeParams, experimentContract.dt, work);',
    'method: experimentContract.method',
    'dt: canonicalNumber(experimentContract.dt)',
    "experimentSchema: 'pendulum-sensitive-dependence/v1'",
    'deltaTheta: canonicalNumber(initialSeparation)',
    "perturbationPattern: 'symmetric'",
    "perturbationSeed: '20260826'",
    "ensembleCount: '12'",
  ]) {
    if (!orbitConsole.includes(token)) failures.push(`assets/orbit-console.js: missing live initial-separation contract ${token}`);
  }
  if (orbitConsole.includes('const fixedStep = 1 / 150;')) {
    failures.push('assets/orbit-console.js: visible simulation dt must match the exact Lab handoff');
  }
  for (const removedAsset of ['animation-vendor.bundle.js', 'reactbits.js']) {
    if (enhancements.includes(removedAsset) || html.includes(removedAsset)) {
      failures.push(`landing runtime: removed dependency remains referenced: ${removedAsset}`);
    }
  }
  if (packageJson.includes('"gsap"')) {
    failures.push('package.json: removed GSAP dependency must not be restored');
  }
  const contextProbe = scene.indexOf("canvas.getContext('webgl2'");
  const rendererConstruction = scene.indexOf('new THREE.WebGLRenderer');
  if (contextProbe < 0 || rendererConstruction < 0 || contextProbe > rendererConstruction) {
    failures.push('assets/scene.js: WebGL2 must be acquired before constructing THREE.WebGLRenderer');
  }
  for (const token of [
    "from './hero-physics-kernel.js'",
    'HERO_P1 as P1',
    'HERO_P2 as P2',
    'HERO_V1 as V1',
    'HERO_V2 as V2',
    'createHeroSpatialState(HERO_INITIAL_CONDITIONS, params)',
    'stepHeroSpatialState(state, fixedStep, work, params)',
    'get numericalEnvelope()',
    'get spatialState()',
    'constraintErrors',
    'tangentErrors',
  ]) {
    if (!scene.includes(token)) failures.push(`assets/scene.js: missing constrained double-spherical dynamics contract ${token}`);
  }
  for (const duplicate of ['function spatialDerivative', 'function projectSpatialConstraints', 'function rk4StepSpatial', 'const SPATIAL_STATE_SIZE = 12']) {
    if (scene.includes(duplicate)) failures.push(`assets/scene.js: duplicate inline solver must be removed: ${duplicate}`);
  }
  const scrollSyncStart = scene.indexOf('setScrollActive(nextActive)');
  const scrollPoseStart = scene.indexOf('get scrollPose()', scrollSyncStart);
  if (
    scrollSyncStart < 0 ||
    scrollPoseStart < scrollSyncStart ||
    !scene.slice(scrollSyncStart, scrollPoseStart).includes('scrollActive = Boolean(nextActive)') ||
    !scene.slice(scrollSyncStart, scrollPoseStart).includes('syncPlayback()') ||
    !scene.includes('(visible || scrollActive)') ||
    !scene.includes('now - lastTelemetryAt >= 180') ||
    !scene.includes('coordinateActiveLastFrame = coordinateActive')
  ) {
    failures.push('assets/scene.js: descent visibility must remain an explicit playback source during observer hand-off');
  }
  if (/console\.(?:warn|error)\s*\(/.test(scene)) {
    failures.push('assets/scene.js: expected WebGL fallback must remain console-clean');
  }
  for (const token of [
    "window.addEventListener('pointerdown'",
    '{ capture: true, signal }',
    "target.closest('.hero, #orbit-descent')",
    'target.isContentEditable',
    '[contenteditable]:not([contenteditable="false"])',
    'get dragging() { return dragging; }',
    'interactionController?.abort()',
  ]) {
    if (!scene.includes(token)) failures.push(`assets/scene.js: missing hit-testable safe drag contract ${token}`);
  }
  for (const token of [
    'ensureHero',
    'lifecycleGeneration',
    'cancelActivePrewarm',
    "invalidateHeroInitialization('context-lost')",
    'generation !== lifecycleGeneration',
    'disposeHero',
    'renderer?.forceContextLoss?.()',
  ]) {
    if (!scene.includes(token)) failures.push(`assets/scene.js: missing restartable async lifecycle contract ${token}`);
  }
  for (const token of ['captureMode ? 3112 : 1440', 'completed + 64']) {
    if (!scene.includes(token)) failures.push(`assets/scene.js: missing bounded live prewarm contract ${token}`);
  }
  const prewarmAwait = scene.indexOf('const warmed = await prewarm(generation)');
  const postPrewarmRead = scene.indexOf('readMediaPreferences();', prewarmAwait + 1);
  if (prewarmAwait < 0 || postPrewarmRead < prewarmAwait) {
    failures.push('assets/scene.js: preferences must be sampled again after asynchronous prewarm');
  }
  if (!scene.includes('bindLifecycleListeners();\nvoid ensureHero();')) {
    failures.push('assets/scene.js: media/data listeners must bind before initial hero prewarm');
  }
  if (!packageJson.includes('--project=webkit --workers=1')) {
    failures.push('package.json: multi-engine smoke must use one worker to avoid artificial GPU contention');
  }
  if (!packageJson.includes('tests/landing-smoke.spec.ts tests/hero-runtime.spec.ts --project=chromium')) {
    failures.push('package.json: Chromium CI smoke must include the focused hero-runtime gate');
  }
  if ((smoke.match(/captureHero=1/g) ?? []).length !== 3) {
    failures.push('tests/landing-smoke.spec.ts: only the hero paint, WebGL fallback, and repeatability tests may force capture mode');
  }
  for (const token of [
    "for (const route of ['/', '/ko.html?lang=ko'])",
    "page.locator('[data-hero-toggle]').dispatchEvent('click')",
    '{ timeout: 45_000 }',
    'deferredEnhancementRequests',
    '__landingEnhancements?.orbitReady',
    "endsWith('/orbit-console.js'))).toHaveLength(1)",
    "route.abort('failed')",
    'orbit-console-static',
    "endsWith('/orbit-console.js'))).toHaveLength(2)",
    '__orbitReplayOrder',
    "toEqual(['toggle', 'toggle', 'reset', 'toggle'])",
    'data-hero-drag-exclusion-probe',
    'toHaveClass(/no-js/)',
    '__pendulumInlineCspProbe',
    'securitypolicyviolation',
    '__PENDULUM_MAIN_WATCHDOG',
    "rawHttpStatus('/malformed-%ZZ-path')",
    'toBe(400)',
    'late-watchdog-recovery=1',
    '__orbitConsoleLifecycle',
    '[data-orbit-control="separation"]',
    '[data-orbit-number="separation"]',
    "experimentSchema: 'pendulum-sensitive-dependence/v1'",
    "deltaTheta: '0.0001'",
    "angleUnit: 'deg'",
    "initialThetaTwo: 2.0943951023931953",
    '__orbitConsolePainted',
    "Object.defineProperty(event, 'persisted'",
    'pendingWork: false',
  ]) {
    if (!smoke.includes(token)) failures.push(`tests/landing-smoke.spec.ts: missing low-contention browser contract ${token}`);
  }
  if (!smoke.includes("window.dispatchEvent(new Event('scroll'))")) {
    failures.push('tests/landing-smoke.spec.ts: synthetic scroll restoration must preserve the zero-request startup contract');
  }
  for (const token of [
    'cssProgress',
    'getComputedStyle(orbitDescentElement)',
    'progress: 0',
    'Number.isFinite(scrollState.velocity)',
    'pose.cameraAzimuth - start.cameraAzimuth',
    'cameraTravel > 1.5',
    'pose.y < start.y - 0.2',
    '__hero?: { spatialState: SpatialSnapshot }',
    'azimuthTravel',
    'toBeLessThan(2.35)',
    'constraintErrors',
    'tangentErrors',
    'toEqual(frozenPhysics?.bob1)',
  ]) {
    if (!smoke.includes(token)) failures.push(`tests/landing-smoke.spec.ts: missing finite static-scroll regression ${token}`);
  }
  for (const token of [
    "'Start 3D': '3D 시작'",
    "'VIEW / ELEVATION / DEPTH': '시점 / 고도 / 깊이'",
    "'Reset 3D view': '3D 시점 초기화'",
    "['.orbit-descent-sticky', 'aria-label'",
    "['.val-board', 'aria-label'",
    "'initial separation δθ₁': '초기 간격 δθ₁'",
    "['#orbit-theta', 'aria-valuetext'",
    "['#orbit-separation', 'aria-valuetext'",
    "['#orbit-damping', 'aria-valuetext'",
  ]) {
    if (!i18n.includes(token)) failures.push(`assets/i18n-core.js: missing generated-page localization contract ${token}`);
  }
  for (const token of ["page.locator('[data-hero-view-reset]')", "page.keyboard.press('Home')", 'checkpointHash', 'maxRelativeEnergyDrift']) {
    if (!heroSmoke.includes(token)) failures.push(`tests/hero-runtime.spec.ts: missing focused hero contract ${token}`);
  }
}

async function checkDeploymentHeaderContracts() {
  const [headers, workflow, checker, docs] = await Promise.all([
    readFile(join(root, '_headers'), 'utf8'),
    readFile(join(root, '.github', 'workflows', 'cloudflare-pages.yml'), 'utf8'),
    readFile(join(root, 'scripts', 'check-deployment-headers.mjs'), 'utf8').catch(() => ''),
    readFile(join(root, 'docs', 'cloudflare-pages.md'), 'utf8'),
  ]);
  for (const token of [
    'Content-Security-Policy:',
    "style-src 'self'; style-src-attr 'unsafe-inline'",
    "frame-ancestors 'none'",
    'Strict-Transport-Security: max-age=63072000; includeSubDomains',
    'X-Frame-Options: DENY',
    'Origin-Agent-Cluster: ?1',
    'Cross-Origin-Opener-Policy: same-origin',
    'Cross-Origin-Embedder-Policy: require-corp',
    'Cross-Origin-Resource-Policy: same-origin',
    'X-Content-Type-Options: nosniff',
  ]) {
    if (!headers.includes(token)) failures.push(`_headers: missing hardened response contract ${token}`);
  }
  for (const pageName of CONTENT_PAGES) {
    const html = await readFile(join(root, pageName), 'utf8');
    const boot = html.match(/<script\b[^>]*id=["']lang-boot["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (!boot) {
      failures.push(`${pageName}: lang-boot source is missing for response-CSP synchronization`);
      continue;
    }
    const hash = createHash('sha256').update(boot, 'utf8').digest('base64');
    if (!headers.includes(`'sha256-${hash}'`)) failures.push(`_headers: missing current ${pageName} lang-boot hash`);
  }
  for (const token of [
    'expectedBootHashes',
    "'frame-ancestors'",
    "protocol !== 'https:'",
    'liveBodySha256',
    'contains unexpected directive',
    'writeFile',
    'process.exitCode = 1',
  ]) {
    if (!checker.includes(token)) failures.push(`scripts/check-deployment-headers.mjs: missing fail-closed contract ${token}`);
  }
  for (const token of [
    '--location',
    "--proto '=https'",
    "--proto-redir '=https'",
    '--workers=1',
    'cloudflare-en-headers.txt',
    'cloudflare-ko-headers.txt',
    'cloudflare-en.html',
    'cloudflare-ko.html',
    'contract_passed=false',
    'node scripts/check-deployment-headers.mjs',
    'cloudflare-header-contract',
    'actions/upload-artifact@',
  ]) {
    if (!workflow.includes(token)) failures.push(`cloudflare workflow: missing live header artifact contract ${token}`);
  }
  if (!docs.includes('GitHub Pages does not honor `_headers`')) {
    failures.push('docs/cloudflare-pages.md: must disclose the canonical GitHub Pages response-header limitation');
  }
}

async function checkDeployedJourneyContract() {
  const [packageJson, config, spec, workflow, pagesWorkflow] = await Promise.all([
    readFile(join(root, 'package.json'), 'utf8'),
    readFile(join(root, 'playwright.deployed.config.js'), 'utf8').catch(() => ''),
    readFile(join(root, 'tests', 'deployed-cross-repo-journey.spec.ts'), 'utf8').catch(() => ''),
    readFile(join(root, '.github', 'workflows', 'deployed-journey.yml'), 'utf8').catch(() => ''),
    readFile(join(root, '.github', 'workflows', 'pages.yml'), 'utf8').catch(() => '')
  ]);
  if (!packageJson.includes('"test:journey:deployed"')) failures.push('package.json: missing deployed journey command');
  if (config.includes('webServer') || !config.includes("name: 'chromium'")) {
    failures.push('playwright.deployed.config.js: deployed journey must not start a local server and must pin Chromium');
  }
  if (!config.includes('retries: process.env.CI ? 1 : 0') || !config.includes('timeout: 600_000')) {
    failures.push('playwright.deployed.config.js: deployed journey must have one bounded CI retry and a propagation-aware timeout');
  }
  for (const token of [
    'PENDULUM_LIVE_LANDING_EN_URL',
    'PENDULUM_LIVE_LANDING_KO_URL',
    'PENDULUM_LIVE_LAB_URL',
    'javaScriptEnabled: false',
    'data-utm-content="orbit-primary"',
    'share-experiment',
    '#experiment=',
    'reports/evidence-summary.json',
    'assets/evidence-summary.json',
    'assets/demo-kernel-manifest.json',
    'assets/pendulum-demo-kernel.js',
    'PENDULUM_EXPECTED_LANDING_COMMIT',
    'PENDULUM_EXPECTED_LAB_SOURCE_COMMIT',
    'PENDULUM_EXPECTED_EVIDENCE_SHA256',
    'strictEvidenceCoordinate',
    'waitForLandingDeployment',
    'verifyExpectedEvidenceCoordinate',
    "'strict-lab-evidence'",
    'liveKernelSha256',
    'liveEnSha256',
    'landing.landingEvidence.sha256 === expectedEvidenceSha256',
    'lastSynchronizedAt',
    'currentEtag',
    'pendulum-claim-evidence-surface/v1',
    'sourceArtifactSha256',
    'data-claim-status',
    'additionalProperty',
    'artifact.error = errorDetails(error)',
    'selectedHeaders',
  ]) {
    if (!spec.includes(token)) failures.push(`tests/deployed-cross-repo-journey.spec.ts: missing deployed contract ${token}`);
  }
  for (const token of [
    'workflows: ["Deploy landing to GitHub Pages"]',
    "github.event.workflow_run.conclusion == 'success'",
    'PENDULUM_EXPECTED_LANDING_COMMIT',
    'PENDULUM_EXPECTED_LAB_SOURCE_COMMIT',
    'PENDULUM_EXPECTED_EVIDENCE_SHA256',
    'deployed-journey-coordinate',
    'PENDULUM_JOURNEY_POLL_TIMEOUT_MS',
    'npm run test:journey:deployed',
    'actions/upload-artifact@',
    'test-results',
    'deployed-cross-repo-journey',
  ]) {
    if (!workflow.includes(token)) failures.push(`deployed journey workflow: missing post-deploy contract ${token}`);
  }
  for (const token of [
    'deployed-journey-coordinate/v1',
    "strict?'strict-coordinate':'landing-ui'",
    'github.event.workflow_run.name',
    'actions/upload-artifact@'
  ]) {
    if (!pagesWorkflow.includes(token)) failures.push(`pages workflow: missing journey mode contract ${token}`);
  }
}

function shouldSkip(ref) {
  return ref.startsWith('#') || ref.startsWith('data:') || ref.startsWith('mailto:') || ref.startsWith('tel:') || ref.startsWith('http://') || ref.startsWith('https://');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function checkEvidenceFreshness(summary) {
  const maxAgeDays = Number.parseFloat(process.env.PENDULUM_EVIDENCE_MAX_AGE_DAYS || '14');
  const generated = Date.parse(summary.generatedAt || '');
  if (!Number.isFinite(generated)) {
    failures.push('evidence summary generatedAt is missing or invalid');
    return;
  }
  const ageDays = (Date.now() - generated) / 86_400_000;
  if (ageDays > maxAgeDays) {
    warnings.push(`evidence summary is ${ageDays.toFixed(1)} days old; refresh from the main repo before release`);
  }
  const expiresAt = Date.parse(summary.provenance?.expiresAt || '');
  if (!Number.isFinite(expiresAt)) failures.push('evidence provenance.expiresAt is missing or invalid');
  else if (Date.now() > expiresAt) failures.push('evidence summary has expired; regenerate it from the main repo');
  if (!/^[a-f0-9]{40}$/i.test(summary.provenance?.sourceCommit || '')) failures.push('evidence provenance.sourceCommit is missing or invalid');
  if (!/^[a-f0-9]{64}$/i.test(summary.provenance?.lockfileSha256 || '')) failures.push('evidence provenance.lockfileSha256 is missing or invalid');
  const expectedCommit = process.env.PENDULUM_EXPECTED_SOURCE_COMMIT;
  if (expectedCommit && summary.provenance?.sourceCommit !== expectedCommit) {
    failures.push(`evidence source commit ${summary.provenance?.sourceCommit ?? 'missing'} does not match dispatched release ${expectedCommit}`);
  }
}

async function compareMainEvidenceIfProvided(summary) {
  const evidencePath = process.env.PENDULUM_LAB_EVIDENCE_PATH;
  if (!evidencePath) return;
  const source = JSON.parse(await readFile(evidencePath, 'utf8'));
  for (const key of ['schemaVersion', 'generatedAt']) {
    if (source[key] !== summary[key]) failures.push(`evidence ${key} mismatch: landing=${summary[key]} main=${source[key]}`);
  }
  for (const key of ['total', 'passed', 'failed', 'files']) {
    if (source.tests?.[key] !== summary.tests?.[key]) failures.push(`evidence tests.${key} mismatch: landing=${summary.tests?.[key]} main=${source.tests?.[key]}`);
  }
  if (source.gpu?.status !== summary.gpu?.status) failures.push(`evidence gpu.status mismatch: landing=${summary.gpu?.status} main=${source.gpu?.status}`);
  if (source.publication?.status !== summary.publication?.status)
    failures.push(`evidence publication.status mismatch: landing=${summary.publication?.status} main=${source.publication?.status}`);
  if (source.provenance?.sourceCommit !== summary.provenance?.sourceCommit) failures.push('evidence provenance.sourceCommit mismatch');
  if (source.provenance?.lockfileSha256 !== summary.provenance?.lockfileSha256) failures.push('evidence provenance.lockfileSha256 mismatch');
}

async function checkTextEncoding() {
  for (const file of await walk(root)) {
    const rel = relative(root, file).replace(/\\/g, '/');
    const text = await readFile(file, 'utf8');
    text.split(/\r?\n/).forEach((line, index) => {
      for (const [label, regex] of mojibakeRegexes) {
        regex.lastIndex = 0;
        if (!regex.test(line)) continue;
        failures.push(`mojibake ${label}: ${rel}:${index + 1}: ${line.trim().slice(0, 140)}`);
      }
      if (/\?{2,}/.test(line) && !looksLikeCode(line)) {
        failures.push(`mojibake literal-question-run-in-display-text: ${rel}:${index + 1}: ${line.trim().slice(0, 140)}`);
      }
      if (/\?{2,}<\/|<[^>]*>\?{2,}\/?[a-z]/i.test(line)) {
        failures.push(`possibly mangled HTML token: ${rel}:${index + 1}: ${line.trim().slice(0, 140)}`);
      }
    });
  }
}

function looksLikeCode(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.includes('${') ||
    trimmed.includes('=>') ||
    /\b(?:const|let|var|return|if|for|while|switch|case|type|interface|export|import)\b/.test(trimmed) ||
    ((trimmed.includes('??') || trimmed.includes('?.')) && /[`=;(){}[\]]/.test(trimmed))
  );
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry);
    const rel = relative(root, path).replace(/\\/g, '/');
    if ([...ignoredDirs].some((ignored) => rel === ignored || rel.startsWith(`${ignored}/`))) continue;
    const info = await stat(path);
    if (info.isDirectory()) out.push(...(await walk(path)));
    else if (info.isFile() && textExtensions.has(extname(path).toLowerCase())) out.push(path);
  }
  return out;
}
