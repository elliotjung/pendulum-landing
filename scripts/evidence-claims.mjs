export const CLAIM_LEVELS = [
  'withheld',
  'informational',
  'measured',
  'validated',
  'publication-ready',
];

export const CLAIM_IDS = [
  'tests.unit',
  'validation.scipy.regular',
  'testing.mutation',
  'benchmark.energy.methods',
  'gpu.vendor-matrix',
  'publication.release',
];

const LEVEL_RANK = Object.fromEntries(CLAIM_LEVELS.map((level, index) => [level, index]));
const LEGACY_DEFAULTS = {
  'tests.unit': 'validated',
  'validation.scipy.regular': 'validated',
  'testing.mutation': 'validated',
  'benchmark.energy.methods': 'measured',
  'gpu.vendor-matrix': 'validated',
  'publication.release': 'publication-ready',
};

const KOREAN_CAVEATS = {
  'tests.unit': '성공한 전체 테스트 결과와 정확한 소스 해시가 있을 때만 검증됨으로 표시합니다.',
  'validation.scipy.regular': '정규 궤도 비교 결과이며, 카오스 궤도의 비트 단위 일치를 주장하지 않습니다.',
  'testing.mutation': '70% 품질 목표 미만이면 검증됨이 아니라 측정됨으로 낮춰 표시합니다.',
  'benchmark.energy.methods': '방법별 드리프트를 비교한 측정값이며 모든 방법에 공통인 합격 기준은 아닙니다.',
  'gpu.vendor-matrix': '실물 NVIDIA·AMD 증거가 없으면 부분 측정으로만 표시합니다.',
  'publication.release': '정확한 npm 버전·GitHub 릴리스·Zenodo DOI·Pages 결합이 모두 확인돼야 출판 준비 완료입니다.',
};

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function isoTime(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function lowerLevel(left, right) {
  return LEVEL_RANK[left] <= LEVEL_RANK[right] ? left : right;
}

function unavailableClaims() {
  return CLAIM_IDS.map((id) => ({
    id,
    effectiveVisibleLevel: 'withheld',
    displayValue: null,
    validity: 'unknown',
    validUntil: null,
    caveats: ['Claim evidence is unavailable or malformed; the quantified value is withheld.'],
    downgradeReasons: [],
  }));
}

function canonicalClaims(summary, now) {
  const surface = object(summary?.claimEvidence);
  if (surface === null) return null;
  if (
    surface.schemaVersion !== 'pendulum-claim-evidence-surface/v1'
    || surface.loadState !== 'loaded'
    || surface.evidenceSourceCommit !== summary?.provenance?.sourceCommit
    || surface.evidenceExpiresAt !== summary?.provenance?.expiresAt
    || !Array.isArray(surface.claims)
    || surface.claims.length !== CLAIM_IDS.length
  ) return false;

  const byId = new Map();
  for (const candidate of surface.claims) {
    const claim = object(candidate);
    if (
      !claim
      || !CLAIM_IDS.includes(claim.id)
      || byId.has(claim.id)
      || !CLAIM_LEVELS.includes(claim.effectiveVisibleLevel)
      || !['current', 'expired', 'unknown'].includes(claim.validity)
      || (claim.displayValue !== null && typeof claim.displayValue !== 'string')
      || (claim.effectiveVisibleLevel === 'withheld' && claim.displayValue !== null)
      || !Array.isArray(claim.caveats)
      || claim.caveats.some((value) => typeof value !== 'string')
      || !Array.isArray(claim.downgradeReasons)
    ) return false;
    byId.set(claim.id, claim);
  }
  if (CLAIM_IDS.some((id) => !byId.has(id))) return false;

  const evidenceExpiry = isoTime(summary?.provenance?.expiresAt);
  return CLAIM_IDS.map((id) => {
    const claim = byId.get(id);
    const claimExpiry = isoTime(claim.validUntil);
    const expiresAt = [evidenceExpiry, claimExpiry].filter((value) => value !== null).sort((a, b) => a - b)[0] ?? null;
    if (expiresAt !== null && now >= expiresAt && claim.effectiveVisibleLevel !== 'withheld') {
      return {
        ...claim,
        effectiveVisibleLevel: lowerLevel(claim.effectiveVisibleLevel, 'informational'),
        validity: 'expired',
        caveats: [...new Set([...claim.caveats, 'This evidence is expired and retained only as historical information.'])],
      };
    }
    return { ...claim, caveats: [...claim.caveats], downgradeReasons: [...claim.downgradeReasons] };
  });
}

function legacyLevel(id, summary, claim) {
  const status = String(claim?.status || 'unknown');
  if (id === 'tests.unit' || id === 'validation.scipy.regular') {
    return status === 'passed' ? 'validated' : 'withheld';
  }
  if (id === 'testing.mutation') {
    const mutation = String(summary?.mutation?.status || status);
    if (mutation === 'high' || mutation === 'passed') return 'validated';
    return mutation === 'low' ? 'measured' : 'withheld';
  }
  if (id === 'benchmark.energy.methods') {
    return Number.isInteger(summary?.energy?.profiledMethods) && summary.energy.profiledMethods > 0
      ? 'measured'
      : 'withheld';
  }
  if (id === 'gpu.vendor-matrix') {
    const gpu = String(summary?.gpu?.status || status);
    if (gpu === 'complete' || gpu === 'passed') return 'validated';
    return gpu === 'partial' ? 'measured' : 'withheld';
  }
  const publication = String(summary?.publication?.status || status);
  if (publication === 'complete' || publication === 'published' || publication === 'passed') {
    return 'publication-ready';
  }
  return publication === 'partial' ? 'informational' : 'withheld';
}

function legacyClaims(summary, now) {
  const rawClaims = Array.isArray(summary?.claims) ? summary.claims : [];
  const byId = new Map(rawClaims.map((claim) => [claim?.id, claim]));
  const evidenceExpiry = isoTime(summary?.provenance?.expiresAt);
  return CLAIM_IDS.map((id) => {
    const raw = byId.get(id);
    let level = raw ? legacyLevel(id, summary, raw) : 'withheld';
    const generatedAt = isoTime(raw?.evidenceGeneratedAt);
    const claimExpiry = generatedAt === null ? null : generatedAt + 14 * 86_400_000;
    const expiresAt = [evidenceExpiry, claimExpiry].filter((value) => value !== null).sort((a, b) => a - b)[0] ?? null;
    const validity = expiresAt === null ? 'unknown' : now < expiresAt ? 'current' : 'expired';
    if (validity !== 'current' && level !== 'withheld') level = lowerLevel(level, 'informational');
    return {
      id,
      defaultVisibleLevel: LEGACY_DEFAULTS[id],
      effectiveVisibleLevel: level,
      displayValue: level === 'withheld' ? null : String(raw?.displayValue ?? ''),
      validity,
      validUntil: expiresAt === null ? null : new Date(expiresAt).toISOString(),
      caveats: [raw?.caveat].filter((value) => typeof value === 'string' && value.trim()),
      downgradeReasons: [],
    };
  });
}

export function claimEvidenceView(summary, now = Date.now()) {
  const canonical = canonicalClaims(summary, now);
  const claims = canonical === null
    ? legacyClaims(summary, now)
    : canonical === false
      ? unavailableClaims()
      : canonical;
  const source = canonical === null ? 'legacy' : canonical === false ? 'unavailable' : 'canonical';
  const counts = Object.fromEntries(CLAIM_LEVELS.map((level) => [level, 0]));
  for (const claim of claims) counts[claim.effectiveVisibleLevel] += 1;
  return { source, claims, counts };
}

export function claimById(view, id) {
  return view?.claims?.find((claim) => claim.id === id) ?? null;
}

export function claimLevelLabel(level, korean = false) {
  const labels = korean
    ? { withheld: '보류', informational: '정보용', measured: '측정됨', validated: '검증됨', 'publication-ready': '출판 준비 완료' }
    : { withheld: 'withheld', informational: 'informational', measured: 'measured', validated: 'validated', 'publication-ready': 'publication-ready' };
  return labels[level] || labels.withheld;
}

export function claimCaveatLabel(claim, korean = false) {
  if (!claim) return korean ? '검증 근거를 사용할 수 없어 수치를 보류합니다.' : 'Evidence is unavailable; the value is withheld.';
  if (korean) return KOREAN_CAVEATS[claim.id] || '유효 범위와 제한을 근거 원장에서 확인하세요.';
  const caveats = Array.isArray(claim.caveats) ? claim.caveats.filter((value) => typeof value === 'string' && value.trim()) : [];
  return caveats.join(' ') || 'See the evidence ledger for scope and limitations.';
}
