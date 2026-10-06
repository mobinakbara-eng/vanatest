/*
 * Builds the downloadable menus speisekarte.pdf (DE) and menu-en.pdf (EN)
 * from menu-print.html.
 *
 * Menu source: the menu published in the manager dashboard (Supabase table
 * site_menu, read with the public key from js/config.js). If that cannot be
 * reached, the bundled js/menu-data.js is used.
 *
 *   npm install --no-save playwright@1 && npx playwright install chromium
 *   node la-tettoia/tools/build-menu-pdf.cjs
 *
 * Optional: CHROMIUM_PATH=/path/to/chromium to use an existing browser.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const config = fs.readFileSync(path.join(root, "js/config.js"), "utf8");
const pick = (k) => (config.match(new RegExp(k + ':\\s*"([^"]*)"')) || [])[1] || "";
const url = pick("supabaseUrl").replace(/\/$/, "");
const key = pick("supabaseKey");

const valid = (m) => m && Array.isArray(m.food) && Array.isArray(m.drinks) && m.food.length > 0;

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext({ ignoreHTTPSErrors: !!process.env.LT_IGNORE_TLS });

  // 1) Published menu (fetched inside the browser so system proxies apply)
  let menu = null;
  if (url && key) {
    const probe = await context.newPage();
    for (let attempt = 1; attempt <= 3 && !valid(menu); attempt++) {
      try {
        menu = await probe.evaluate(async ({ url, key }) => {
          const r = await fetch(url + "/rest/v1/site_menu?select=content&id=eq.1", { headers: { apikey: key } });
          if (!r.ok) return null;
          const rows = await r.json();
          return rows[0] && rows[0].content;
        }, { url, key });
      } catch (e) { menu = null; }
    }
    await probe.close();
  }
  console.log(valid(menu) ? "Menu source: published menu (Supabase)" : "Menu source: bundled js/menu-data.js");

  // 2) Render both languages
  for (const [lang, file] of [["de", "speisekarte.pdf"], ["en", "menu-en.pdf"]]) {
    const page = await context.newPage();
    if (valid(menu)) await page.addInitScript((m) => { window.LT_MENU_OVERRIDE = m; }, menu);
    // Load every face the menu uses; retry, and refuse to build a PDF with fallback fonts.
    const faces = ['italic 500 16px "Cormorant Garamond"', '600 16px "Cormorant Garamond"', 'italic 600 16px "Cormorant Garamond"',
      'italic 400 16px "Cormorant Garamond"', '300 12px Jost', '400 12px Jost', '500 12px Jost'];
    let fontsOk = false;
    for (let attempt = 1; attempt <= 4 && !fontsOk; attempt++) {
      await page.goto("file://" + path.join(root, "menu-print.html") + "?lang=" + lang, { waitUntil: "networkidle" });
      await page.waitForFunction(() => window.LT_MENU_READY === true);
      fontsOk = await page.evaluate(async (faces) => {
        try { await Promise.all(faces.map((f) => document.fonts.load(f))); } catch (e) { return false; }
        await document.fonts.ready;
        return faces.every((f) => document.fonts.check(f));
      }, faces);
      if (!fontsOk) console.log("Fonts not loaded (attempt " + attempt + "), retrying …");
    }
    if (!fontsOk) throw new Error("Web fonts could not be loaded – PDF not written.");
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: path.join(root, file),
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: '<div style="width:100%;text-align:center;font:7px Helvetica,Arial,sans-serif;color:#8a7f73;letter-spacing:1px">LA TETTOIA · <span class="pageNumber"></span> / <span class="totalPages"></span></div>'
    });
    console.log("Wrote " + file + " (" + Math.round(fs.statSync(path.join(root, file)).size / 1024) + " KB)");
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
