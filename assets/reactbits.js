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

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  // 2) DECRYPTED TEXT — scramble a heading into place when it scrolls in
  // ==========================================================================
  const SCRAMBLE = '!<>-_\\/[]{}—=+*^?#01λθφΔΣ';
  function scrambleReveal(el) {
    if (el.__decrypted) return;
    el.__decrypted = true;
    const text = el.dataset.decryptText || el.textContent;
    el.dataset.decryptText = text;
    if (reduced) { el.textContent = text; return; }

    const revealed = new Set();
    const total = text.length;
    const speed = Number(el.dataset.decryptSpeed) || 34;
    const perTick = Math.max(1, Math.round(total / 22)); // finish in ~22 ticks
    let frame = 0;

    const timer = setInterval(() => {
      frame++;
      // reveal a few more characters each tick, left→right
      for (let k = 0; k < perTick; k++) revealed.add(revealed.size);
      let out = '';
      for (let i = 0; i < total; i++) {
        const c = text[i];
        if (c === ' ' || revealed.has(i)) out += c;
        else out += SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
      }
      el.textContent = out;
      if (revealed.size >= total) { clearInterval(timer); el.textContent = text; }
    }, speed);
  }

  function initDecrypt() {
    const targets = $$('[data-decrypt]');
    if (!targets.length) return;
    if (!('IntersectionObserver' in window) || reduced) {
      targets.forEach((el) => { el.textContent = el.dataset.decryptText || el.textContent; });
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { scrambleReveal(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.25, rootMargin: '0px 0px -8% 0px' });
    targets.forEach((el) => io.observe(el));
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
