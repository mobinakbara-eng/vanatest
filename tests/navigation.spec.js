const { test, expect, scrollToY } = require('./fixtures');

test.describe('navigation', () => {
  test.use({ allowedConsole: /status of 404 \(Not Found\)$/ });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    test(`links jump to their sections (${viewport.width}px)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      for (const [label, id] of [['Über uns', 'ueber-uns'], ['Leistungen', 'leistungen'], ['Ablauf', 'ablauf'], ['Kontakt', 'kontakt']]) {
        await scrollToY(page, 0);
        await page.waitForTimeout(300); // header returns at the top
        await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: label }).click();
        await expect.poll(() => page.locator('#' + id).evaluate((el) => Math.round(el.getBoundingClientRect().top)), { timeout: 4000 })
          .toBeLessThan(140);
        await expect(page).toHaveURL(new RegExp('#' + id + '$'));
      }
    });
  }

  test('header fades out when scrolling down and returns when scrolling up', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const header = page.locator('#siteHeader');
    await expect(header).not.toHaveClass(/away/);
    await page.mouse.wheel(0, 900);
    await expect(header).toHaveClass(/away/);
    await page.mouse.wheel(0, -300);
    await expect(header).not.toHaveClass(/away/);
  });

  test('keyboard: skip link first, focused menu links stay visible after scrolling', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Zum Inhalt springen' })).toBeFocused();
    await expect(page.getByRole('link', { name: 'Zum Inhalt springen' })).toBeInViewport();

    await page.mouse.wheel(0, 3000);
    await expect(page.locator('#siteHeader')).toHaveClass(/away/);
    await page.locator('body').focus();
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // brand (hidden on phones) or first link
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toBeInViewport();
    // the header fades back in (0.45s transition)
    await expect.poll(() => focused.evaluate((el) => getComputedStyle(el.closest('header')).opacity)).toBe('1');
  });

  test('always light, even when the device is in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    for (const path of ['/', '/impressum.html']) {
      await page.goto(path);
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 245, 242)');
      expect(await page.evaluate(() => getComputedStyle(document.body).color)).toBe('rgb(23, 32, 46)');
    }
  });

  test('reduced motion: static logo with roof, no moving beams', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('.roof')).toBeVisible();
    await expect(page.locator('.beams')).toBeHidden();
    await expect(page.getByText('Sanierung · Modernisierung')).toBeVisible();
  });

  test('footer links open Impressum and Datenschutz, brand leads back home', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Impressum' }).click();
    await expect(page).toHaveURL(/impressum\.html$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Impressum');
    await expect(page.getByText('HRB 281066 B')).toBeVisible();
    await page.getByRole('link', { name: 'Datenschutz' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Datenschutz\u00ad?erklärung$/);
    await page.getByRole('link', { name: /zur Startseite/ }).first().click();
    await expect(page).toHaveURL(/\/(index\.html)?$/);
  });

  test('every icon and the manifest load', async ({ page, request }) => {
    for (const path of ['/', '/impressum.html', '/datenschutz.html', '/gibt-es-nicht']) {
      await page.goto(path);
      const hrefs = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').evaluateAll((els) => els.map((e) => e.href));
      expect(hrefs.length).toBeGreaterThanOrEqual(5);
      for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200);
    }
    const manifest = await (await request.get('/site.webmanifest')).json();
    for (const icon of manifest.icons) expect((await request.get('/' + icon.src)).status(), icon.src).toBe(200);
  });

  test('CSS and JS links carry the same version on every page (cache busting)', async ({ page }) => {
    const versions = new Set();
    for (const path of ['/', '/impressum.html', '/datenschutz.html', '/gibt-es-nicht']) {
      await page.goto(path);
      const urls = await page.locator('link[rel="stylesheet"], script[src]').evaluateAll((els) => els.map((e) => e.href || e.src));
      for (const u of urls) {
        const v = new URL(u).searchParams.get('v');
        expect(v, `${u} needs ?v=`).toBeTruthy();
        versions.add(v);
      }
    }
    expect([...versions], 'one version everywhere').toHaveLength(1);
  });

  test('FAQ answers open and close; FAQ structured data matches the page', async ({ page }) => {
    await page.goto('/');
    const q = page.getByText('Wie kommt das Angebot zustande?');
    const answer = page.getByText(/schriftliches Angebot mit Leistungsbeschreibung, Material und Bauzeit/);
    await expect(answer).toBeHidden();
    await q.click();
    await expect(answer).toBeVisible();
    await q.click();
    await expect(answer).toBeHidden();
    const ld = await page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((e) => JSON.parse(e.textContent)));
    const faq = ld.find((d) => d['@type'] === 'FAQPage');
    expect(faq.mainEntity.length).toBe(await page.locator('.faq details').count());
  });

  test('scroll reveal: every animated element ends up fully visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += 300) await scrollToY(page, y);
    await page.waitForTimeout(1500);
    const hidden = await page.locator('.reveal').evaluateAll((els) => els
      .filter((el) => !el.classList.contains('in') || getComputedStyle(el).opacity !== '1')
      .map((el) => el.tagName + ': ' + el.textContent.trim().slice(0, 40)));
    expect(hidden).toEqual([]);
    expect(await page.locator('.reveal').count()).toBeGreaterThan(20);
  });

  test('WhatsApp: link in the contact details and a floating button after the hero', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const wa = /^https:\/\/wa\.me\/491781449227\?text=/;
    await expect(page.locator('.contact-info a.wa-link')).toHaveAttribute('href', wa);
    const btn = page.locator('#waFloat'); // hidden at first, so not yet in the accessibility tree
    await expect(btn).toHaveAttribute('aria-label', /Per WhatsApp schreiben/);
    await expect(btn).toHaveAttribute('href', wa);
    await expect(btn).toHaveAttribute('target', '_blank');
    await expect(btn).toBeHidden(); // not over the logo animation
    await scrollToY(page, 1600);
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(44); // touch target
    // hidden while the contact form is on screen, so it never covers a field or the send button
    await page.locator('#contactForm').scrollIntoViewIfNeeded();
    await expect(btn).toBeHidden();
  });

  test('unknown pages show the 404 page', async ({ page }) => {
    const res = await page.goto('/gibt-es-nicht');
    expect(res.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Diese Seite gibt es nicht.');
  });

  test('works without JavaScript: content and roof visible', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(2600);
    await expect(page.locator('.roof')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Unsere Leistungen.' })).toBeAttached();
    await ctx.close();
  });
});
