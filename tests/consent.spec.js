// Cookie banner (TDDDG § 25): shown on first visit, reject as easy as accept, choice remembered and changeable.
const { test, expect } = require('./fixtures');

test.use({ presetConsent: false });

const banner = (page) => page.getByRole('dialog', { name: 'Cookies & Datenschutz' });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('vana-consent')));

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`banner on first visit: both choices on the first layer (${viewport.width}px)`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    const accept = page.getByRole('button', { name: 'Alle akzeptieren' });
    const reject = page.getByRole('button', { name: 'Nur notwendige' });
    // Settings stay closed until asked for
    await expect(page.getByRole('button', { name: 'Auswahl speichern' })).toBeHidden();
    await expect(page.getByRole('switch', { name: /Statistik/ })).toBeHidden();
    await expect(accept).toBeInViewport();
    await expect(reject).toBeInViewport();
    // Rejecting must be as easy as accepting: same size class of button
    const [a, r] = [await accept.boundingBox(), await reject.boundingBox()];
    expect(Math.abs(a.height - r.height)).toBeLessThan(2);
    const box = await banner(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: info.outputPath('banner.png') });
  });
}

test('"Nur notwendige" stores the choice and the banner stays closed after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nur notwendige' }).click();
  await expect(banner(page)).toBeHidden();
  expect(await stored(page)).toMatchObject({ v: 1, statistik: false, marketing: false });
  await page.reload();
  await page.waitForTimeout(300);
  await expect(banner(page)).toBeHidden();
  expect(await page.evaluate(() => window.vanaConsent.has('statistik'))).toBe(false);
});

test('"Alle akzeptieren" enables optional categories and fires an event', async ({ page }) => {
  await page.goto('/');
  const event = page.evaluate(() => new Promise((r) => document.addEventListener('vana:consent', (e) => r(e.detail), { once: true })));
  await page.getByRole('button', { name: 'Alle akzeptieren' }).click();
  expect(await event).toEqual({ statistik: true, marketing: true });
  expect(await page.evaluate(() => window.vanaConsent.has('marketing'))).toBe(true);
});

test('settings: choose single categories, necessary cannot be switched off', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await expect(page.getByRole('switch', { name: /Notwendig/ })).toBeChecked();
  await expect(page.getByRole('switch', { name: /Notwendig/ })).toBeDisabled();
  await page.getByText('Statistik', { exact: true }).click();
  await page.getByRole('button', { name: 'Auswahl speichern' }).click();
  await expect(banner(page)).toBeHidden();
  expect(await stored(page)).toMatchObject({ statistik: true, marketing: false });
});

test('footer link reopens the settings with the saved choice; keyboard works', async ({ page }) => {
  await page.goto('/impressum.html');
  await page.getByRole('button', { name: 'Nur notwendige' }).click();
  await page.getByRole('button', { name: 'Cookie-Einstellungen' }).click();
  await expect(banner(page)).toBeVisible();
  await expect(page.getByRole('switch', { name: /Statistik/ })).toBeFocused();
  await expect(page.getByRole('switch', { name: /Statistik/ })).not.toBeChecked();
  await page.keyboard.press('Space');
  await expect(page.getByRole('switch', { name: /Statistik/ })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(banner(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cookie-Einstellungen' })).toBeFocused();
});

test('works when storage is blocked (private mode)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  await page.goto('/');
  await expect(banner(page)).toBeVisible();
  await page.getByRole('button', { name: 'Nur notwendige' }).click();
  await expect(banner(page)).toBeHidden();
});
