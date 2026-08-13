// Defer the interactive trajectory instrument until it approaches the viewport.
// The page, hero poster, evidence, and navigation remain complete without it.
(function () {
  'use strict';

  const query = new URLSearchParams(window.location.search);
  const queryFlag = (name) => /^(?:1|true|yes)$/i.test(query.get(name) || '');
  const captureMode = queryFlag('captureHero') || window.__PENDULUM_CAPTURE_HERO === true;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const consoleSection = document.getElementById('console');
  const consoleCanvas = document.getElementById('orbit-console');

  let orbitPromise = null;
  let orbitReady = false;
  let orbitReplayScheduled = false;
  let orbitUnavailable = false;
  const MAX_PENDING_ORBIT_BUTTONS = 32;
  const pendingOrbitButtons = [];
  const pendingOrbitInputs = new Set();

  function syncOrbitMotionControl() {
    if (document.body.classList.contains('orbit-console-static')) return;
    const toggle = consoleSection?.querySelector('[data-orbit-toggle]');
    if (!(toggle instanceof HTMLButtonElement)) return;
    const motionReduced = captureMode || motionQuery.matches;
    toggle.disabled = motionReduced;
    toggle.textContent = motionReduced
      ? (document.documentElement.lang === 'ko' ? '동작 줄임' : 'Motion reduced')
      : (document.documentElement.lang === 'ko' ? '움직임 일시정지' : 'Pause motion');
  }

  function markOrbitUnavailable() {
    orbitUnavailable = true;
    orbitReplayScheduled = false;
    pendingOrbitInputs.clear();
    pendingOrbitButtons.length = 0;
    document.body.classList.remove('orbit-console-loading', 'orbit-console-ready');
    document.body.classList.add('orbit-console-static');
    consoleSection?.setAttribute('data-orbit-state', 'unavailable');
    const controls = consoleSection?.querySelector('.orbit-controls');
    if (controls instanceof HTMLElement) {
      controls.hidden = true;
      controls.querySelectorAll('input, button').forEach((control) => {
        control.disabled = true;
        control.setAttribute('aria-disabled', 'true');
      });
    }
    if (consoleCanvas instanceof HTMLCanvasElement) {
      consoleCanvas.hidden = true;
      consoleCanvas.setAttribute('aria-hidden', 'true');
    }
    const figure = consoleCanvas?.closest('figure');
    if (figure && !figure.querySelector('.orbit-static-fallback')) {
      const fallback = document.createElement('div');
      fallback.className = 'orbit-static-fallback';
      fallback.setAttribute('role', 'img');
      fallback.setAttribute('aria-label', document.documentElement.lang === 'ko'
        ? '실시간 궤적을 사용할 수 없어 정적인 이중 진자 궤적을 표시합니다.'
        : 'Live trajectory unavailable; showing a static double-pendulum trace.');
      fallback.innerHTML = '<span aria-hidden="true">θ₁ / θ₂</span><strong></strong><small></small>';
      fallback.querySelector('strong').textContent = document.documentElement.lang === 'ko'
        ? '정적 궤적 모드'
        : 'Static trajectory mode';
      fallback.querySelector('small').textContent = document.documentElement.lang === 'ko'
        ? '전체 실험실 링크와 검증 자료는 계속 사용할 수 있습니다.'
        : 'The full lab and validation evidence remain available.';
      figure.prepend(fallback);
    }
    const mode = document.querySelector('[data-orbit-readout="mode"]');
    if (mode) mode.textContent = document.documentElement.lang === 'ko' ? '사용 불가' : 'unavailable';
  }

  function loadOrbitConsole() {
    if (orbitUnavailable) return Promise.resolve(false);
    if (orbitPromise) return orbitPromise;
    document.body.classList.add('orbit-console-loading');
    orbitPromise = import('./orbit-console.js')
      .then(() => {
        if (orbitUnavailable) return false;
        orbitReady = true;
        document.body.classList.remove('orbit-console-loading');
        document.body.classList.add('orbit-console-ready');
        return true;
      })
      .catch(() => {
        markOrbitUnavailable();
        return false;
      });
    return orbitPromise;
  }

  function scheduleOrbitReplay() {
    if (orbitReplayScheduled || orbitUnavailable) return;
    orbitReplayScheduled = true;
    void loadOrbitConsole().then((ready) => {
      orbitReplayScheduled = false;
      if (!ready) return;
      const inputs = [...pendingOrbitInputs];
      const buttons = pendingOrbitButtons.splice(0);
      pendingOrbitInputs.clear();
      inputs.forEach((input) => {
        if (input.isConnected) input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      buttons.forEach((action) => {
        const selector = action === 'reset' ? '[data-orbit-reset]' : '[data-orbit-toggle]';
        const button = consoleSection?.querySelector(selector);
        if (button instanceof HTMLButtonElement && button.isConnected) button.click();
      });
    });
  }

  if (captureMode) {
    void loadOrbitConsole();
  } else if (consoleCanvas && consoleSection) {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void loadOrbitConsole();
      }, { rootMargin: '640px 0px' });
      observer.observe(consoleSection);
    } else {
      consoleSection.addEventListener('focusin', loadOrbitConsole, { once: true });
    }

    for (const type of ['pointerdown', 'focusin']) {
      consoleSection.addEventListener(type, loadOrbitConsole, {
        capture: true,
        passive: type !== 'focusin'
      });
    }
    consoleSection.addEventListener('input', (event) => {
      if (orbitReady || !(event.target instanceof HTMLInputElement)) return;
      pendingOrbitInputs.add(event.target);
      scheduleOrbitReplay();
    }, true);
    consoleSection.addEventListener('click', (event) => {
      const target = event.target instanceof Element
        ? event.target.closest('[data-orbit-reset], [data-orbit-toggle]')
        : null;
      if (!(target instanceof HTMLButtonElement) || orbitReady) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (pendingOrbitButtons.length >= MAX_PENDING_ORBIT_BUTTONS) {
        markOrbitUnavailable();
        return;
      }
      pendingOrbitButtons.push(target.hasAttribute('data-orbit-reset') ? 'reset' : 'toggle');
      scheduleOrbitReplay();
    }, true);
  }

  motionQuery.addEventListener?.('change', syncOrbitMotionControl);
  window.__landingEnhancements = {
    loadOrbitConsole,
    get orbitReady() { return orbitReady; }
  };
  syncOrbitMotionControl();
})();
