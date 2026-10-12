// End-to-end tests of the contact form against the real handler (tests/mock-api.ts).
const { test, expect, useMockApi } = require('./fixtures');

const API = 'http://localhost:54329';

async function fill(page, overrides = {}) {
  const v = { name: 'Erika Musterfrau', email: 'erika@example.com', telefon: '+49 30 1234567', ort: '10437 Berlin', projektart: 'Sanierung', nachricht: 'Altbauwohnung, 3 Zimmer. Bad und Küche erneuern.', ...overrides };
  await page.getByLabel('Name').fill(v.name);
  await page.getByLabel('E-Mail').fill(v.email);
  await page.getByLabel('Telefon').fill(v.telefon);
  await page.getByLabel('Ort / PLZ des Objekts').fill(v.ort);
  await page.getByLabel('Art des Projekts').selectOption(v.projektart);
  await page.getByLabel('Ihre Nachricht').fill(v.nachricht);
  await page.getByLabel(/Ich bin einverstanden/).check();
}

test.describe('contact form', () => {
  // The browser logs failed requests; these tests provoke them on purpose
  test.use({ allowedConsole: /status of (422|429)|ERR_INTERNET_DISCONNECTED/ });
  // All tests share the mock API's in-memory store
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async ({ request }) => {
    await request.post(`${API}/__reset`);
  });

  test('shows German errors for empty and invalid fields', async ({ page }) => {
    await useMockApi(page);
    await page.goto('/#kontakt');
    await page.getByRole('button', { name: 'Anfrage senden' }).click();
    await expect(page.locator('#f-name-err')).toHaveText('Bitte geben Sie Ihren Namen ein.');
    await expect(page.locator('#f-email-err')).toHaveText(/gültige E-Mail/);
    await expect(page.locator('#f-projektart-err')).toHaveText(/Art des Projekts/);
    await expect(page.getByLabel('Name')).toBeFocused();
    await expect(page.locator('#formStatus')).toHaveText('Bitte prüfen Sie die markierten Felder.');

    // Errors disappear as soon as a field is corrected
    await page.getByLabel('Name').fill('Erika');
    await expect(page.locator('#f-name-err')).toHaveText('');
    await page.getByLabel('Telefon').fill('abc');
    await page.getByRole('button', { name: 'Anfrage senden' }).click();
    await expect(page.locator('#f-telefon-err')).toHaveText(/Telefonnummer/);
  });

  test('missing consent is explained', async ({ page }) => {
    await useMockApi(page);
    await page.goto('/#kontakt');
    await fill(page);
    await page.getByLabel(/Ich bin einverstanden/).uncheck();
    await page.getByRole('button', { name: 'Anfrage senden' }).click();
    await expect(page.locator('#formStatus')).toHaveText(/Verarbeitung Ihrer Angaben/);
  });

  test('a valid request is stored and confirmed', async ({ page, request }) => {
    await useMockApi(page);
    await page.goto('/#kontakt');
    await page.waitForTimeout(3100); // minimum fill time (spam protection)
    await fill(page);
    await page.getByRole('button', { name: 'Anfrage senden' }).click();
    await expect(page.getByRole('heading', { name: 'Vielen Dank, Ihre Anfrage ist angekommen.' })).toBeVisible();

    const stored = await (await request.get(`${API}/__stored`)).json();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: 'Erika Musterfrau', email: 'erika@example.com', projektart: 'Sanierung', ort: '10437 Berlin' });
  });

  test('bots filling the hidden field are not stored', async ({ page, request }) => {
    await useMockApi(page);
    await page.goto('/#kontakt');
    await page.waitForTimeout(3100);
    await fill(page);
    await page.locator('#f-website').evaluate((el) => { el.value = 'http://spam.example'; });
    await page.getByRole('button', { name: 'Anfrage senden' }).click();
    await expect(page.getByRole('heading', { name: /Vielen Dank/ })).toBeVisible();
    expect(await (await request.get(`${API}/__stored`)).json()).toHaveLength(0);
  });

  test('too many requests get a clear message', async ({ page }) => {
    await useMockApi(page);
    await page.route(`${API}/kontakt`, (r) => r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"rate_limited"}' }));
    await page.goto('/#kontakt');
    await fill(page);
    await page.getByRole('button', { name: 'Anfrage senden' }).click();
    await expect(page.locator('#formStatus')).toHaveText(/mehrere Anfragen/);
    await expect(page.getByRole('button', { name: 'Anfrage senden' })).toBeEnabled();
  });

  test('server field errors are shown next to the field', async ({ page }) => {
    await useMockApi(page);
    await page.route(`${API}/kontakt`, (r) => r.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'validation', fields: { email: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' } }) }));
    await page.goto('/#kontakt');
    await fill(page);
    await page.getByRole('button', { name: 'Anfrage senden' }).click();
    await expect(page.locator('#f-email-err')).toHaveText(/gültige E-Mail/);
  });

  test('network failure keeps the input and offers e-mail', async ({ page }) => {
    await useMockApi(page);
    await page.route(`${API}/kontakt`, (r) => r.abort('internetdisconnected'));
    await page.goto('/#kontakt');
    await fill(page);
    await page.getByRole('button', { name: 'Anfrage senden' }).click();
    await expect(page.locator('#formStatus')).toHaveText(/info@vana-management\.de/);
    await expect(page.getByLabel('Name')).toHaveValue('Erika Musterfrau');
  });

  test('without backend configuration the form points to e-mail', async ({ page }) => {
    await page.goto('/#kontakt');
    await fill(page);
    await page.getByRole('button', { name: 'Anfrage senden' }).click();
    await expect(page.locator('#formStatus')).toHaveText(/noch nicht freigeschaltet.*info@vana-management\.de/);
  });
});
