// Shared test setup: every test fails on console errors, page errors or CSP violations.
const base = require('@playwright/test');

const test = base.test.extend({
  // Console messages a test expects (e.g. the browser logging a deliberate 404 or 429)
  allowedConsole: [null, { option: true }],
  page: async ({ page, allowedConsole }, use) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !(allowedConsole && allowedConsole.test(m.text()))) problems.push(`console: ${m.text()}`);
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
    });
    await use(page);
    base.expect(problems, 'no console errors / CSP violations').toEqual([]);
  },
});

/** Serve a config.js that points the form at the local mock API. */
async function useMockApi(page, extra = {}) {
  const cfg = { apiUrl: 'http://localhost:54329/kontakt', turnstileSiteKey: '', contactEmail: 'info@vana-management.com', ...extra };
  await page.route('**/assets/js/config.js', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: `window.VANA_CONFIG = ${JSON.stringify(cfg)};` }));
}

/** Scroll instantly (smooth scrolling would make positions flaky). */
async function scrollToY(page, y) {
  await page.evaluate((y) => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, y);
  }, y);
  await page.waitForTimeout(150);
}

module.exports = { test, expect: base.expect, useMockApi, scrollToY };
