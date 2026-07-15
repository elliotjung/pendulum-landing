// ============================================================================
// PENDULUM LAB — premium landing interactions
// No live simulation. This drives the "expensive" feel: a cursor-following
// spotlight, layered mouse parallax + 3D tilt, magnetic buttons, a scroll
// progress bar, a backdrop scrim, and cinematic GSAP scroll choreography.
// ============================================================================
(function () {
  'use strict';
  document.documentElement.classList.add('js-ready');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const compactViewport = window.matchMedia('(max-width: 720px)').matches;
  const reducedEffects = reduced || compactViewport;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const captureMode = new URLSearchParams(window.location.search).has('captureHero') || window.__PENDULUM_CAPTURE_HERO === true;
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
      if (!koreanPage && title) title.textContent = String(highlight.title || 'Release update');
      if (!koreanPage && description) description.textContent = String(highlight.summary || 'See the full changelog for details.');
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
  const reducedData = (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-data: reduce)').matches)
    || navigator.connection?.saveData === true;
  const lowMemory = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 2;
  let heroSceneRequested = false;
  function requestHeroScene() {
    if (heroSceneRequested) return;
    heroSceneRequested = true;
    if (!captureHero && (reducedEffects || reducedData || lowMemory)) {
      document.body.classList.add(reduced ? 'reduced-motion-hero' : 'low-power-hero');
      window.__heroPainted = true;
      return;
    }
    import(sceneUrl).catch(() => {
      document.body.classList.add('no-webgl');
      window.__heroPainted = true;
    });
  }
  if (captureHero) {
    requestHeroScene();
  } else {
    const intentOptions = { once: true, passive: true };
    const hero = document.querySelector('.hero');
    hero?.addEventListener('pointermove', requestHeroScene, intentOptions);
    hero?.addEventListener('pointerdown', requestHeroScene, intentOptions);
    hero?.addEventListener('touchstart', requestHeroScene, intentOptions);
    window.addEventListener('scroll', requestHeroScene, intentOptions);
    window.addEventListener('keydown', requestHeroScene, { once: true });
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(requestHeroScene, { timeout: 1200 });
    } else {
      window.setTimeout(requestHeroScene, 450);
    }
  }

  // ---- NAV state, scrim, scroll progress ----------------------------------
  const nav = $('.nav');
  const scrim = $('.hero-scrim');
  const progress = $('.scroll-progress');
  function onScroll() {
    const sy = window.scrollY;
    nav.classList.toggle('scrolled', sy > 40);
    if (scrim) scrim.style.opacity = Math.min(0.92, sy / (window.innerHeight * 0.9) * 0.92).toFixed(3);
    if (progress) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (max > 0 ? (sy / max) * 100 : 0).toFixed(2) + '%';
    }
  }
  let scrollFrame = 0;
  function scheduleScroll() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      onScroll();
    });
  }
  window.addEventListener('scroll', scheduleScroll, { passive: true });
  onScroll();

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
      if (event.key === 'Escape') navMenu.open = false;
    });
  }

  // ---- Scrollspy: mark the nav link whose section owns the viewport --------
  const spyLinks = $$('.nav-links a[href^="#"]');
  if (spyLinks.length && 'IntersectionObserver' in window) {
    const setCurrent = (id) => spyLinks.forEach((a) => {
      if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    const spy = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setCurrent(visible.target.id);
    }, { rootMargin: '-38% 0px -52% 0px', threshold: [0, 0.25, 0.5] });
    spyLinks.forEach((a) => {
      const section = document.getElementById(a.getAttribute('href').slice(1));
      if (section) spy.observe(section);
    });
  }

  // ---- Mouse engine: spotlight + layered parallax + tilt ------------------
  const glow = $('.cursor-glow');
  const parallaxEls = $$('[data-mouse]').map((el) => ({ el, depth: parseFloat(el.dataset.mouse) || 12 }));
  const tiltEls = $$('[data-tilt]');
  const pointer = { tx: 0, ty: 0, x: 0, y: 0 };   // normalised -0.5..0.5
  const spot = { tx: window.innerWidth / 2, ty: window.innerHeight / 2, x: window.innerWidth / 2, y: window.innerHeight / 2 };

  if (fine && !reducedEffects && !captureMode) {
    document.body.classList.add('cursor-active');
    window.addEventListener('pointermove', (e) => {
      pointer.tx = e.clientX / window.innerWidth - 0.5;
      pointer.ty = e.clientY / window.innerHeight - 0.5;
      spot.tx = e.clientX; spot.ty = e.clientY;
      schedulePointerLoop();
    }, { passive: true });

    // per-card 3D tilt
    tiltEls.forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `rotateY(${px * 10}deg) rotateX(${-py * 10}deg) translateZ(8px)`;
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });

    // magnetic buttons
    $$('.btn').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const mx = (e.clientX - r.left - r.width / 2) * 0.3;
        const my = (e.clientY - r.top - r.height / 2) * 0.4;
        btn.style.transform = `translate(${mx}px, ${my - 2}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });

    let pointerRaf = 0;
    function tick() {
      pointerRaf = 0;
      if (document.hidden) return;
      pointer.x += (pointer.tx - pointer.x) * 0.08;
      pointer.y += (pointer.ty - pointer.y) * 0.08;
      for (const p of parallaxEls) {
        p.el.style.transform = `translate3d(${-pointer.x * p.depth}px, ${-pointer.y * p.depth}px, 0)`;
      }
      spot.x += (spot.tx - spot.x) * 0.12;
      spot.y += (spot.ty - spot.y) * 0.12;
      if (glow) glow.style.transform = `translate3d(${spot.x}px, ${spot.y}px, 0)`;
      const moving = Math.abs(pointer.tx - pointer.x) + Math.abs(pointer.ty - pointer.y)
        + Math.abs(spot.tx - spot.x) / 100 + Math.abs(spot.ty - spot.y) / 100;
      if (moving > 0.005) pointerRaf = requestAnimationFrame(tick);
    }
    function schedulePointerLoop() {
      if (!document.hidden && !pointerRaf) pointerRaf = requestAnimationFrame(tick);
    }
    function syncPointerLoop() {
      if (document.hidden) {
        if (pointerRaf) cancelAnimationFrame(pointerRaf);
        pointerRaf = 0;
      } else schedulePointerLoop();
    }
    document.addEventListener('visibilitychange', syncPointerLoop);
    syncPointerLoop();
  }

  // ---- GSAP cinematic scroll ----------------------------------------------
  if (window.gsap && window.ScrollTrigger && !reducedEffects && !captureMode) {
    gsap.registerPlugin(ScrollTrigger);

    // Keep above-the-fold copy paintable immediately for LCP. GSAP owns only
    // scroll-driven motion; the hero text never starts hidden or blurred.

    // hero dissolves as you descend — cinematic exit
    gsap.to('.hero .wrap', {
      yPercent: -12, opacity: 0, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });

    // section headers light their sweep-rule as they arrive
    $$('.sec-head').forEach((el) => {
      ScrollTrigger.create({ trigger: el, start: 'top 82%', once: true, onEnter: () => el.classList.add('lit') });
    });

    $$('.reveal').forEach((el) => {
      gsap.fromTo(el, { opacity: 0, y: 40, filter: 'blur(12px)' }, {
        opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 86%', once: true },
      });
    });

    // clip-wipe reveals (boards / big blocks)
    $$('[data-wipe]').forEach((el) => {
      gsap.fromTo(el, { opacity: 0, clipPath: 'inset(0 0 100% 0)', y: 48 }, {
        opacity: 1, clipPath: 'inset(0 0 0% 0)', y: 0, duration: 1.15, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      });
    });

    // headings rise + scale in
    $$('[data-rise]').forEach((el) => {
      gsap.fromTo(el, { opacity: 0, y: 60, scale: .96 }, {
        opacity: 1, y: 0, scale: 1, duration: 1.1, ease: 'power4.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });

    // staggered card grids materialize with a focus-in blur
    $$('[data-stagger]').forEach((group) => {
      gsap.fromTo(group.children, { opacity: 0, y: 48, scale: .95, filter: 'blur(10px)' }, {
        opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: .9, ease: 'power3.out', stagger: .09,
        scrollTrigger: { trigger: group, start: 'top 82%', once: true },
      });
    });

    // scrubbed parallax + heading drift
    $$('[data-parallax]').forEach((el) => {
      const depth = parseFloat(el.dataset.parallax) || 0.2;
      gsap.to(el, { yPercent: -depth * 100, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    $$('[data-drift]').forEach((el) => {
      gsap.fromTo(el, { yPercent: 16 }, { yPercent: -16, ease: 'none',
        scrollTrigger: { trigger: el.closest('section') || el, start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    // scrubbed draw-on for the divergence diagram
    $$('.draw-path').forEach((path) => {
      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      gsap.to(path, { strokeDashoffset: 0, ease: 'none',
        scrollTrigger: { trigger: path.closest('.diverge-stage'), start: 'top 80%', end: 'bottom 55%', scrub: 0.6 } });
    });
  } else {
    $$('.reveal, [data-wipe], [data-rise]').forEach((el) => { el.style.opacity = 1; el.style.clipPath = 'none'; el.style.transform = 'none'; el.style.filter = 'none'; });
    $$('.sec-head').forEach((el) => el.classList.add('lit'));
    $$('.draw-path').forEach((p) => { p.style.strokeDasharray = 'none'; p.style.strokeDashoffset = 0; });
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

  // ---- capability card cursor glow ----------------------------------------
  $$('.cap-card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
    });
  });
})();
