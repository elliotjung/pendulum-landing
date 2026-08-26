import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [
  outputPathArgument,
  deployedUrl,
  enHeadersArgument,
  enBodyArgument,
  koHeadersArgument,
  koBodyArgument,
] = process.argv.slice(2);

if (
  !outputPathArgument
  || !deployedUrl
  || !enHeadersArgument
  || !enBodyArgument
  || !koHeadersArgument
  || !koBodyArgument
) {
  throw new Error(
    'usage: node scripts/check-deployment-headers.mjs <result-json> <https-base-url> '
      + '<en-headers> <en-body> <ko-headers> <ko-body>',
  );
}

const outputPath = resolve(process.cwd(), outputPathArgument);
const failures = [];
let parsedDeploymentUrl = null;
try {
  parsedDeploymentUrl = new URL(deployedUrl);
  if (parsedDeploymentUrl.protocol !== 'https:') failures.push('deployment URL must use HTTPS');
  if (parsedDeploymentUrl.username || parsedDeploymentUrl.password) {
    failures.push('deployment URL must not contain credentials');
  }
  if (parsedDeploymentUrl.hash) failures.push('deployment URL must not contain a fragment');
} catch {
  failures.push(`deployment URL is invalid: ${deployedUrl}`);
}

const variants = [
  {
    language: 'en',
    sourcePage: 'index.html',
    headersPath: resolve(process.cwd(), enHeadersArgument),
    bodyPath: resolve(process.cwd(), enBodyArgument),
  },
  {
    language: 'ko',
    sourcePage: 'ko.html',
    headersPath: resolve(process.cwd(), koHeadersArgument),
    bodyPath: resolve(process.cwd(), koBodyArgument),
  },
];

const exactHeaders = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'origin-agent-cluster': '?1',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseFinalResponse(raw, language) {
  const normalized = raw.replaceAll('\r\n', '\n');
  const responseBlocks = normalized
    .split(/\n\n+/)
    .filter((block) => /^HTTP\/\S+\s+\d{3}/i.test(block.trim()));
  const responseBlock = responseBlocks.at(-1) ?? '';
  const status = Number.parseInt(responseBlock.match(/^HTTP\/\S+\s+(\d{3})/im)?.[1] ?? '', 10);
  const headers = new Map();
  const duplicates = new Set();
  for (const line of responseBlock.split('\n').slice(1)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (headers.has(name)) duplicates.add(name);
    headers.set(name, value);
  }
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    failures.push(`${language}: unexpected final HTTP status: ${status || 'missing'}`);
  }
  for (const name of [...Object.keys(exactHeaders), 'content-security-policy', 'strict-transport-security']) {
    if (duplicates.has(name)) failures.push(`${language}: duplicate security header: ${name}`);
  }
  return { status, headers };
}

function parseCsp(policy, language) {
  const directives = new Map();
  for (const part of policy.split(';').map((value) => value.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/);
    const normalizedName = name.toLowerCase();
    if (directives.has(normalizedName)) {
      failures.push(`${language}: content-security-policy duplicates ${normalizedName}`);
      continue;
    }
    directives.set(normalizedName, values);
  }
  return directives;
}

function hasExactValues(actual, expected) {
  return actual.length === expected.length && expected.every((value) => actual.includes(value));
}

const observations = [];
const expectedBootHashes = [];
for (const variant of variants) {
  const [rawHeaders, liveBody, sourceBody] = await Promise.all([
    readFile(variant.headersPath, 'utf8'),
    readFile(variant.bodyPath),
    readFile(join(root, variant.sourcePage)),
  ]);
  const { status, headers } = parseFinalResponse(rawHeaders, variant.language);
  const liveBodySha256 = sha256(liveBody);
  const sourceBodySha256 = sha256(sourceBody);
  if (liveBodySha256 !== sourceBodySha256) {
    failures.push(
      `${variant.language}: deployed HTML SHA-256 ${liveBodySha256} does not match `
        + `${variant.sourcePage} ${sourceBodySha256}`,
    );
  }
  const contentType = headers.get('content-type') ?? '';
  if (!/^text\/html(?:;|$)/i.test(contentType)) {
    failures.push(`${variant.language}: expected text/html, got ${contentType || 'missing'}`);
  }
  const liveSource = liveBody
    .toString('utf8')
    .match(/<script\b[^>]*id=["']lang-boot["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!liveSource) failures.push(`${variant.language}: deployed lang-boot source missing`);
  else expectedBootHashes.push(`'sha256-${createHash('sha256').update(liveSource, 'utf8').digest('base64')}'`);
  observations.push({
    language: variant.language,
    sourcePage: variant.sourcePage,
    status: Number.isInteger(status) ? status : null,
    liveBodySha256,
    sourceBodySha256,
    headers,
  });
}

if (new Set(expectedBootHashes).size !== 2) {
  failures.push('deployed EN and KO pages must expose two distinct lang-boot hashes');
}

const expectedCsp = {
  'default-src': ["'self'"],
  'script-src': ["'self'", ...expectedBootHashes],
  'style-src': ["'self'"],
  'style-src-attr': ["'unsafe-inline'"],
  'font-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
  'frame-ancestors': ["'none'"],
};

for (const observation of observations) {
  const { language, headers } = observation;
  for (const [name, expected] of Object.entries(exactHeaders)) {
    const actual = headers.get(name);
    if (actual?.toLowerCase() !== expected.toLowerCase()) {
      failures.push(`${language}: ${name}: expected ${expected}, got ${actual ?? 'missing'}`);
    }
  }

  const hsts = headers.get('strict-transport-security') ?? '';
  const maxAge = Number.parseInt(hsts.match(/(?:^|;)\s*max-age=(\d+)/i)?.[1] ?? '', 10);
  if (!(maxAge >= 31_536_000) || !/(?:^|;)\s*includeSubDomains(?:;|$)/i.test(hsts)) {
    failures.push(`${language}: strict-transport-security: insufficient policy (${hsts || 'missing'})`);
  }

  const csp = parseCsp(headers.get('content-security-policy') ?? '', language);
  for (const [directive, expectedValues] of Object.entries(expectedCsp)) {
    const actual = csp.get(directive) ?? [];
    if (!hasExactValues(actual, expectedValues)) {
      failures.push(
        `${language}: content-security-policy ${directive}: expected ${expectedValues.join(' ')}, `
          + `got ${actual.join(' ') || 'missing'}`,
      );
    }
  }
  for (const directive of csp.keys()) {
    if (!Object.hasOwn(expectedCsp, directive)) {
      failures.push(`${language}: content-security-policy contains unexpected directive ${directive}`);
    }
  }
}

const result = {
  schemaVersion: 'pendulum-deployment-header-contract/v2',
  checkedAt: new Date().toISOString(),
  url: parsedDeploymentUrl ? parsedDeploymentUrl.href : deployedUrl,
  success: failures.length === 0,
  expectedBootHashes,
  variants: observations.map((observation) => ({
    language: observation.language,
    sourcePage: observation.sourcePage,
    status: observation.status,
    liveBodySha256: observation.liveBodySha256,
    sourceBodySha256: observation.sourceBodySha256,
    observedHeaders: Object.fromEntries(observation.headers),
  })),
  failures,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`deployment header contract passed for EN and KO at ${parsedDeploymentUrl.href}`);
}
