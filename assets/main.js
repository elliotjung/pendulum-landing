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
  $$('a[data-app-link]').forEach((anchor, index) => {
    try {
      const url = new URL(anchor.href);
      url.searchParams.set('utm_source', 'pendulum-landing');
      url.searchParams.set('utm_medium', 'referral');
      url.searchParams.set('utm_campaign', 'research-lab');
      url.searchParams.set('utm_content', anchor.dataset.utmContent || `cta-${index + 1}`);
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

  // ---- Shared evidence summary --------------------------------------------
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
      && Number.isInteger(tests?.passed) && tests.passed === tests.total
      && tests?.failed === 0 && tests?.success === true
      && /^[a-f0-9]{40}$/i.test(String(provenance?.sourceCommit || ''))
      && Number.isFinite(Date.parse(String(provenance?.expiresAt || '')))
      && typeof validation?.scipyAgreement?.display === 'string'
      && Number.isFinite(validation?.periodDoubling?.computed)
      && Number.isFinite(mutation?.score)
      && Number.isInteger(energy?.profiledMethods) && energy.profiledMethods > 0
      && typeof energy?.bestMethod === 'string' && Number.isFinite(energy?.bestMaxRelativeDrift)
      && Number.isInteger(gpu?.passedVendors) && Number.isInteger(gpu?.requiredVendors)
      && typeof publication?.status === 'string';
  }

  function markEvidenceState(kind, expiresAt) {
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
      status.textContent = koreanPage ? `검증 근거 최신 · ${date}까지 유효` : `Evidence current · valid through ${date}`;
    }
  }

  function applyEvidence(summary) {
    if (!evidenceIsUsable(summary)) {
      markEvidenceState('invalid');
      return;
    }
    const expiresAt = Date.parse(summary.provenance.expiresAt);
    if (Date.now() > expiresAt) {
      markEvidenceState('stale', expiresAt);
      return;
    }
    markEvidenceState('current', expiresAt);
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

    setText('tests.passLabel', tests.passLabel || `${tests.passed} / ${tests.total} pass`);
    setText('tests.greenLabel', `${tests.passed} green`);
    setText('tests.formatted', Number(tests.total).toLocaleString('en-US'));
    setText('validation.scipyAgreement', sci.display);
    setText('validation.periodDoublingDisplay', pd.display);
    setText('validation.periodDoubling', typeof pd.computed === 'number' ? pd.computed.toFixed(4) : undefined);
    if (typeof mutation.score === 'number') {
      const shards = typeof mutation.reportCount === 'number' ? mutation.reportCount : 0;
      const band = typeof mutation.status === 'string' ? mutation.status : 'unrated';
      const bandLabel = koreanPage ? (band === 'low' ? '낮음' : band) : `${band} band`;
      setText('mutation.scoreLabel', koreanPage
        ? `${mutation.score.toFixed(2)}% · ${bandLabel} 등급 · ${shards}개 샤드`
        : `${mutation.score.toFixed(2)}% · ${bandLabel} · ${shards} shards`);
      setText('mutation.detailLabel', koreanPage
        ? `${mutation.score.toFixed(2)}% 전체 · ${Number(mutation.coveredScore || 0).toFixed(2)}% 커버됨 · ${bandLabel} 등급 · ${shards}개 샤드`
        : `${mutation.score.toFixed(2)}% total · ${Number(mutation.coveredScore || 0).toFixed(2)}% covered · ${bandLabel} · ${shards} shards`);
    }
    if (typeof energy.profiledMethods === 'number') {
      setText('energy.profileLabel', koreanPage ? `${energy.profiledMethods}개 방법 프로파일링` : `${energy.profiledMethods} methods profiled`);
    }
    setText('energy.bestMethod', energy.bestMethod);
    if (typeof energy.bestMaxRelativeDrift === 'number' && Number.isFinite(energy.bestMaxRelativeDrift)) {
      setText('energy.bestDrift', koreanPage
        ? `${energy.bestMaxRelativeDrift.toExponential(3)} 최대 상대 드리프트`
        : `${energy.bestMaxRelativeDrift.toExponential(3)} max relative drift`);
    }
    if (typeof gpu.passedVendors === 'number' && typeof gpu.requiredVendors === 'number') {
      setText('gpu.vendorLabel', koreanPage
        ? `${gpu.passedVendors} / ${gpu.requiredVendors} 공급업체`
        : `${gpu.passedVendors} / ${gpu.requiredVendors} vendors`);
    }
    if (Array.isArray(gpu.missingVendors) && gpu.missingVendors.length) {
      const missing = gpu.missingVendors.map((vendor) => String(vendor).toUpperCase()).join(' + ');
      setText('gpu.missingLabel', koreanPage ? `${missing} 대기 중` : `${missing} pending`);
    }
    setText('publication.statusLabel', koreanPage && publication.status === 'partial' ? '부분 완료' : publication.status);
    setText('publication.availableLabel', publication.githubReleaseUrl && publication.pagesUrl
      ? koreanPage ? 'GitHub 릴리스 + Pages 공개' : 'GitHub release + Pages live'
      : koreanPage ? '공개 산출물 미완료' : 'Public artifacts incomplete');
    const missingPublication = [];
    if (publication.npmPublished === false) missingPublication.push('npm');
    if (publication.zenodoPublished === false) missingPublication.push('Zenodo');
    if (missingPublication.length) setText('publication.missingLabel', koreanPage
      ? `${missingPublication.join(' + ')} 대기 중`
      : `${missingPublication.join(' + ')} pending`);
    setText('ledger.verify', koreanPage
      ? `CSP 안전 린트 → 엄격 타입 검사 → 모듈 크기 래칫 → ${tests.total}개 단위 테스트 → 결과 수 가드 → 문서 동기화 → 포맷 게이트`
      : `CSP-safe lint → strict typecheck → module-size ratchet → ${tests.total} unit tests → result-count guard → docs sync → format gate`);
    setCount('tests.passed', tests.passed);
    setCount('validation.periodDoublingComputed', pd.computed);

    const meta = document.querySelector('meta[name="description"]');
    if (meta && typeof tests.total === 'number') {
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

  // ---- Small-screen menu: close after navigating (works without JS too) ----
  const navMenu = $('#nav-menu');
  if (navMenu) {
    navMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => { navMenu.open = false; });
    });
    document.addEventListener('click', (event) => {
      if (navMenu.open && event.target instanceof Node && !navMenu.contains(event.target)) navMenu.open = false;
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && navMenu.open) {
        navMenu.open = false;
        navMenu.querySelector('summary')?.focus();
      }
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
