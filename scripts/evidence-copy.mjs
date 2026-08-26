/** Shared, deterministic wording for evidence fallbacks baked into static pages. */

import {
  CLAIM_IDS,
  claimById,
  claimCaveatLabel,
  claimEvidenceView,
  claimLevelLabel,
} from './evidence-claims.mjs';

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

export function evidenceFreshnessText(expiresAt, korean = false, summary = null) {
  const date = formatEvidenceDate(expiresAt, korean ? 'ko-KR' : 'en-GB');
  if (!date) return null;
  if (!summary) return korean ? `검증 근거 최신 · ${date}까지 유효` : `Evidence current · valid through ${date}`;
  const view = claimEvidenceView(summary);
  const labels = CLAIM_IDS.map((id) => claimById(view, id)?.effectiveVisibleLevel ?? 'withheld');
  const count = (level) => labels.filter((value) => value === level).length;
  const detail = korean
    ? `검증됨 ${count('validated')} · 측정됨 ${count('measured')} · 정보용 ${count('informational')} · 보류 ${count('withheld')}`
    : `${count('validated')} validated · ${count('measured')} measured · ${count('informational')} informational · ${count('withheld')} withheld`;
  return korean
    ? `검증 근거 최신 · ${detail} · ${date}까지 유효`
    : `Evidence current · ${detail} · valid through ${date}`;
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
  const claimView = claimEvidenceView(summary);
  const claim = (id) => claimById(claimView, id);
  const visible = (id) => claim(id)?.effectiveVisibleLevel !== 'withheld';
  if (!Number.isInteger(tests?.total) || tests.total <= 0) return {};

  const values = {
    'tests.formatted': visible('tests.unit') ? Number(tests.total).toLocaleString('en-US') : '보류',
    'validation.scipyAgreement': visible('validation.scipy.regular') ? scipy.display : '보류',
    'validation.periodDoublingDisplay': periodDoubling.display,
    'energy.bestMethod': visible('benchmark.energy.methods') ? energy.bestMethod : '보류'
  };
  for (const id of CLAIM_IDS) {
    values[`claim.${id}.level`] = claimLevelLabel(claim(id)?.effectiveVisibleLevel, true);
    values[`claim.${id}.caveat`] = claimCaveatLabel(claim(id), true);
  }
  if (visible('benchmark.energy.methods') && typeof energy.profiledMethods === 'number') {
    values['energy.profileLabel'] = `${energy.profiledMethods}개 방법 프로파일링`;
  } else {
    values['energy.profileLabel'] = '근거 보류';
  }
  if (
    visible('benchmark.energy.methods')
    && typeof energy.bestMaxRelativeDrift === 'number'
    && Number.isFinite(energy.bestMaxRelativeDrift)
  ) {
    values['energy.bestDrift'] = `${energy.bestMaxRelativeDrift.toExponential(3)} 최대 상대 드리프트`;
  } else {
    values['energy.bestDrift'] = '유효한 측정 근거 없음';
  }
  if (visible('testing.mutation') && typeof mutation.score === 'number') {
    const shards = typeof mutation.reportCount === 'number' ? mutation.reportCount : 0;
    const band = mutation.status === 'low' ? '낮음' : String(mutation.status || '미평가');
    values['mutation.scoreLabel'] = `${mutation.score.toFixed(2)}% · ${band} 등급 · ${shards}개 샤드`;
    values['mutation.detailLabel'] =
      `${mutation.score.toFixed(2)}% 전체 · ${Number(mutation.coveredScore || 0).toFixed(2)}% 커버됨 · ${band} 등급 · ${shards}개 샤드`;
  }
  if (visible('gpu.vendor-matrix') && typeof gpu.passedVendors === 'number' && typeof gpu.requiredVendors === 'number') {
    values['gpu.vendorLabel'] = `${gpu.passedVendors} / ${gpu.requiredVendors} 공급업체`;
  } else {
    values['gpu.vendorLabel'] = '근거 보류';
  }
  if (Array.isArray(gpu.missingVendors) && gpu.missingVendors.length) {
    values['gpu.missingLabel'] = `${gpu.missingVendors.map((vendor) => String(vendor).toUpperCase()).join(' + ')} 대기 중`;
  }
  values['publication.availableLabel'] = visible('publication.release') && publication.githubReleaseUrl && publication.pagesUrl
    ? 'GitHub 릴리스 + Pages 공개'
    : visible('publication.release') ? '공개 산출물 미완료' : '출판 근거 보류';
  const missingPublication = [];
  if (publication.npmPublished === false) missingPublication.push('npm');
  if (publication.zenodoPublished === false) missingPublication.push('Zenodo');
  if (missingPublication.length) values['publication.missingLabel'] = `${missingPublication.join(' + ')} 대기 중`;
  values['ledger.verify'] =
    `CSP 안전 린트 → 엄격 타입 검사 → 모듈 크기 래칫 → ${tests.total}개 단위 테스트 → 결과 수 가드 → 문서 동기화 → 포맷 게이트`;
  return values;
}
