// ============================================================================
// PENDULUM LAB — premium landing interactions
// No live simulation. This drives the "expensive" feel: a cursor-following
// spotlight, layered mouse parallax + 3D tilt, magnetic buttons, a scroll
// progress bar, a backdrop scrim, and cinematic GSAP scroll choreography.
// ============================================================================
(function () {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---- Shared evidence summary --------------------------------------------
  function applyEvidence(summary) {
    if (!summary || !summary.tests) return;
    const tests = summary.tests;
    const validation = summary.validation || {};
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
    setText('validation.scipyAgreement', sci.display);
    setText('validation.periodDoubling', typeof pd.computed === 'number' ? pd.computed.toFixed(4) : undefined);
    setText('ledger.verify', `CSP-safe lint → strict typecheck → module-size ratchet → ${tests.total} unit tests → result-count guard → evidence summary → docs sync`);
    setCount('tests.passed', tests.passed);
    setCount('validation.periodDoublingComputed', pd.computed);

    const meta = document.querySelector('meta[name="description"]');
    if (meta && typeof tests.total === 'number') {
      const content = meta.getAttribute('content') || '';
      meta.setAttribute('content', content.replace(/\d+ unit tests/, `${tests.total} unit tests`));
    }
  }

  fetch('assets/evidence-summary.json', { cache: 'no-store' })
    .then((response) => response.ok ? response.json() : null)
    .then(applyEvidence)
    .catch(() => {});

  // ---- NAV state, scrim, scroll progress ----------------------------------
  const nav = $('.nav');
  const scrim = $('.hero-scrim');
  const progress = $('.scroll-progress');
  function onScroll() {
    const sy = window.scrollY;
    nav.classList.toggle('scrolled', sy > 40);
    if (scrim) scrim.style.opacity = Math.min(0.88, sy / (window.innerHeight * 0.9) * 0.88).toFixed(3);
    if (progress) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (max > 0 ? (sy / max) * 100 : 0).toFixed(2) + '%';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- Mouse engine: spotlight + layered parallax + tilt ------------------
  const glow = $('.cursor-glow');
  const parallaxEls = $$('[data-mouse]').map((el) => ({ el, depth: parseFloat(el.dataset.mouse) || 12 }));
  const tiltEls = $$('[data-tilt]');
  const pointer = { tx: 0, ty: 0, x: 0, y: 0 };   // normalised -0.5..0.5
  const spot = { tx: window.innerWidth / 2, ty: window.innerHeight / 2, x: window.innerWidth / 2, y: window.innerHeight / 2 };

  if (fine && !reduced) {
    document.body.classList.add('cursor-active');
    window.addEventListener('pointermove', (e) => {
      pointer.tx = e.clientX / window.innerWidth - 0.5;
      pointer.ty = e.clientY / window.innerHeight - 0.5;
      spot.tx = e.clientX; spot.ty = e.clientY;
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

    (function tick() {
      requestAnimationFrame(tick);
      pointer.x += (pointer.tx - pointer.x) * 0.08;
      pointer.y += (pointer.ty - pointer.y) * 0.08;
      for (const p of parallaxEls) {
        p.el.style.transform = `translate3d(${-pointer.x * p.depth}px, ${-pointer.y * p.depth}px, 0)`;
      }
      spot.x += (spot.tx - spot.x) * 0.12;
      spot.y += (spot.ty - spot.y) * 0.12;
      if (glow) glow.style.transform = `translate3d(${spot.x}px, ${spot.y}px, 0)`;
    })();
  }

  // ---- GSAP cinematic scroll ----------------------------------------------
  if (window.gsap && window.ScrollTrigger && !reduced) {
    gsap.registerPlugin(ScrollTrigger);

    // hero dissolves as you descend — cinematic exit
    gsap.to('.hero .wrap', {
      yPercent: -12, opacity: 0, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });

    $$('.reveal').forEach((el) => {
      gsap.fromTo(el, { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, duration: 1, ease: 'power3.out',
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

    // staggered card grids
    $$('[data-stagger]').forEach((group) => {
      gsap.fromTo(group.children, { opacity: 0, y: 48, scale: .95 }, {
        opacity: 1, y: 0, scale: 1, duration: .9, ease: 'power3.out', stagger: .09,
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
    $$('.reveal, [data-wipe], [data-rise]').forEach((el) => { el.style.opacity = 1; el.style.clipPath = 'none'; el.style.transform = 'none'; });
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
  if (reduced) {
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
