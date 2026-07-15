// ============================================================================
// PENDULUM LAB — React Bits effects, ported to framework-free vanilla JS.
// Adapted from React Bits (MIT): MagicBento (spotlight + particles + border
// glow + tilt + magnetism + click ripple), TextType (typewriter rotation), and
// DecryptedText (scramble-on-view). Re-skinned to the site's cyan/violet DNA.
// Uses the already-loaded global GSAP; degrades gracefully without it and under
// reduced-motion / coarse-pointer devices.
// ============================================================================
(function () {
  'use strict';

  const captureMode = new URLSearchParams(window.location.search).has('captureHero') || window.__PENDULUM_CAPTURE_HERO === true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || window.matchMedia('(max-width: 720px)').matches
    || navigator.connection?.saveData === true
    || captureMode;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGsap = typeof window.gsap !== 'undefined';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const CYAN = '24, 212, 248';
  const VIOLET = '157, 120, 255';

  // ==========================================================================
  // 1) TEXT TYPE — rotating typewriter line
  // ==========================================================================
  function initTextType() {
    $$('[data-typetext]').forEach((el) => {
      let phrases;
      try { phrases = JSON.parse(el.dataset.phrases || '[]'); }
      catch { phrases = []; }
      if (!phrases.length) return;

      const content = document.createElement('span');
      content.className = 'tt-content';
      const cursor = document.createElement('span');
      cursor.className = 'tt-cursor';
      cursor.textContent = el.dataset.cursor || '▍';
      el.textContent = '';
      el.append(content, cursor);

      if (reduced) { content.textContent = phrases[0]; return; }

      const typeSpeed = Number(el.dataset.typeSpeed) || 46;
      const deleteSpeed = Number(el.dataset.deleteSpeed) || 26;
      const pause = Number(el.dataset.pause) || 1600;
      let idx = 0, char = 0, deleting = false;

      function step() {
        const word = phrases[idx];
        if (!deleting) {
          char++;
          content.textContent = word.slice(0, char);
          if (char === word.length) { deleting = true; return setTimeout(step, pause); }
          setTimeout(step, typeSpeed + Math.random() * 40);
        } else {
          char--;
          content.textContent = word.slice(0, char);
          if (char === 0) { deleting = false; idx = (idx + 1) % phrases.length; return setTimeout(step, 360); }
          setTimeout(step, deleteSpeed);
        }
      }
      setTimeout(step, Number(el.dataset.initialDelay) || 700);
    });
  }

  // ==========================================================================
  // 2) DECRYPTED TEXT — structure-preserving scramble reveal.
  //    When a heading or short label scrolls in, every text node inside it is
  //    scrambled independently and then resolved left→right. Because we only
  //    rewrite text-node values (never innerHTML), gradient spans, <br> line
  //    breaks and inline <em> all survive. Every active reveal shares ONE
  //    requestAnimationFrame ticker, so the whole page decodes smoothly.
  // ==========================================================================
  const SCRAMBLE = '!<>-_\\/[]{}—=+*^?#01λθφΔΣπ§%';
  const randGlyph = () => SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
  const isSpace = (ch) => ch === ' ' || ch === '\n' || ch === '\t' || ch === ' ';

  // Never scramble text owned by another script: injected evidence numbers,
  // the count-up telemetry, or the rotating typewriter line.
  const DECRYPT_SKIP = '[data-count],[data-evidence],[data-evidence-count],[data-typetext],[data-no-decrypt]';

  function collectTextNodes(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (parent && parent.closest(DECRYPT_SKIP)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push({ node: n, base: n.nodeValue });
    return nodes;
  }

  const scrambleJobs = [];
  let scrambleTicking = false;

  function renderScramble(job, revealChars) {
    let pos = 0;
    for (const item of job.nodes) {
      const base = item.base;
      let out = '';
      for (let i = 0; i < base.length; i++) {
        const ch = base[i];
        if (isSpace(ch)) { out += ch; pos++; continue; }
        out += pos < revealChars ? ch : randGlyph();
        pos++;
      }
      item.node.nodeValue = out;
    }
  }

  function finishScramble(job) {
    const index = scrambleJobs.indexOf(job);
    if (index === -1) return;
    clearTimeout(job.deadline);
    for (const item of job.nodes) item.node.nodeValue = item.base; // exact restore
    job.el.classList.remove('is-decrypting');
    job.el.classList.add('is-decrypted');
    scrambleJobs.splice(index, 1);
  }

  function tickScramble(now) {
    for (let i = scrambleJobs.length - 1; i >= 0; i--) {
      const job = scrambleJobs[i];
      if (now < job.start) { continue; }              // held fully scrambled
      const t = Math.min(1, (now - job.start) / job.duration);
      renderScramble(job, Math.floor(job.total * t));
      if (t >= 1) finishScramble(job);
    }
    if (scrambleJobs.length) requestAnimationFrame(tickScramble);
    else scrambleTicking = false;
  }

  function startScramble(el, delay) {
    if (el.__decrypted) return;
    el.__decrypted = true;
    const accessibleText = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (accessibleText && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', accessibleText);
    const nodes = collectTextNodes(el);
    if (!nodes.length) return;
    let total = 0;
    for (const item of nodes) {
      for (let i = 0; i < item.base.length; i++) if (!isSpace(item.base[i])) total++;
    }
    if (!total) return;
    const job = {
      el, nodes, total,
      start: performance.now() + (delay || 0),
      duration: Math.min(1000, 340 + total * 11),
    };
    el.classList.add('is-decrypting');
    renderScramble(job, 0);                            // show ciphertext immediately
    scrambleJobs.push(job);
    // rAF can stall for seconds while the hero's WebGL shaders compile; a
    // wall-clock deadline guarantees the real copy is always restored.
    job.deadline = setTimeout(() => finishScramble(job), (delay || 0) + job.duration + 400);
    if (!scrambleTicking) { scrambleTicking = true; requestAnimationFrame(tickScramble); }
  }

  // Short, punchy text gets the full scramble treatment across the whole page.
  const SCRAMBLE_TARGETS = [
    '[data-decrypt]',
    '.hero-copy .kicker', '.hero-copy .display',
    '.sec-head .kicker', '.sec-head h2',
    '.console-copy .kicker', '.console-copy h2',
    '.preview-copy .kicker', '.preview-copy h2',
    '.science-grid .kicker', '.science-grid h2',
    '.cap-card h3', '.mode-card h3', '.frontier-card h3', '.step h3',
    '.mode-tag', '.recipe-card strong',
    '.launch .kicker', '.launch .display',
    '.val-stat .cap', '.val-board .vb-head > span', '.ledger .vb-head > span',
    '.diverge-tag span'
  ].join(',');

  function initDecrypt() {
    const targets = Array.from(new Set($$(SCRAMBLE_TARGETS)));
    if (!targets.length || reduced || !('IntersectionObserver' in window)) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        startScramble(en.target, 0);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -6% 0px' });

    // Elements already on screen at load (the hero) decode in a quick cascade
    // instead of all firing on the same frame.
    const vh = window.innerHeight;
    let boot = 0;
    targets.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) startScramble(el, (boot++) * 120);
      else io.observe(el);
    });
  }

  // ==========================================================================
  // 3) MAGIC BENTO — spotlight + particles + border glow + tilt + magnetism
  //    Enhances the existing capability & mode card grids in place.
  // ==========================================================================
  function makeParticle(x, y, color) {
    const el = document.createElement('span');
    el.className = 'mb-particle';
    el.style.cssText =
      `left:${x}px;top:${y}px;background:rgba(${color},1);box-shadow:0 0 7px rgba(${color},.7),0 0 12px rgba(${color},.35);`;
    return el;
  }

  function enhanceCard(card, color) {
    const particles = [];
    const timeouts = [];
    let hovered = false;
    let seed = null;

    function clearParticles() {
      timeouts.forEach(clearTimeout); timeouts.length = 0;
      particles.forEach((p) => {
        if (hasGsap) {
          gsap.to(p, { scale: 0, opacity: 0, duration: 0.3, ease: 'back.in(1.7)', onComplete: () => p.remove() });
        } else { p.remove(); }
      });
      particles.length = 0;
    }

    function spawn() {
      if (!hovered) return;
      if (!seed) {
        const { width, height } = card.getBoundingClientRect();
        seed = Array.from({ length: 11 }, () => [Math.random() * width, Math.random() * height]);
      }
      seed.forEach(([x, y], i) => {
        const t = setTimeout(() => {
          if (!hovered) return;
          const p = makeParticle(x, y, color);
          card.appendChild(p);
          particles.push(p);
          if (hasGsap) {
            gsap.fromTo(p, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' });
            gsap.to(p, { x: (Math.random() - 0.5) * 90, y: (Math.random() - 0.5) * 90, rotation: Math.random() * 360,
              duration: 2 + Math.random() * 2, ease: 'none', repeat: -1, yoyo: true });
            gsap.to(p, { opacity: 0.3, duration: 1.5, ease: 'power2.inOut', repeat: -1, yoyo: true });
          }
        }, i * 90);
        timeouts.push(t);
      });
    }

    card.addEventListener('pointerenter', () => { hovered = true; spawn(); });
    card.addEventListener('pointerleave', () => {
      hovered = false; clearParticles();
      if (hasGsap) gsap.to(card, { rotateX: 0, rotateY: 0, x: 0, y: 0, duration: 0.35, ease: 'power2.out' });
    });
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const cx = r.width / 2, cy = r.height / 2;
      if (hasGsap) {
        gsap.to(card, {
          rotateX: ((y - cy) / cy) * -6,
          rotateY: ((x - cx) / cx) * 6,
          x: (x - cx) * 0.04, y: (y - cy) * 0.04,
          duration: 0.25, ease: 'power2.out', transformPerspective: 900
        });
      }
    });
    card.addEventListener('click', (e) => {
      const r = card.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const maxD = Math.max(Math.hypot(x, y), Math.hypot(x - r.width, y),
        Math.hypot(x, y - r.height), Math.hypot(x - r.width, y - r.height));
      const ripple = document.createElement('span');
      ripple.className = 'mb-ripple';
      ripple.style.cssText =
        `width:${maxD * 2}px;height:${maxD * 2}px;left:${x - maxD}px;top:${y - maxD}px;` +
        `background:radial-gradient(circle,rgba(${color},.4) 0%,rgba(${color},.18) 30%,transparent 70%);`;
      card.appendChild(ripple);
      if (hasGsap) {
        gsap.fromTo(ripple, { scale: 0, opacity: 1 }, { scale: 1, opacity: 0, duration: 0.8, ease: 'power2.out', onComplete: () => ripple.remove() });
      } else { setTimeout(() => ripple.remove(), 600); }
    });
  }

  function initGlobalSpotlight(grid, color, radius) {
    const spotlight = document.createElement('div');
    spotlight.className = 'mb-spotlight';
    spotlight.style.background =
      `radial-gradient(circle, rgba(${color},.14) 0%, rgba(${color},.07) 18%, rgba(${color},.03) 35%, transparent 60%)`;
    document.body.appendChild(spotlight);
    const proximity = radius * 0.5, fade = radius * 0.75;

    function onMove(e) {
      const section = grid.getBoundingClientRect();
      const inside = e.clientX >= section.left - 40 && e.clientX <= section.right + 40 &&
        e.clientY >= section.top - 40 && e.clientY <= section.bottom + 40;
      const cards = $$('.mb-card', grid);
      if (!inside) {
        spotlight.style.opacity = '0';
        cards.forEach((c) => c.style.setProperty('--mb-glow', '0'));
        return;
      }
      let minDist = Infinity;
      cards.forEach((card) => {
        const r = card.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = Math.hypot(e.clientX - cx, e.clientY - cy) - Math.max(r.width, r.height) / 2;
        const eff = Math.max(0, d);
        minDist = Math.min(minDist, eff);
        let glow = 0;
        if (eff <= proximity) glow = 1;
        else if (eff <= fade) glow = (fade - eff) / (fade - proximity);
        card.style.setProperty('--mb-glow-x', `${((e.clientX - r.left) / r.width) * 100}%`);
        card.style.setProperty('--mb-glow-y', `${((e.clientY - r.top) / r.height) * 100}%`);
        card.style.setProperty('--mb-glow', glow.toFixed(3));
      });
      spotlight.style.left = e.clientX + 'px';
      spotlight.style.top = e.clientY + 'px';
      spotlight.style.opacity = minDist <= proximity ? '0.9'
        : minDist <= fade ? (((fade - minDist) / (fade - proximity)) * 0.9).toFixed(3) : '0';
    }
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', () => {
      spotlight.style.opacity = '0';
      $$('.mb-card', grid).forEach((c) => c.style.setProperty('--mb-glow', '0'));
    });
  }

  function initMagicBento() {
    if (!fine || reduced) return; // full effect is desktop / fine-pointer only
    // Grids to upgrade: capability cards and mode cards. (Frontier cards own
    // their own ::after top-line, so they are intentionally left untouched.)
    const grids = [
      { sel: '.cap-grid', card: '.cap-card', color: CYAN, radius: 340 },
      { sel: '.mode-grid', card: '.mode-card', color: VIOLET, radius: 320 }
    ];
    grids.forEach(({ sel, card, color, radius }) => {
      const grid = $(sel);
      if (!grid) return;
      const cards = $$(card, grid);
      if (!cards.length) return;
      cards.forEach((c) => {
        c.classList.add('mb-card');
        c.style.setProperty('--mb-color', color);
        enhanceCard(c, color);
      });
      initGlobalSpotlight(grid, color, radius);
    });
  }

  // ==========================================================================
  function boot() {
    initTextType();
    initDecrypt();
    initMagicBento();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
