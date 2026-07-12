import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

/**
 * Generate ko.html — the statically translated Korean landing page.
 *
 * Why static: applying the ~150-entry dictionary at runtime forces a full
 * style/relayout of this filter/blur-heavy page inside the mobile startup
 * window (~300-700 ms of Lighthouse TBT for ko-locale visitors, measured).
 * Translating at build time gives Korean visitors a plain static page with
 * identical performance to the English one, plus indexable Korean content
 * and hreflang alternates.
 *
 * Mechanics: index.html is parsed with DOMParser inside a headless page
 * (DOMParser documents never execute scripts, so main.js/three.js stay
 * inert), the shared dictionary module (assets/i18n-core.js — not loaded by
 * the site at runtime) applies the translation, and page-specific rewiring
 * follows: toggle anchor, language-boot script, canonical/og:url, CSP hash
 * for the swapped boot script.
 *
 * Run: npm run build:ko   (CI re-runs it and fails on ko.html drift)
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// ko.html's boot script only persists the Korean choice (no redirect):
// visiting it explicitly via ?lang=ko is a choice; a bare deep link only
// sets the preference when none exists yet.
const KO_BOOT =
  '(function(){try{var q=new URLSearchParams(location.search);if(q.get("lang")==="ko"||!localStorage.getItem("pendulum-landing/lang"))localStorage.setItem("pendulum-landing/lang","ko")}catch(e){}})();';

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('base64');

const html = await readFile(join(root, 'index.html'), 'utf8');
const enBoot = html.match(/<script id="lang-boot">([\s\S]*?)<\/script>/)?.[1];
if (!enBoot) {
  console.error('build-ko-page: index.html has no <script id="lang-boot"> block');
  process.exit(1);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const coreSource = await readFile(join(root, 'assets', 'i18n-core.js'), 'utf8');
  await page.addScriptTag({ content: coreSource });
  const ko = await page.evaluate(
    ({ raw, koBoot, enHash, koHash }) => {
      const doc = new DOMParser().parseFromString(raw, 'text/html');
      window.__pendulumI18nCore.applyKorean(doc);

      // Toggle points back to English; the label names the target language.
      const toggle = doc.getElementById('lang-toggle');
      if (toggle) {
        toggle.textContent = 'English';
        toggle.setAttribute('href', 'index.html?lang=en');
        toggle.setAttribute('hreflang', 'en');
        toggle.setAttribute('aria-label', 'Switch to English');
      }

      // Swap the boot script (persist-only on the Korean page) and its CSP hash.
      const boot = doc.getElementById('lang-boot');
      if (boot) boot.textContent = koBoot;
      const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
      if (csp) csp.setAttribute('content', csp.getAttribute('content').replace(enHash, koHash));

      // This page's own canonical identity.
      const koUrl = 'https://elliotjung.github.io/pendulum-landing/ko.html';
      const canonical = doc.querySelector('link[rel="canonical"]');
      if (canonical) canonical.setAttribute('href', koUrl);
      const ogUrl = doc.querySelector('meta[property="og:url"]');
      if (ogUrl) ogUrl.setAttribute('content', koUrl);

      return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML + '\n';
    },
    { raw: html, koBoot: KO_BOOT, enHash: `'sha256-${sha256(enBoot)}'`, koHash: `'sha256-${sha256(KO_BOOT)}'` }
  );
  await writeFile(join(root, 'ko.html'), ko, 'utf8');
  console.log(`ko.html written (${(ko.length / 1024).toFixed(0)} KB)`);
} finally {
  await browser.close();
}
