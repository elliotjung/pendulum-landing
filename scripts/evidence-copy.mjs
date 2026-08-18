/** Shared, deterministic wording for evidence fallbacks baked into static pages. */

export function formatEvidenceDate(expiresAt, locale) {
  const timestamp = Date.parse(String(expiresAt || ''));
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(timestamp));
}

export function evidenceFreshnessText(expiresAt, korean = false) {
  const date = formatEvidenceDate(expiresAt, korean ? 'ko-KR' : 'en-GB');
  if (!date) return null;
  return korean ? `검증 근거 최신 · ${date}까지 유효` : `Evidence current · valid through ${date}`;
}

/**
 * Korean needs a complete no-JS / failed-fetch evidence snapshot too. Keep its
 * source values aligned with the same formatting used by the live hydrator.
 */
export function koreanEvidenceFallbacks(summary) {
  const tests = summary?.tests;
  const validation = summary?.validation || {};
  const mutation = summary?.mutation || {};
  const energy = summary?.energy || {};
  const gpu = summary?.gpu || {};
  const publication = summary?.publication || {};
  const periodDoubling = validation.periodDoubling || {};
  const scipy = validation.scipyAgreement || {};
  if (!Number.isInteger(tests?.total) || tests.total <= 0) return {};

  const values = {
    'tests.formatted': Number(tests.total).toLocaleString('en-US'),
    'validation.scipyAgreement': scipy.display,
    'validation.periodDoublingDisplay': periodDoubling.display,
    'energy.bestMethod': energy.bestMethod,
    'publication.statusLabel': publication.status === 'partial' ? '부분 완료' : publication.status
  };
  if (typeof energy.profiledMethods === 'number') {
    values['energy.profileLabel'] = `${energy.profiledMethods}개 방법 프로파일링`;
  }
  if (typeof energy.bestMaxRelativeDrift === 'number' && Number.isFinite(energy.bestMaxRelativeDrift)) {
    values['energy.bestDrift'] = `${energy.bestMaxRelativeDrift.toExponential(3)} 최대 상대 드리프트`;
  }
  if (typeof mutation.score === 'number') {
    const shards = typeof mutation.reportCount === 'number' ? mutation.reportCount : 0;
    const band = mutation.status === 'low' ? '낮음' : String(mutation.status || '미평가');
    values['mutation.scoreLabel'] = `${mutation.score.toFixed(2)}% · ${band} 등급 · ${shards}개 샤드`;
    values['mutation.detailLabel'] =
      `${mutation.score.toFixed(2)}% 전체 · ${Number(mutation.coveredScore || 0).toFixed(2)}% 커버됨 · ${band} 등급 · ${shards}개 샤드`;
  }
  if (typeof gpu.passedVendors === 'number' && typeof gpu.requiredVendors === 'number') {
    values['gpu.vendorLabel'] = `${gpu.passedVendors} / ${gpu.requiredVendors} 공급업체`;
  }
  if (Array.isArray(gpu.missingVendors) && gpu.missingVendors.length) {
    values['gpu.missingLabel'] = `${gpu.missingVendors.map((vendor) => String(vendor).toUpperCase()).join(' + ')} 대기 중`;
  }
  values['publication.availableLabel'] = publication.githubReleaseUrl && publication.pagesUrl
    ? 'GitHub 릴리스 + Pages 공개'
    : '공개 산출물 미완료';
  const missingPublication = [];
  if (publication.npmPublished === false) missingPublication.push('npm');
  if (publication.zenodoPublished === false) missingPublication.push('Zenodo');
  if (missingPublication.length) values['publication.missingLabel'] = `${missingPublication.join(' + ')} 대기 중`;
  values['ledger.verify'] =
    `CSP 안전 린트 → 엄격 타입 검사 → 모듈 크기 래칫 → ${tests.total}개 단위 테스트 → 결과 수 가드 → 문서 동기화 → 포맷 게이트`;
  return values;
}
