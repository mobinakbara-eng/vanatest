// Layout checks on phones, tablets, laptops and large screens.
const { test, expect, scrollToY } = require('./fixtures');

const VIEWPORTS = [
  ['iPhone SE (1st)', 320, 568],
  ['Android small', 360, 800],
  ['iPhone SE', 375, 667],
  ['iPhone 15', 393, 852],
  ['iPhone Pro Max', 430, 932],
  ['Phone landscape', 852, 393],
  ['iPad mini', 768, 1024],
  ['iPad Air', 820, 1180],
  ['iPad landscape', 1180, 820],
  ['iPad Pro', 1024, 1366],
  ['Laptop', 1280, 800],
  ['Laptop HD', 1366, 768],
  ['Desktop', 1920, 1080],
  ['Desktop QHD', 2560, 1440],
];

async function noHorizontalOverflow(page) {
  const { scrollWidth, width } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(scrollWidth, 'page must not scroll sideways').toBeLessThanOrEqual(width);
}

/** Text elements must stay inside the viewport horizontally. */
async function textInsideViewport(page) {
  const outside = await page.evaluate(() => {
    const W = window.innerWidth;
    return [...document.querySelectorAll('h1,h2,h3,p,li,a,label,input,select,textarea,button,dd,dt,strong,span')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !el.closest('.visually-hidden,.hp,.beams') && (r.left < -1 || r.right > W + 1);
      })
      .map((el) => `${el.tagName}.${el.className}: "${(el.textContent || '').trim().slice(0, 40)}"`);
  });
  expect(outside, 'elements outside the viewport').toEqual([]);
}

/** Text must stay inside its card (no long words sticking out). */
async function textInsideCards(page) {
  const out = await page.evaluate(() => {
    const bad = [];
    for (const card of document.querySelectorAll('.trade, .name-values li, .values li, .facts > div, .faq details')) {
      const cr = card.getBoundingClientRect();
      for (const t of card.querySelectorAll('h3, p, dd, dt, summary, .spec')) {
        const range = document.createRange();
        range.selectNodeContents(t);
        if ([...range.getClientRects()].some((r) => r.right > cr.right + 1 || r.left < cr.left - 1)) bad.push(t.textContent.trim().slice(0, 40));
      }
    }
    return bad;
  });
  expect(out, 'text sticking out of its card').toEqual([]);
}

for (const [name, width, height] of VIEWPORTS) {
  test.describe(`${name} ${width}×${height}`, () => {
    test.use({ viewport: { width, height } });

    test('home page: layout, navigation and every section', async ({ page }, info) => {
      await page.goto('/');
      await page.waitForTimeout(2600); // intro animation

      // Navigation: all links visible, on one row, not overlapping
      const boxes = await page.locator('#nav a').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
      expect(boxes).toHaveLength(4);
      for (const b of boxes) {
        expect(b.left).toBeGreaterThanOrEqual(0);
        expect(b.right).toBeLessThanOrEqual(width);
        expect(b.top).toBeGreaterThanOrEqual(0);
      }
      for (let i = 1; i < boxes.length; i++) expect(boxes[i].left, 'nav links must not overlap').toBeGreaterThanOrEqual(boxes[i - 1].right);
      // Menu is centred on every screen size
      const navCentre = (boxes[0].left + boxes[boxes.length - 1].right) / 2;
      expect(Math.abs(navCentre - width / 2), 'menu centred').toBeLessThan(3);
      // Touch targets on small screens: at least 24px high (WCAG 2.2 AA)
      for (const b of boxes) expect(b.height).toBeGreaterThanOrEqual(24);

      // Logo fits on screen
      const logo = await page.locator('#logo').boundingBox();
      expect(logo.x).toBeGreaterThanOrEqual(0);
      expect(logo.x + logo.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: info.outputPath('01-hero.png') });
      await noHorizontalOverflow(page);

      for (const id of ['ueber-uns', 'frame', 'leistungen', 'ablauf', 'warum-h', 'fragen', 'kontakt']) {
        const y = await page.locator('#' + id).evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 80);
        await scrollToY(page, y);
        await noHorizontalOverflow(page);
        await textInsideViewport(page);
        await page.screenshot({ path: info.outputPath(`02-${id}.png`) });
      }
      await textInsideCards(page);
      // Bottom of the page: closing roof + footer
      await scrollToY(page, 1e6);
      await textInsideViewport(page);
      await page.screenshot({ path: info.outputPath('03-footer.png') });
    });

    test('legal pages', async ({ page }) => {
      for (const p of ['/impressum.html', '/datenschutz.html']) {
        await page.goto(p);
        await expect(page.locator('h1')).toBeVisible();
        // Centred menu, and the small logo (if shown) never overlaps it
        const nav = await page.locator('#nav a').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
        expect(Math.abs((nav[0].left + nav[nav.length - 1].right) / 2 - width / 2)).toBeLessThan(3);
        const brand = await page.locator('#brand').boundingBox();
        if (brand) expect(brand.x + brand.width, 'logo must not overlap the menu').toBeLessThan(nav[0].left - 16);
        await noHorizontalOverflow(page);
        await textInsideViewport(page);
      }
    });
  });
}
