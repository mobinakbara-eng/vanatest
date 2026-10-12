// Accessibility audit (WCAG 2.2 A/AA rules of axe-core) for every page, light and dark mode.
const { test, expect } = require('./fixtures');
const AxeBuilder = require('@axe-core/playwright').default;

for (const scheme of ['light', 'dark']) {
  for (const path of ['/', '/impressum.html', '/datenschutz.html']) {
    test(`axe ${path} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto(path);
      await page.waitForTimeout(500);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const summary = results.violations.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`);
      expect(summary).toEqual([]);
    });
  }
}
