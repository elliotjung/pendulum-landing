// ============================================================================
// PENDULUM LAB — public landing interactions
// The science, hero lifecycle, evidence, attribution, and navigation stay
// explicit. Decorative motion is limited to small, one-shot CSS reveals.
// ============================================================================
(function () {
  'use strict';
  window.__PENDULUM_MAIN_READY = true;
  if (window.__PENDULUM_MAIN_WATCHDOG) {
    clearTimeout(window.__PENDULUM_MAIN_WATCHDOG);
    window.__PENDULUM_MAIN_WATCHDOG = 0;
  }
  // The normal pre-paint path already removed this class. The condition is
  // only true when a very slow main.js arrives after the four-second fallback.
  const recoveredFromNoJs = document.documentElement.classList.contains('no-js');
  if (recoveredFromNoJs) {
    document.documentElement.classList.remove('no-js');
  }
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducedDataQuery = window.matchMedia('(prefers-reduced-data: reduce)');
  const compactQuery = window.matchMedia('(max-width: 720px)');
  const queryFlag = (name) => /^(?:1|true|yes)$/i.test(new URLSearchParams(window.location.search).get(name) || '');
  const localFixtureHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  if (localFixtureHost && new URLSearchParams(window.location.search).get('lhFixture') === 'bundle-long-task') {
    void import('./lighthouse-regression-fixture.js');
  }
  let reduced = reducedMotionQuery.matches;
  let reducedData = reducedDataQuery.matches || navigator.connection?.saveData === true;
  let compactViewport = compactQuery.matches;
  let reducedEffects = reduced || compactViewport;
  const captureMode = queryFlag('captureHero') || window.__PENDULUM_CAPTURE_HERO === true;
  const koreanPage = document.documentElement.lang === 'ko';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  if (captureMode) document.body.classList.add('capture-mode');

  // ---- Privacy-friendly referral attribution -------------------------------
  // No tracking script or cookie is needed: the app receives ordinary UTM
  // parameters and may aggregate them under its own first-party policy.
  $$('a[data-app-link]').forEach((anchor) => {
    try {
      const url = new URL(anchor.href);
      const goal = anchor.dataset.ctaGoal;
      const persona = anchor.dataset.ctaPersona;
      // Keep the semantic launch contract in both raw HTML and the hydrated
      // URL. The app can treat goal as the mission and audience as the UI
      // persona without relying on storage left by an earlier visit.
      if (goal) url.searchParams.set('goal', goal);
      if (persona) url.searchParams.set('audience', persona);
      url.searchParams.set('lang', koreanPage ? 'ko' : 'en');
      url.searchParams.set('utm_source', 'pendulum-landing');
      url.searchParams.set('utm_medium', 'referral');
      url.searchParams.set('utm_campaign', 'research-lab');
      if (anchor.dataset.utmContent) url.searchParams.set('utm_content', anchor.dataset.utmContent);
      anchor.href = url.toString();
    } catch {
      /* leave malformed/non-HTTP fallback links untouched */
    }
  });

  // Preserve attribution and the reader's current section when switching
  // between the statically generated language pages. The plain href remains a
  // complete no-JS fallback; this enhancement also supports open-in-new-tab.
  const languageToggle = $('#lang-toggle');
  function refreshLanguageHref() {
    if (!(languageToggle instanceof HTMLAnchorElement)) return;
    try {
      const current = new URL(window.location.href);
      const target = new URL(languageToggle.getAttribute('href') || '', current);
      const targetLanguage = languageToggle.hreflang || (koreanPage ? 'en' : 'ko');
      target.search = '';
      current.searchParams.forEach((value, key) => {
        if (key !== 'lang') target.searchParams.append(key, value);
      });
      target.searchParams.set('lang', targetLanguage);
      target.hash = current.hash;
      languageToggle.href = target.toString();
    } catch {
      /* retain the static language URL */
    }
  }
  refreshLanguageHref();
  window.addEventListener('hashchange', refreshLanguageHref, { passive: true });
  window.addEventListener('pendulum:experiment-state', refreshLanguageHref);

  // ---- Shared evidence summary --------------------------------------------
  const EVIDENCE_CLAIM_IDS = [
    'tests.unit',
    'validation.scipy.regular',
    'testing.mutation',
    'benchmark.energy.methods',
    'gpu.vendor-matrix',
    'publication.release'
  ];
  const EVIDENCE_LEVELS = ['withheld', 'informational', 'measured', 'validated', 'publication-ready'];
  const EVIDENCE_LEVEL_RANK = Object.fromEntries(EVIDENCE_LEVELS.map((level, index) => [level, index]));
  const KO_CLAIM_CAVEATS = {
    'tests.unit': '성공한 전체 테스트 결과와 정확한 소스 해시가 있을 때만 검증됨으로 표시합니다.',
    'validation.scipy.regular': '정규 궤도 비교 결과이며, 카오스 궤도의 비트 단위 일치를 주장하지 않습니다.',
    'testing.mutation': '70% 품질 목표 미만이면 검증됨이 아니라 측정됨으로 낮춰 표시합니다.',
    'benchmark.energy.methods': '방법별 드리프트를 비교한 측정값이며 모든 방법에 공통인 합격 기준은 아닙니다.',
    'gpu.vendor-matrix': '실물 NVIDIA·AMD 증거가 없으면 부분 측정으로만 표시합니다.',
    'publication.release': '정확한 npm 버전·GitHub 릴리스·Zenodo DOI·Pages 결합이 모두 확인돼야 출판 준비 완료입니다.'
  };

  function legacyClaimEvidenceView(summary) {
    const raw = new Map((Array.isArray(summary?.claims) ? summary.claims : []).map((claim) => [claim?.id, claim]));
    const mutation = String(summary?.mutation?.status || 'unknown');
    const gpu = String(summary?.gpu?.status || 'unknown');
    const publication = String(summary?.publication?.status || 'unknown');
    const levels = {
      'tests.unit': raw.get('tests.unit')?.status === 'passed' ? 'validated' : 'withheld',
      'validation.scipy.regular': raw.get('validation.scipy.regular')?.status === 'passed' ? 'validated' : 'withheld',
      'testing.mutation': mutation === 'high' || mutation === 'passed' ? 'validated' : mutation === 'low' ? 'measured' : 'withheld',
      'benchmark.energy.methods': Number.isInteger(summary?.energy?.profiledMethods) && summary.energy.profiledMethods > 0 ? 'measured' : 'withheld',
      'gpu.vendor-matrix': gpu === 'complete' || gpu === 'passed' ? 'validated' : gpu === 'partial' ? 'measured' : 'withheld',
      'publication.release': publication === 'complete' || publication === 'published' || publication === 'passed'
        ? 'publication-ready'
        : publication === 'partial' ? 'informational' : 'withheld'
    };
    return EVIDENCE_CLAIM_IDS.map((id) => ({
      id,
      effectiveVisibleLevel: levels[id],
      displayValue: levels[id] === 'withheld' ? null : String(raw.get(id)?.displayValue || ''),
      caveats: [raw.get(id)?.caveat].filter((value) => typeof value === 'string' && value.trim())
    }));
  }

  function runtimeClaimEvidenceView(summary) {
    const surface = summary?.claimEvidence;
    let claims;
    let source;
    if (surface === undefined) {
      claims = legacyClaimEvidenceView(summary);
      source = 'legacy';
    } else {
      const valid = surface && typeof surface === 'object'
        && surface.schemaVersion === 'pendulum-claim-evidence-surface/v1'
        && surface.loadState === 'loaded'
        && surface.evidenceSourceCommit === summary?.provenance?.sourceCommit
        && surface.evidenceExpiresAt === summary?.provenance?.expiresAt
        && Array.isArray(surface.claims) && surface.claims.length === EVIDENCE_CLAIM_IDS.length;
      if (!valid) return null;
      const byId = new Map();
      for (const claim of surface.claims) {
        if (!claim || !EVIDENCE_CLAIM_IDS.includes(claim.id) || byId.has(claim.id)
          || !EVIDENCE_LEVELS.includes(claim.effectiveVisibleLevel)
          || (claim.effectiveVisibleLevel === 'withheld' && claim.displayValue !== null)
          || !Array.isArray(claim.caveats)) return null;
        byId.set(claim.id, claim);
      }
      if (EVIDENCE_CLAIM_IDS.some((id) => !byId.has(id))) return null;
      const evidenceExpiry = Date.parse(String(summary?.provenance?.expiresAt || ''));
      claims = EVIDENCE_CLAIM_IDS.map((id) => {
        const claim = byId.get(id);
        const claimExpiry = Date.parse(String(claim.validUntil || ''));
        const validExpiries = [evidenceExpiry, claimExpiry].filter(Number.isFinite);
        const expiresAt = validExpiries.length ? Math.min(...validExpiries) : NaN;
        if (Number.isFinite(expiresAt) && Date.now() >= expiresAt && claim.effectiveVisibleLevel !== 'withheld') {
          const informational = EVIDENCE_LEVEL_RANK[claim.effectiveVisibleLevel] > EVIDENCE_LEVEL_RANK.informational
            ? 'informational'
            : claim.effectiveVisibleLevel;
          return {
            ...claim,
            effectiveVisibleLevel: informational,
            caveats: [...new Set([...claim.caveats, 'This evidence is expired and retained only as historical information.'])]
          };
        }
        return claim;
      });
      source = 'canonical';
    }
    const counts = Object.fromEntries(EVIDENCE_LEVELS.map((level) => [level, 0]));
    claims.forEach((claim) => { counts[claim.effectiveVisibleLevel] += 1; });
    return { source, claims, counts };
  }

  function claimLevelLabel(level) {
    const labels = koreanPage
      ? { withheld: '보류', informational: '정보용', measured: '측정됨', validated: '검증됨', 'publication-ready': '출판 준비 완료' }
      : { withheld: 'withheld', informational: 'informational', measured: 'measured', validated: 'validated', 'publication-ready': 'publication-ready' };
    return labels[level] || labels.withheld;
  }

  function applyClaimPresentation(view) {
    const claims = new Map((view?.claims || EVIDENCE_CLAIM_IDS.map((id) => ({
      id,
      effectiveVisibleLevel: 'withheld',
      caveats: []
    }))).map((claim) => [claim.id, claim]));
    EVIDENCE_CLAIM_IDS.forEach((id) => {
      const claim = claims.get(id);
      const level = claim?.effectiveVisibleLevel || 'withheld';
      $$(`[data-claim-status="${id}"]`).forEach((element) => {
        element.textContent = claimLevelLabel(level);
        if (element.classList.contains('evidence-status')) {
          EVIDENCE_LEVELS.forEach((candidate) => element.classList.remove(candidate));
          element.classList.remove('passed', 'partial');
          element.classList.add(level);
        }
      });
      const caveat = koreanPage
        ? KO_CLAIM_CAVEATS[id]
        : (claim?.caveats || []).filter((value) => typeof value === 'string' && value.trim()).join(' ')
          || 'See the evidence ledger for scope and limitations.';
      $$(`[data-claim-caveat="${id}"]`).forEach((element) => { element.textContent = caveat; });
    });
    $$('script[type="application/ld+json"]').forEach((script) => {
      try {
        const documentData = JSON.parse(script.textContent || '{}');
        const graph = Array.isArray(documentData?.['@graph']) ? documentData['@graph'] : [documentData];
        let changed = false;
        for (const node of graph) {
          if (node?.['@type'] !== 'SoftwareSourceCode' || !Array.isArray(node.additionalProperty)) continue;
          for (const property of node.additionalProperty) {
            const claim = claims.get(property?.propertyID);
            if (!claim) continue;
            property.value = claim.effectiveVisibleLevel || 'withheld';
            changed = true;
          }
        }
        if (changed) script.textContent = JSON.stringify(documentData);
      } catch {
        // Static JSON-LD is separately validated at build time; malformed
        // runtime content must never interrupt fail-closed evidence handling.
      }
    });
    document.body.dataset.claimEvidence = view?.source || 'unavailable';
  }

  function maskUnavailableClaimValues() {
    const withheld = koreanPage ? '보류' : 'withheld';
    const keys = [
      'tests.passLabel', 'tests.greenLabel', 'tests.formatted', 'validation.scipyAgreement',
      'mutation.scoreLabel', 'mutation.detailLabel', 'energy.profileLabel', 'energy.bestMethod',
      'energy.bestDrift', 'gpu.vendorLabel', 'gpu.missingLabel', 'publication.availableLabel',
      'publication.missingLabel'
    ];
    keys.forEach((key) => $$(`[data-evidence="${key}"]`).forEach((element) => { element.textContent = withheld; }));
    $$('[data-evidence-count="tests.passed"]').forEach((element) => {
      element.dataset.count = '0';
      element.textContent = withheld;
    });
  }

  function evidenceIsUsable(summary) {
    const tests = summary?.tests;
    const provenance = summary?.provenance;
    const validation = summary?.validation;
    const mutation = summary?.mutation;
    const energy = summary?.energy;
    const gpu = summary?.gpu;
    const publication = summary?.publication;
    return summary?.schemaVersion === 'pendulum-evidence-summary/v1'
      && Number.isInteger(tests?.total) && tests.total > 0
      && Number.isInteger(tests?.passed) && Number.isInteger(tests?.failed)
      && /^[a-f0-9]{40}$/i.test(String(provenance?.sourceCommit || ''))
      && Number.isFinite(Date.parse(String(provenance?.expiresAt || '')))
      && typeof validation?.scipyAgreement?.display === 'string'
      && Number.isFinite(validation?.periodDoubling?.computed)
      && Number.isFinite(mutation?.score)
      && Number.isInteger(energy?.profiledMethods) && energy.profiledMethods >= 0
      && Number.isInteger(gpu?.passedVendors) && Number.isInteger(gpu?.requiredVendors)
      && typeof publication?.status === 'string'
      && runtimeClaimEvidenceView(summary) !== null;
  }

  function markEvidenceState(kind, expiresAt, claimView = null) {
    document.body.classList.remove('evidence-stale', 'evidence-invalid');
    const status = $('[data-evidence-freshness]');
    if (kind === 'invalid') {
      document.body.classList.add('evidence-invalid');
      if (status) status.textContent = koreanPage
        ? '검증 근거를 확인할 수 없음 · 정적 스냅숏 표시 중'
        : 'Evidence unavailable · showing the static snapshot';
      return;
    }
    if (kind === 'stale') {
      document.body.classList.add('evidence-stale');
      if (status) status.textContent = koreanPage
        ? '검증 근거 만료 · 동적 주장을 업데이트하지 않음'
        : 'Evidence expired · dynamic claims were not updated';
      return;
    }
    if (status && Number.isFinite(expiresAt)) {
      const date = new Intl.DateTimeFormat(koreanPage ? 'ko-KR' : 'en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
      }).format(new Date(expiresAt));
      const counts = claimView?.counts || {};
      const detail = koreanPage
        ? `검증됨 ${counts.validated || 0} · 측정됨 ${counts.measured || 0} · 정보용 ${counts.informational || 0} · 보류 ${counts.withheld || 0}`
        : `${counts.validated || 0} validated · ${counts.measured || 0} measured · ${counts.informational || 0} informational · ${counts.withheld || 0} withheld`;
      status.textContent = koreanPage
        ? `검증 근거 최신 · ${detail} · ${date}까지 유효`
        : `Evidence current · ${detail} · valid through ${date}`;
    }
  }

  function applyEvidence(summary) {
    if (!evidenceIsUsable(summary)) {
      applyClaimPresentation(null);
      maskUnavailableClaimValues();
      markEvidenceState('invalid');
      return;
    }
    const claimView = runtimeClaimEvidenceView(summary);
    applyClaimPresentation(claimView);
    const expiresAt = Date.parse(summary.provenance.expiresAt);
    if (Date.now() > expiresAt) {
      markEvidenceState('stale', expiresAt, claimView);
      return;
    }
    markEvidenceState('current', expiresAt, claimView);
    const tests = summary.tests;
    const validation = summary.validation || {};
    const mutation = summary.mutation || {};
    const energy = summary.energy || {};
    const gpu = summary.gpu || {};
    const publication = summary.publication || {};
    const pd = validation.periodDoubling || {};
    const sci = validation.scipyAgreement || {};
    const setText = (key, value) => {
      if (value === undefined || value === null) return;
      $$(`[data-evidence="${key}"]`).forEach((el) => { el.textContent = String(value); });
    };
    const setCount = (key, value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      $$(`[data-evidence-count="${key}"]`).forEach((el) => {
        el.dataset.count = String(value);
        if (el.__done) {
          const decimals = parseInt(el.dataset.decimals || '0', 10);
          el.textContent = (el.dataset.prefix || '') + value.toFixed(decimals) + (el.dataset.suffix || '');
        }
      });
    };
    const visible = (id) => claimView?.claims.find((claim) => claim.id === id)?.effectiveVisibleLevel !== 'withheld';
    const setClaimText = (id, key, value) => setText(key, visible(id) ? value : (koreanPage ? '보류' : 'withheld'));

    setClaimText('tests.unit', 'tests.passLabel', tests.passLabel || `${tests.passed} / ${tests.total} pass`);
    setClaimText('tests.unit', 'tests.greenLabel', `${tests.passed} green`);
    setClaimText('tests.unit', 'tests.formatted', Number(tests.total).toLocaleString('en-US'));
    setClaimText('validation.scipy.regular', 'validation.scipyAgreement', sci.display);
    setText('validation.periodDoublingDisplay', pd.display);
    setText('validation.periodDoubling', typeof pd.computed === 'number' ? pd.computed.toFixed(4) : undefined);
    if (visible('testing.mutation') && typeof mutation.score === 'number') {
      const shards = typeof mutation.reportCount === 'number' ? mutation.reportCount : 0;
      const band = typeof mutation.status === 'string' ? mutation.status : 'unrated';
      const bandLabel = koreanPage ? (band === 'low' ? '낮음' : band) : `${band} band`;
      setText('mutation.scoreLabel', koreanPage
        ? `${mutation.score.toFixed(2)}% · ${bandLabel} 등급 · ${shards}개 샤드`
        : `${mutation.score.toFixed(2)}% · ${bandLabel} · ${shards} shards`);
      setText('mutation.detailLabel', koreanPage
        ? `${mutation.score.toFixed(2)}% 전체 · ${Number(mutation.coveredScore || 0).toFixed(2)}% 커버됨 · ${bandLabel} 등급 · ${shards}개 샤드`
        : `${mutation.score.toFixed(2)}% total · ${Number(mutation.coveredScore || 0).toFixed(2)}% covered · ${bandLabel} · ${shards} shards`);
    } else {
      setClaimText('testing.mutation', 'mutation.scoreLabel', null);
      setClaimText('testing.mutation', 'mutation.detailLabel', null);
    }
    if (visible('benchmark.energy.methods') && typeof energy.profiledMethods === 'number') {
      setClaimText('benchmark.energy.methods', 'energy.profileLabel', koreanPage ? `${energy.profiledMethods}개 방법 프로파일링` : `${energy.profiledMethods} methods profiled`);
    } else {
      setClaimText('benchmark.energy.methods', 'energy.profileLabel', null);
    }
    setClaimText('benchmark.energy.methods', 'energy.bestMethod', energy.bestMethod);
    if (visible('benchmark.energy.methods') && typeof energy.bestMaxRelativeDrift === 'number' && Number.isFinite(energy.bestMaxRelativeDrift)) {
      setClaimText('benchmark.energy.methods', 'energy.bestDrift', koreanPage
        ? `${energy.bestMaxRelativeDrift.toExponential(3)} 최대 상대 드리프트`
        : `${energy.bestMaxRelativeDrift.toExponential(3)} max relative drift`);
    } else {
      setClaimText('benchmark.energy.methods', 'energy.bestDrift', null);
    }
    if (visible('gpu.vendor-matrix') && typeof gpu.passedVendors === 'number' && typeof gpu.requiredVendors === 'number') {
      setClaimText('gpu.vendor-matrix', 'gpu.vendorLabel', koreanPage
        ? `${gpu.passedVendors} / ${gpu.requiredVendors} 공급업체`
        : `${gpu.passedVendors} / ${gpu.requiredVendors} vendors`);
    } else {
      setClaimText('gpu.vendor-matrix', 'gpu.vendorLabel', null);
    }
    if (visible('gpu.vendor-matrix') && Array.isArray(gpu.missingVendors) && gpu.missingVendors.length) {
      const missing = gpu.missingVendors.map((vendor) => String(vendor).toUpperCase()).join(' + ');
      setClaimText('gpu.vendor-matrix', 'gpu.missingLabel', koreanPage ? `${missing} 대기 중` : `${missing} pending`);
    } else {
      setClaimText('gpu.vendor-matrix', 'gpu.missingLabel', null);
    }
    setClaimText('publication.release', 'publication.availableLabel', publication.githubReleaseUrl && publication.pagesUrl
      ? koreanPage ? 'GitHub 릴리스 + Pages 공개' : 'GitHub release + Pages live'
      : koreanPage ? '공개 산출물 미완료' : 'Public artifacts incomplete');
    const missingPublication = [];
    if (publication.npmPublished === false) missingPublication.push('npm');
    if (publication.zenodoPublished === false) missingPublication.push('Zenodo');
    if (missingPublication.length) setClaimText('publication.release', 'publication.missingLabel', koreanPage
      ? `${missingPublication.join(' + ')} 대기 중`
      : `${missingPublication.join(' + ')} pending`);
    setClaimText('tests.unit', 'ledger.verify', koreanPage
      ? `CSP 안전 린트 → 엄격 타입 검사 → 모듈 크기 래칫 → ${tests.total}개 단위 테스트 → 결과 수 가드 → 문서 동기화 → 포맷 게이트`
      : `CSP-safe lint → strict typecheck → module-size ratchet → ${tests.total} unit tests → result-count guard → docs sync → format gate`);
    if (visible('tests.unit')) setCount('tests.passed', tests.passed);
    setCount('validation.periodDoublingComputed', pd.computed);

    const meta = document.querySelector('meta[name="description"]');
    if (meta && typeof tests.total === 'number' && visible('tests.unit')) {
      const content = meta.getAttribute('content') || '';
      // Comma-aware: the static description writes "1,090 unit tests".
      meta.setAttribute('content', content.replace(/[\d,]+ (verified|unit) tests/, `${tests.total.toLocaleString('en-US')} $1 tests`));
    }
  }

  fetch('assets/evidence-summary.json', { cache: 'default' })
    .then((response) => response.ok ? response.json() : null)
    .then(applyEvidence)
    .catch(() => applyEvidence(null));

  function applyChangelog(summary) {
    const valid = summary?.schemaVersion === 'pendulum-changelog-highlights/v1'
      && /^[a-f0-9]{40}$/i.test(String(summary?.sourceCommit || ''))
      && /^https:\/\/github\.com\/elliotjung\/pendulum-lab\/blob\/[a-f0-9]{40}\/CHANGELOG\.md$/i.test(String(summary?.sourceUrl || ''))
      && Array.isArray(summary?.highlights) && summary.highlights.length === 3
      && summary.highlights.every((item) => typeof item?.title === 'string' && item.title.trim()
        && typeof item?.summary === 'string' && item.summary.trim());
    if (!valid) {
      document.body.classList.add('changelog-invalid');
      const provenance = $('[data-changelog-provenance]');
      if (provenance) provenance.textContent = koreanPage ? '정적 릴리스 요약 표시 중' : 'Showing the static release summary';
      return;
    }
    document.body.classList.remove('changelog-invalid');
    const cards = $$('[data-changelog-list] .changelog-card');
    summary.highlights.slice(0, 3).forEach((highlight, index) => {
      const card = cards[index];
      if (!card) return;
      const title = $('h3', card);
      const description = $('p', card);
      const hasKorean = typeof highlight.titleKo === 'string' && highlight.titleKo.trim()
        && typeof highlight.summaryKo === 'string' && highlight.summaryKo.trim();
      const localized = koreanPage && hasKorean;
      if (title) title.textContent = String(localized ? highlight.titleKo : highlight.title || 'Release update');
      if (description) description.textContent = String(localized ? highlight.summaryKo : highlight.summary || 'See the full changelog for details.');
      if (koreanPage) card.setAttribute('lang', localized ? 'ko' : 'en');
      else card.removeAttribute('lang');
      card.dataset.ready = 'true';
    });
    const source = $('[data-changelog-source]');
    if (source && typeof summary.sourceUrl === 'string') source.href = summary.sourceUrl;
    const provenance = $('[data-changelog-provenance]');
    if (provenance && typeof summary.sourceCommit === 'string') {
      provenance.textContent = koreanPage
        ? `pendulum-lab@${summary.sourceCommit.slice(0, 12)}에서 동기화`
        : `Synced from pendulum-lab@${summary.sourceCommit.slice(0, 12)}`;
    }
  }

  fetch('assets/changelog-highlights.json', { cache: 'default' })
    .then((response) => response.ok ? response.json() : null)
    .then(applyChangelog)
    .catch(() => applyChangelog(null));

  // ---- Deferred hero scene --------------------------------------------------
  const mainScriptUrl = document.currentScript?.src || new URL('assets/main.js', window.location.href).href;
  const sceneUrl = new URL('scene.bundle.js', mainScriptUrl).href;
  const captureHero = captureMode;
  const lowMemory = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 2;
  const heroCanvas = $('#hero-canvas');
  const heroToggle = $('[data-hero-toggle]');
  const heroToggleLabel = $('[data-hero-toggle-label]');
  const heroStatus = $('[data-hero-status]');
  const heroStageState = $('[data-hero-stage-state]');
  const heroStageRate = $('[data-hero-stage-rate]');
  let heroSceneRequested = false;
  let heroScenePromise = null;
  let heroEnsurePromise = null;
  let heroUnavailable = false;
  let heroIntentController = null;
  let heroState = 'idle';
  window.__heroUserPaused = false;

  const heroCopy = koreanPage ? {
    idle: ['3D 시작', '인터랙티브 3D를 시작할 준비가 되었습니다.', '3D 준비', '조작하면 시작'],
    loading: ['3D 불러오는 중', '3D 물리 장면을 준비하고 있습니다.', '렌더러 준비 중', '240 Hz 물리 준비'],
    live: ['3D 일시정지', '실시간 3D 이중진자가 움직이고 있습니다.', '실시간 RK4', '240 Hz 물리'],
    paused: ['3D 재개', '3D 이중진자 움직임이 일시정지되었습니다.', '일시정지', '상태 보존됨'],
    static: ['정적 이미지', '기기 환경설정을 존중해 정적 진자 이미지를 표시합니다.', '정적 모드', '환경설정 존중']
  } : {
    idle: ['Start 3D', 'Interactive 3D is ready to start.', '3D ready', 'starts on interaction'],
    loading: ['Loading 3D', 'Preparing the 3D physics scene.', 'preparing renderer', 'warming 240 Hz physics'],
    live: ['Pause 3D', 'The live 3D double pendulum is moving.', 'Live RK4', '240 Hz physics'],
    paused: ['Resume 3D', 'The 3D double pendulum is paused.', 'paused', 'state preserved'],
    static: ['Static artwork', 'Showing the static pendulum artwork to respect this device preference.', 'static mode', 'preference respected']
  };

  function setHeroState(nextState) {
    heroState = nextState;
    const normalized = nextState === 'failed' ? 'static' : nextState;
    const copy = heroCopy[normalized] || heroCopy.idle;
    document.body.classList.toggle('hero-loading', normalized === 'loading');
    document.body.classList.toggle('hero-user-paused', normalized === 'paused');
    if (heroToggle instanceof HTMLButtonElement) {
      heroToggle.disabled = normalized === 'loading' || normalized === 'static';
      heroToggle.setAttribute('aria-pressed', String(normalized === 'paused'));
    }
    if (heroToggleLabel) heroToggleLabel.textContent = copy[0];
    if (heroStatus) heroStatus.textContent = copy[1];
    if (heroStageState) heroStageState.textContent = copy[2];
    if (heroStageRate) heroStageRate.textContent = copy[3];
    if (normalized === 'idle' || normalized === 'static') window.__heroPainted = true;
  }

  // Three emits a console error when its constructor discovers that WebGL is
  // unavailable. Probe WebGL2 first and only import the renderer bundle
  // when a context can actually be created. Preventing the creation-error event
  // keeps unsupported Firefox/CI environments on a quiet CSS/WebP fallback.
  function canCreateWebGL2() {
    if (!window.WebGL2RenderingContext) return false;
    const probe = document.createElement('canvas');
    const preventNoise = (event) => event.preventDefault();
    probe.addEventListener('webglcontextcreationerror', preventNoise);
    try {
      const context = probe.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: true,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false
      });
      if (!context) return false;
      // Do not explicitly call WEBGL_lose_context on the probe. WebKit reports
      // that expected release as a console error; the detached one-pixel canvas
      // is reclaimed naturally without polluting production diagnostics.
      probe.width = 1;
      probe.height = 1;
      return true;
    } catch {
      return false;
    } finally {
      probe.removeEventListener('webglcontextcreationerror', preventNoise);
    }
  }

  function clearHeroIntent() {
    heroIntentController?.abort();
    heroIntentController = null;
  }

  function heroPrefersPoster() {
    reduced = reducedMotionQuery.matches;
    reducedData = reducedDataQuery.matches || navigator.connection?.saveData === true;
    return !captureHero && (reduced || reducedData || lowMemory);
  }

  function failHeroScene(reason) {
    heroUnavailable = true;
    document.body.classList.add('no-webgl');
    document.body.dataset.heroFallback = reason;
    window.__heroPainted = true;
    setHeroState('static');
    return false;
  }

  function requestHeroScene() {
    if (heroUnavailable) {
      setHeroState('static');
      return Promise.resolve(false);
    }
    // Compact screens use scene.js's reduced geometry/bloom-free renderer.
    // Only an explicit motion/data preference or a genuinely low-memory tier
    // stays on the poster, so capable phones still receive the live 3D descent.
    if (heroPrefersPoster()) {
      clearHeroIntent();
      document.body.classList.add(reduced ? 'reduced-motion-hero' : 'low-power-hero');
      window.__heroPainted = true;
      setHeroState('static');
      return Promise.resolve(false);
    }
    if (!heroScenePromise && !canCreateWebGL2()) {
      heroSceneRequested = true;
      heroUnavailable = true;
      clearHeroIntent();
      document.body.classList.add('no-webgl');
      document.body.dataset.heroFallback = 'webgl2-unavailable';
      window.__heroPainted = true;
      setHeroState('static');
      return Promise.resolve(false);
    }
    heroSceneRequested = true;
    clearHeroIntent();
    document.body.classList.remove('reduced-motion-hero', 'low-power-hero');
    setHeroState('loading');
    heroScenePromise ||= import(sceneUrl);
    if (heroEnsurePromise) return heroEnsurePromise;

    let trackedEnsure;
    trackedEnsure = heroScenePromise
      .then(() => {
        const lifecycle = window.__heroLifecycle;
        if (typeof lifecycle?.ensure === 'function') return lifecycle.ensure();
        return Boolean(window.__hero);
      })
      .then((ready) => {
        if (!ready && (heroPrefersPoster() || window.__heroLifecycle?.phase === 'context-lost')) {
          setHeroState('static');
        }
        return Boolean(ready);
      })
      .catch(() => failHeroScene('module-load'))
      .finally(() => {
        if (heroEnsurePromise === trackedEnsure) heroEnsurePromise = null;
      });
    heroEnsurePromise = trackedEnsure;
    return trackedEnsure;
  }

  window.addEventListener('pendulum:hero-state', (event) => {
    const state = event instanceof CustomEvent ? event.detail?.state : null;
    const fallback = document.body.dataset.heroFallback;
    if (state === 'static' && document.body.classList.contains('no-webgl') && fallback !== 'context-lost') {
      heroUnavailable = true;
    }
    if (state === 'loading' || state === 'live' || state === 'paused' || state === 'static') setHeroState(state);
  });

  heroToggle?.addEventListener('click', () => {
    if (heroState === 'idle' || heroState === 'failed') {
      requestHeroScene();
      return;
    }
    if (heroState === 'live') {
      window.__heroUserPaused = true;
      window.__hero?.setUserPaused?.(true);
      setHeroState('paused');
      return;
    }
    if (heroState === 'paused') {
      window.__heroUserPaused = false;
      window.__hero?.setUserPaused?.(false);
      setHeroState('live');
    }
  });

  if (captureHero) {
    requestHeroScene();
  } else {
    heroIntentController = new AbortController();
    const intentOptions = { once: true, passive: true, signal: heroIntentController.signal };
    const scrollIntentOptions = { passive: true, signal: heroIntentController.signal };
    const hero = document.querySelector('.hero');
    hero?.addEventListener('pointermove', requestHeroScene, intentOptions);
    hero?.addEventListener('pointerdown', requestHeroScene, intentOptions);
    hero?.addEventListener('touchstart', requestHeroScene, intentOptions);
    const requestHeroFromScroll = () => {
      if (Math.abs(window.scrollY) < 8) return;
      window.removeEventListener('scroll', requestHeroFromScroll);
      requestHeroScene();
    };
    window.addEventListener('scroll', requestHeroFromScroll, scrollIntentOptions);
  }

  function syncHeroPreferences({ allowLoad = true } = {}) {
    reduced = reducedMotionQuery.matches;
    reducedData = reducedDataQuery.matches || navigator.connection?.saveData === true;
    compactViewport = compactQuery.matches;
    reducedEffects = reduced || compactViewport;
    const usePoster = !captureHero && (reduced || reducedData || lowMemory);
    document.body.classList.toggle('reduced-motion-hero', usePoster && reduced);
    document.body.classList.toggle('low-power-hero', usePoster && !reduced);
    if (usePoster) {
      window.__hero?.pause();
      window.__heroPainted = true;
      clearHeroIntent();
      setHeroState('static');
    } else if (heroUnavailable) {
      setHeroState('static');
    } else if (heroSceneRequested) {
      if (window.__hero) {
        window.__hero.resume();
        setHeroState(window.__heroUserPaused ? 'paused' : 'live');
      } else {
        requestHeroScene();
      }
    } else if (allowLoad) {
      requestHeroScene();
    } else {
      setHeroState('idle');
    }
  }

  const preferenceQueries = [reducedMotionQuery, reducedDataQuery, compactQuery];
  preferenceQueries.forEach((query) => query.addEventListener?.('change', () => syncHeroPreferences()));
  navigator.connection?.addEventListener?.('change', () => syncHeroPreferences());
  syncHeroPreferences({ allowLoad: false });

  // ---- NAV state, scrim, scroll progress ----------------------------------
  const nav = $('.nav');
  const scrim = $('.hero-scrim');
  const progress = $('.scroll-progress');
  const orbitDescent = $('#orbit-descent');
  const orbitBeats = $$('[data-orbit-beat]');
  const descentPhase = $('[data-descent-phase]');
  let orbitStart = Number.POSITIVE_INFINITY;
  let orbitEnd = Number.POSITIVE_INFINITY;
  let orbitBeatCenters = [];
  let activeOrbitBeat = -1;
  let orbitMetricsReady = false;
  let orbitResizeObserver = null;
  let previousScrollY = 0;
  let previousScrollTime = 0;
  window.__orbitScrollProgress = 0;
  window.__orbitScrollVelocity = 0;

  function cacheOrbitMetrics() {
    if (!orbitDescent) return;
    const rect = orbitDescent.getBoundingClientRect();
    orbitStart = rect.top + window.scrollY;
    orbitEnd = Math.max(orbitStart + 1, orbitStart + orbitDescent.offsetHeight - window.innerHeight);
    orbitBeatCenters = orbitBeats.map((beat) => {
      const beatRect = beat.getBoundingClientRect();
      return beatRect.top + window.scrollY + beatRect.height / 2;
    });
    orbitMetricsReady = true;
  }

  function ensureOrbitMetrics() {
    const liveGeometry = heroState === 'loading' || heroState === 'live' || heroState === 'paused';
    if (orbitMetricsReady || !orbitDescent || !liveGeometry) return;
    cacheOrbitMetrics();
    if ('ResizeObserver' in window) {
      orbitResizeObserver = new ResizeObserver(() => {
        cacheOrbitMetrics();
        scheduleScroll();
      });
      orbitResizeObserver.observe(orbitDescent);
    }
  }
  document.fonts?.ready.then(() => {
    if (orbitMetricsReady) cacheOrbitMetrics();
    scheduleScroll();
  }).catch(() => undefined);

  function setOrbitBeat(index) {
    if (index === activeOrbitBeat) return;
    activeOrbitBeat = index;
    orbitBeats.forEach((beat, beatIndex) => {
      const current = beatIndex === index;
      beat.classList.toggle('is-current', current);
      if (current) beat.setAttribute('aria-current', 'step');
      else beat.removeAttribute('aria-current');
    });
    const label = orbitBeats[index]?.querySelector('.descent-index')?.textContent?.trim();
    if (descentPhase && label) descentPhase.textContent = label;
  }

  function onScroll() {
    // Read layout first, then write — reading scrollHeight after touching
    // scrim/progress styles would force a synchronous reflow every frame.
    const sy = window.scrollY;
    const viewport = window.innerHeight;
    const max = document.documentElement.scrollHeight - viewport;
    const now = performance.now();
    const elapsed = previousScrollTime
      ? Math.max(1 / 240, Math.min(0.12, (now - previousScrollTime) / 1000))
      : 1 / 60;
    const rawVelocity = previousScrollTime
      ? ((sy - previousScrollY) / Math.max(viewport, 1)) / elapsed
      : 0;
    const velocityTarget = Math.max(-1, Math.min(1, rawVelocity * 0.12));
    const velocityBlend = 1 - Math.exp(-elapsed * 18);
    previousScrollY = sy;
    previousScrollTime = now;
    window.__orbitScrollVelocity += (velocityTarget - window.__orbitScrollVelocity) * velocityBlend;
    const hasOrbitMetrics = orbitMetricsReady && Number.isFinite(orbitStart) && Number.isFinite(orbitEnd);
    const orbitRange = hasOrbitMetrics ? Math.max(1, orbitEnd - orbitStart) : 1;
    const orbitProgress = hasOrbitMetrics ? Math.max(0, Math.min(1, (sy - orbitStart) / orbitRange)) : 0;
    window.__orbitScrollProgress = orbitProgress;
    if (orbitDescent) orbitDescent.style.setProperty('--orbit-scroll', orbitProgress.toFixed(4));
    const descentEntry = hasOrbitMetrics ? orbitStart - viewport * 0.35 : Number.POSITIVE_INFINITY;
    const descentExit = hasOrbitMetrics ? orbitEnd + viewport * 0.2 : Number.NEGATIVE_INFINITY;
    const descentActive = hasOrbitMetrics && sy >= descentEntry && sy <= descentExit;
    document.body.classList.toggle('orbit-descent-active', descentActive);
    document.body.classList.toggle('hero-scene-active', sy < viewport * 0.96 || descentActive);
    // Firefox can deliver the hero-exit and descent-entry IntersectionObserver
    // records in separate turns. The scroll controller is the authoritative
    // visibility source while the phase-space descent owns the viewport.
    window.__hero?.setScrollActive?.(descentActive);
    if (descentActive && orbitBeatCenters.length) {
      const viewportCenter = sy + viewport / 2;
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      orbitBeatCenters.forEach((center, index) => {
        const distance = Math.abs(center - viewportCenter);
        if (distance < nearestDistance) { nearest = index; nearestDistance = distance; }
      });
      setOrbitBeat(nearest);
    } else {
      setOrbitBeat(-1);
    }
    nav?.classList.toggle('scrolled', sy > 40);
    if (scrim) {
      const heroOpacity = Math.min(0.92, sy / (viewport * 0.9) * 0.92);
      let scrimOpacity = heroOpacity;
      if (orbitDescent && sy >= descentEntry && sy < orbitStart) {
        const entering = (sy - descentEntry) / Math.max(orbitStart - descentEntry, 1);
        scrimOpacity = heroOpacity + (0.12 - heroOpacity) * entering;
      } else if (orbitDescent && sy >= orbitStart && sy <= orbitEnd) {
        scrimOpacity = 0.12 + orbitProgress * 0.2;
      } else if (orbitDescent && sy > orbitEnd) {
        const leaving = Math.min(1, (sy - orbitEnd) / Math.max(viewport * 0.42, 1));
        scrimOpacity = 0.32 + leaving * 0.6;
      }
      scrim.style.opacity = scrimOpacity.toFixed(3);
    }
    if (progress) progress.style.transform = `scaleX(${Math.max(0, Math.min(1, max > 0 ? sy / max : 0)).toFixed(4)})`;
  }
  let scrollFrame = 0;
  function scheduleScroll() {
    if (scrollFrame) return;
    if (!orbitMetricsReady && Math.abs(window.scrollY) < 8) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      ensureOrbitMetrics();
      onScroll();
    });
  }
  window.addEventListener('scroll', scheduleScroll, { passive: true });
  window.addEventListener('resize', () => {
    if (!orbitMetricsReady) return;
    cacheOrbitMetrics();
    scheduleScroll();
  }, { passive: true });
  window.visualViewport?.addEventListener('resize', () => {
    if (!orbitMetricsReady) return;
    cacheOrbitMetrics();
    scheduleScroll();
  }, { passive: true });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted || window.location.hash) scheduleScroll();
  });
  window.addEventListener('pendulum:hero-state', (event) => {
    const state = event instanceof CustomEvent ? event.detail?.state : null;
    if ((state === 'loading' || state === 'live' || state === 'paused') && Math.abs(window.scrollY) >= 8) {
      scheduleScroll();
    }
  });
  document.body.classList.add('hero-scene-active');
  if (progress) progress.style.transform = 'scaleX(0)';
  if (scrim) scrim.style.opacity = '0';

  // ---- Small-screen menu: symmetric surface lifecycle ----------------------
  const navMenu = $('#nav-menu');
  if (navMenu) {
    const navMenuQuery = window.matchMedia('(max-width: 980px)');
    const summary = navMenu.querySelector('summary');
    const panel = navMenu.querySelector('.nav-menu-panel');
    let menuState = navMenu.open ? 'open' : 'closed';
    let menuGeneration = 0;
    let menuTimer = 0;

    function finishMenuClose(generation) {
      if (generation !== menuGeneration || menuState !== 'closing') return;
      window.clearTimeout(menuTimer);
      menuTimer = 0;
      navMenu.open = false;
      navMenu.classList.remove('is-opening', 'is-open', 'is-closing');
      menuState = 'closed';
    }

    function openMenu() {
      if (menuState === 'open' || menuState === 'opening') return;
      menuGeneration += 1;
      window.clearTimeout(menuTimer);
      navMenu.open = true;
      navMenu.classList.remove('is-closing', 'is-open');
      navMenu.classList.add('is-opening');
      menuState = 'opening';
      summary?.setAttribute('aria-expanded', 'true');
      if (reducedMotionQuery.matches) {
        navMenu.classList.remove('is-opening');
        navMenu.classList.add('is-open');
        menuState = 'open';
        return;
      }
      const generation = menuGeneration;
      requestAnimationFrame(() => {
        if (generation !== menuGeneration || menuState !== 'opening') return;
        navMenu.classList.remove('is-opening');
        navMenu.classList.add('is-open');
        menuState = 'open';
      });
    }

    function closeMenu({ restoreFocus = false } = {}) {
      if (menuState === 'closed' || menuState === 'closing') {
        if (restoreFocus) summary?.focus();
        return;
      }
      const generation = ++menuGeneration;
      window.clearTimeout(menuTimer);
      summary?.setAttribute('aria-expanded', 'false');
      navMenu.classList.remove('is-opening', 'is-open');
      navMenu.classList.add('is-closing');
      menuState = 'closing';
      if (restoreFocus) summary?.focus();
      if (reducedMotionQuery.matches || !(panel instanceof HTMLElement)) {
        finishMenuClose(generation);
        return;
      }
      panel.addEventListener('transitionend', (event) => {
        if (event.target === panel && event.propertyName === 'opacity') finishMenuClose(generation);
      }, { once: true });
      // A backgrounded tab may skip transitionend. Keep the lifecycle bounded.
      menuTimer = window.setTimeout(() => finishMenuClose(generation), 280);
    }

    summary?.setAttribute('aria-expanded', String(navMenu.open));
    summary?.addEventListener('click', (event) => {
      event.preventDefault();
      if (menuState === 'open' || menuState === 'opening') closeMenu();
      else openMenu();
    });
    navMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => closeMenu());
    });
    document.addEventListener('click', (event) => {
      if (navMenu.open && event.target instanceof Node && !navMenu.contains(event.target)) closeMenu();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && navMenu.open) {
        event.preventDefault();
        closeMenu({ restoreFocus: true });
      }
    });
    navMenuQuery.addEventListener?.('change', (event) => {
      if (!event.matches && navMenu.open) closeMenu();
    });
  }

  // ---- Scrollspy: mark the nav link whose section owns the viewport --------
  const spyLinks = $$('.nav-links a[href^="#"], .nav-menu-panel a[href^="#"]');
  if (spyLinks.length && 'IntersectionObserver' in window) {
    const setCurrent = (id) => spyLinks.forEach((a) => {
      if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
    const spy = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setCurrent(visible.target.id);
    }, { rootMargin: '-38% 0px -52% 0px', threshold: [0, 0.25, 0.5] });
    new Set(spyLinks.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean)).forEach((section) => {
      if (section) spy.observe(section);
    });
  }

  // ---- Quiet, one-shot section reveals -------------------------------------
  const revealElements = [...new Set([
    ...$$('.reveal, [data-wipe], [data-rise]'),
    ...$$('[data-stagger]').flatMap((group) => Array.from(group.children))
  ])];

  function revealElement(element) {
    element.classList.add('is-visible');
    if (element.classList.contains('sec-head')) element.classList.add('lit');
  }

  function revealAll() {
    revealElements.forEach(revealElement);
    document.body.classList.remove('reveal-observer-ready');
  }

  if (
    reducedEffects
    || captureMode
    || recoveredFromNoJs
    || !('IntersectionObserver' in window)
  ) {
    revealAll();
  } else {
    document.body.classList.add('reveal-observer-ready');
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        revealElement(entry.target);
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });

    revealElements.forEach((element) => revealObserver.observe(element));
    reducedMotionQuery.addEventListener?.('change', (event) => {
      if (event.matches) {
        revealObserver.disconnect();
        revealAll();
      }
    }, { once: true });
  }

  // ---- count-up telemetry (robust to IO non-delivery) ---------------------
  function animateValue(el) {
    if (el.__done) return;
    el.__done = true;
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const suffix = el.dataset.suffix || '', prefix = el.dataset.prefix || '';
    const dur = 1500, start = performance.now();
    (function tk(now) {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = prefix + (target * e).toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(tk);
      else el.textContent = prefix + target.toFixed(decimals) + suffix;
    })(start);
  }
  const counters = $$('[data-count]');
  if (reducedEffects || captureMode) {
    counters.forEach((el) => { el.__done = true; el.textContent = (el.dataset.prefix || '') + parseFloat(el.dataset.count).toFixed(parseInt(el.dataset.decimals || '0', 10)) + (el.dataset.suffix || ''); });
  } else {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { if (en.target.__counter) animateValue(en.target.__counter); io.unobserve(en.target); } });
      }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
      counters.forEach((c) => { const a = c.closest('.stat, .val-stat') || c; a.__counter = c; io.observe(a); });
    }
    setTimeout(() => { counters.forEach((c) => { if (!c.__done) animateValue(c); }); }, 2600);
  }

})();
