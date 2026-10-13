# VANA Management – Website

Website der **VANA Management UG (haftungsbeschränkt)**: Sanierung & Trockenbau in Berlin.

| | |
|---|---|
| Firma | VANA Management UG (haftungsbeschränkt) |
| Adresse | Wöhlertstr. 4, 10115 Berlin |
| Geschäftsführer | M. Sc. Vahid Naseri |
| Register | Amtsgericht Charlottenburg (Berlin), HRB 281066 B |
| USt-IdNr. | DE462217121 |
| E-Mail | info@vana-management.com |
| Domain | vana-management.com (DNS bei Cloudflare) |

---

## معماری

```
                 ┌──────────────── Cloudflare ────────────────┐
 بازدیدکننده ──▶ │ DNS vana-management.com  (+ Turnstile اختیاری) │
                 └───────────────┬─────────────────────────────┘
                                 ▼
          ┌──────── هاست استاتیک (فعلاً Netlify، بعداً هر جا) ────────┐
          │ public/   HTML + CSS + JS + فونت‌ها   (_headers = امنیت)    │
          └───────────────┬─────────────────────────────────────────────┘
                          │  POST /functions/v1/kontakt   (فقط فرم تماس)
                          ▼
          ┌──────────────── Supabase (فرانکفورت) ───────────────────┐
          │ Edge Function "kontakt"                                   │
          │   ✓ چک Origin   ✓ اعتبارسنجی   ✓ ضد اسپم   ✓ Rate-Limit   │
          │   ✓ Turnstile (اختیاری)   ✓ ایمیل خبر (Worker vana-notify) │
          │                      │ service_role                       │
          │ Postgres: anfragen, anfrage_limits  (RLS، anon هیچ دسترسی) │
          └───────────────────────────────────────────────────────────┘
```

- **سایت کاملاً استاتیکه.** هیچ سرور مخصوصی نمی‌خواد و روی Netlify، Cloudflare Pages یا هر هاست دیگه‌ای بالا میاد. فایل `public/_headers` روی Netlify و Cloudflare Pages هر دو کار می‌کنه.
- **مرورگر هیچ‌وقت مستقیم به دیتابیس وصل نمی‌شه.** فرم به Edge Function می‌فرسته. فقط اون Function با کلید `service_role` (که فقط روی سرور Supabase هست) می‌نویسه. نقش عمومی `anon` هیچ دسترسی‌ای به جدول‌ها نداره (تست شده).
- **کلید مخفی تو کد سایت نیست.** تو `public/assets/js/config.js` فقط آدرس Function و (اختیاری) Site Key عمومی Turnstile میاد.

## ساختار پروژه

```
public/                         ← فقط همین پوشه آنلاین می‌شه
  index.html                    صفحه‌ی اصلی
  impressum.html, datenschutz.html, 404.html
  _headers                      هدرهای امنیتی و کش (CSP، HSTS، …)
  robots.txt, sitemap.xml
  assets/css/style.css          استایل‌ها (رنگ‌ها بالای فایل تو :root)
  assets/js/main.js             منو + انیمیشن سقف لوگو
  assets/js/contact.js          فرم تماس → Edge Function
  assets/js/config.js           ⚠️ آدرس Edge Function اینجا
  assets/fonts/                 فونت‌ها روی سرور خودمون (DSGVO)
  assets/img/                   لوگو، favicon، تصویر اشتراک‌گذاری (og-image)
supabase/
  migrations/…_anfragen.sql     جدول‌ها، RLS، تابع rate-limit
  functions/kontakt/            Edge Function (+ تست‌ها)
  config.toml
tests/                          تست‌های خودکار (Playwright)
.github/workflows/ci.yml        اجرای خودکار تست‌ها روی هر push
netlify.toml                    تنظیمات Netlify (publish = public)
```

## اجرای محلی و تست

پیش‌نیاز: Node 22 و [Deno 2](https://deno.com).

```bash
npm install
npm start                       # http://localhost:4173  (با همون هدرهای امنیتی سایت اصلی)
npx playwright install chromium # بار اول
npm test                        # ۵۸ تست: ۱۴ اندازه‌ی صفحه، منو، فرم، بنر کوکی، دسترس‌پذیری
npm run test:functions          # ۱۲ تست Edge Function
npm run lint:functions
```

تست‌ها چه چیزهایی رو چک می‌کنن:
- **۱۴ اندازه‌ی صفحه** از iPhone SE (۳۲۰px) تا مانیتور QHD (۲۵۶۰px)، شامل موبایل افقی و iPad: اسکرول افقی نداشته باشه، هیچ متنی از صفحه بیرون نزنه، منو جا بشه.
- منو، پرش به بخش‌ها، محو شدن منو، کیبورد (skip link و دیده شدن focus)، حالت reduced motion و حالت بدون جاوااسکریپت.
- فرم تماس از اول تا آخر با **همون کد واقعی Edge Function**: خطاهای فیلدها، رضایت، ذخیره، honeypot، خطای ۴۲۹، قطع اینترنت.
- **دسترس‌پذیری (WCAG 2.2 AA)** با axe در حالت روشن و تاریک.
- هر خطای کنسول یا نقض CSP یعنی شکست تست.

---

## راه‌اندازی Supabase

### ۱. پروژه
1. اکانت Supabase مخصوص VANA → **New project** → اسم `vana-management`
2. Region: **Central EU (Frankfurt)**
3. رمز دیتابیس رو جای امن نگه دار

### ۲. دیتابیس و Function با Supabase CLI
```bash
npm i -g supabase           # یا: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <PROJECT_REF>

supabase db push            # جدول‌ها + RLS + rate-limit

supabase secrets set \
  ALLOWED_ORIGINS="https://vana-management.com,https://www.vana-management.com,https://<netlify-name>.netlify.app" \
  RATE_LIMIT_SALT="$(openssl rand -hex 32)"

supabase functions deploy kontakt     # verify_jwt=false از config.toml خونده می‌شه
```
بدون CLI هم می‌شه: محتوای فایل SQL رو تو **SQL Editor** اجرا کن و Function رو از **Edge Functions → Deploy a new function** بساز. سه فایل `index.ts`، `handler.ts` و `validate.ts` لازمه. گزینه‌ی **Verify JWT** رو خاموش کن.

### ۳. وصل کردن سایت
تو `public/assets/js/config.js`:
```js
apiUrl: "https://<PROJECT_REF>.supabase.co/functions/v1/kontakt",
```

### ۴. تست
```bash
curl -i -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/kontakt" \
  -H "Origin: https://vana-management.com" -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","projektart":"Sanierung","nachricht":"Testanfrage von der Website","datenschutz_akzeptiert":true,"website":"","elapsed_ms":5000}'
# → 201 {"ok":true}
```

### ۵. دیدن و مدیریت درخواست‌ها
**Table Editor → anfragen**. ستون `status` رو برای هر درخواست عوض کن: `neu` → `in_bearbeitung` → `erledigt`. یادداشت داخلی تو `notiz` می‌ره و `bearbeitet_am` خودکار پر می‌شه.

### ۶. ایمیل برای هر درخواست جدید ✅ (فعاله)
بعد از ذخیره‌ی هر درخواست، Function اون رو به Worker کوچیک **`vana-notify`** (`workers/notify/`، آدرس `notify.vana-management.com`) می‌فرسته. Worker با **Cloudflare Email Routing** یه ایمیل از `info@vana-management.com` به `vahidnaseri1988@gmail.com` می‌فرسته. `Reply-To` ایمیل مشتریه، پس با Antworten مستقیم به مشتری جواب می‌دی. اگه ایمیل نرسه، درخواست باز هم تو جدول ذخیره شده.

- گیرنده فقط می‌تونه یه آدرس **تأییدشده** تو Email Routing باشه (`wrangler.jsonc` → `send_email` و `MAIL_TO`).
- Function و Worker یه رمز مشترک دارن: Worker `NOTIFY_SECRET`، Supabase `NOTIFY_WEBHOOK_SECRET` (هر دو یه مقدار).
```bash
npm run deploy:notify                                            # دیپلوی Worker
openssl rand -hex 32 | npx wrangler secret put NOTIFY_SECRET -c workers/notify/wrangler.jsonc
supabase secrets set NOTIFY_WEBHOOK_URL=https://notify.vana-management.com NOTIFY_WEBHOOK_SECRET=<همون مقدار>
npm run test:notify                                              # تست ساخت ایمیل
```
جایگزین: به‌جای Worker می‌شه از Resend استفاده کرد (`RESEND_API_KEY`, `NOTIFY_TO`, `MAIL_FROM`). اگه `NOTIFY_WEBHOOK_URL` تنظیم باشه، اون اولویت داره.

### ۶ب. ایمیل info@ ✅
- **دریافت:** Cloudflare Email Routing، `info@vana-management.com` → `vahidnaseri1988@gmail.com`.
- **ارسال از Gmail با آدرس info@:** دامنه تو **Brevo** احراز شده (DKIM با `brevo1/brevo2._domainkey`، TXT `brevo-code`). تو Gmail از بخش «Send mail as» با `smtp-relay.brevo.com:587` (TLS) و کلید SMTP خود Brevo.
- **تأیید خودکار برای مشتری:** Worker `vana-notify` با API برند Brevo (`BREVO_API_KEY` به‌عنوان secret Worker):
  - هر کی فرم رو بفرسته یه ایمیل «Ihre Anfrage bei VANA Management» می‌گیره. متنش ثابته و هیچ چیزی از متن فرم توش نیست (که فرم تبدیل به ابزار اسپم نشه).
  - هر کی **برای اولین بار** به info@ ایمیل بزنه یه «Eingangsbestätigung» می‌گیره. آدرس‌های دیده‌شده تو KV `vana-notify-seen` ذخیره می‌شن. به no-reply، لیست‌های ایمیل، bounce و ایمیل‌های خودکار جواب داده نمی‌شه (RFC 3834).
  - قانون Email Routing: `info@` → Worker `vana-notify` (Worker اول به Gmail فوروارد می‌کنه، بعد تأیید می‌فرسته).
  - ⚠️ تو Brevo قفل IP (Authorised IPs) باید **خاموش** باشه، چون Worker از IPهای متغیر Cloudflare درخواست می‌ده.
  - عوض کردن کلید Brevo: کلید جدید بساز → `npx wrangler secret put BREVO_API_KEY -c workers/notify/wrangler.jsonc` (یا تو داشبورد Cloudflare: Workers → vana-notify → Settings → Variables and Secrets) → کلید قدیمی رو پاک کن.
- **DNS:** SPF `v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all`، DMARC `p=none` (بعد از چند هفته گزارش بدون مشکل → `p=quarantine`).

### ۷. (اختیاری) Cloudflare Turnstile ضد اسپم
1. Cloudflare → **Turnstile → Add widget** → دامنه‌ها رو اضافه کن
2. `supabase secrets set TURNSTILE_SECRET_KEY=...`
3. Site Key رو تو `config.js` → `turnstileSiteKey` بذار
4. ⚠️ یه بند به Datenschutz اضافه کن (Cloudflare Turnstile، Art. 6 Abs. 1 lit. f DSGVO)

| Secret | لازم؟ | توضیح |
|---|---|---|
| `ALLOWED_ORIGINS` | ✅ | دامنه‌هایی که اجازه دارن فرم بفرستن (با کاما) |
| `RATE_LIMIT_SALT` | ✅ | رشته‌ی تصادفی طولانی |
| `NOTIFY_WEBHOOK_URL`, `NOTIFY_WEBHOOK_SECRET` | — | ایمیل خبر دادن از طریق Worker `vana-notify` (فعاله) |
| `RESEND_API_KEY`, `NOTIFY_TO`, `MAIL_FROM` | — | جایگزین: ایمیل خبر دادن با Resend |
| `TURNSTILE_SECRET_KEY` | — | Turnstile |

---

## انتشار

### فعلاً: Netlify
- اتصال به گیت‌هاب: **Add new project → Import from Git** → `mobinakbara-eng/vanatest`
- Publish directory خودش از `netlify.toml` خونده می‌شه: `public`. Build command نداره.

### دامنه روی Cloudflare → Netlify
1. Cloudflare → `vana-management.com` → **DNS**:
   | Type | Name | Content | Proxy |
   |---|---|---|---|
   | CNAME | `@` | `<netlify-name>.netlify.app` | **DNS only** (ابر خاکستری) |
   | CNAME | `www` | `<netlify-name>.netlify.app` | **DNS only** |
2. Netlify → **Domain management** → هر دو دامنه رو اضافه کن. HTTPS خودکار فعال می‌شه.
3. `ALLOWED_ORIGINS` تو Supabase رو با دامنه‌ی نهایی آپدیت کن.

> چرا DNS only؟ اگه پروکسی Cloudflare (ابر نارنجی) جلوی Netlify روشن باشه، صدور گواهی SSL و کش Netlify به مشکل می‌خورن.

### اصلی: Cloudflare Workers روی vana-management.com

> ✅ **آنلاین از ۱۳ اکتبر ۲۰۲۶:** https://vana-management.com
> - Worker: `vana-management` (Account `8f96ead3…`)
> - `www` با 301 به آدرس اصلی ریدایرکت می‌شه (Single Redirect Rule)
> - Always Use HTTPS روشنه، حداقل TLS 1.2، SSL روی Full (strict)
> - آدرس موقت Netlify با 301 به `.com` ریدایرکت می‌شه
> - **Supabase:** پروژه‌ی `dnamzzkduiougwwwiogo` (eu-west-1، ایرلند). Migration اجرا شده و Function `kontakt` منتشر شده (`verify_jwt=false`). Secrets تنظیم‌شده: `ALLOWED_ORIGINS` و `RATE_LIMIT_SALT`. یه درخواست تستی از سایت آنلاین با موفقیت ذخیره و بعد پاک شد.
> - درخواست‌ها: Supabase → Table Editor → `anfragen`
> - Cloudflare به‌صورت خودکار اسکریپت Web Analytics رو به صفحه اضافه می‌کنه، ولی CSP سایت جلوش رو می‌گیره و هیچ داده‌ای ارسال نمی‌شه. برای خاموش کردن کاملش: داشبورد Cloudflare → Analytics & Logs → Web Analytics
فایل [`wrangler.jsonc`](wrangler.jsonc) سایت (`public/`) رو به‌صورت **Workers Static Assets** منتشر می‌کنه و دامنه‌های `vana-management.com` و `www.vana-management.com` رو مستقیم وصل می‌کنه. رکورد DNS رو هم خود Cloudflare می‌سازه. `_headers` (CSP، HSTS و کش) همون‌جا هم کار می‌کنه.

```bash
export CLOUDFLARE_API_TOKEN=...   CLOUDFLARE_ACCOUNT_ID=...
npm run dev:cf     # تست محلی با runtime خود Cloudflare → http://localhost:8787
npm run deploy     # انتشار
```
پیش‌نیازها:
- دامنه به‌عنوان Zone در همون حساب Cloudflare فعال باشه.
- روی `vana-management.com` و `www` **رکورد CNAME قبلی نباشه**، وگرنه دامنه وصل نمی‌شه.
- API Token از قالب **«Edit Cloudflare Workers»** ساخته بشه، محدود به همین Account و Zone `vana-management.com`، به‌علاوه‌ی **Zone → DNS → Edit**.

بعد از وصل شدن دامنه، `ALLOWED_ORIGINS` تو Supabase باید فقط دامنه‌های `.com` باشه. سایت Netlify هم باید به `.com` ریدایرکت بشه یا حذف بشه.

---

## دیده شدن در گوگل (SEO و Google Ads)

برنامه‌ی کامل: **[docs/SEO-PLAN.md](docs/SEO-PLAN.md)**. شامل تحلیل رقبا، کلمه‌های کلیدی، برنامه‌ی مرحله‌به‌مرحله و منابع رسمی گوگل.

خلاصه:
1. **Google Business Profile** بسازید و تأیید کنید. اسم فقط «VANA Management» باشه.
2. **بعد از هر پروژه نظر گوگل بگیرید** و به همه‌ی نظرات جواب بدید.
3. **برای هر خدمت صفحه‌ی جدا** با عکس واقعی، قیمت، FAQ و پروژه‌ها.
4. ثبت در دایرکتوری‌ها با اسم، آدرس و تلفن یکسان.
5. محتوای «هزینه‌ها» با قیمت‌های واقعی VANA.

پیش‌نیازهایی که الان کمه: ☎️ **شماره تلفن**، 📷 **عکس پروژه‌ها**، و روشن شدن اینکه **آدرس Wöhlertstr. 4 دفتر واقعیه یا نه.**

## قبل از آنلاین شدن ✅
- [ ] Supabase ساخته شد، `db push` و `functions deploy` انجام شد، `apiUrl` تو `config.js` پر شد
- [ ] یه درخواست تستی از سایت فرستاده شد و تو Table Editor دیده شد
- [ ] **AVV (قرارداد پردازش داده)** با Netlify، Cloudflare و Supabase (هر سه آنلاین تو تنظیمات اکانت)
- [ ] Impressum و Datenschutz توسط وکیل یا سرویس حقوقی چک شد
- [x] ایمیل `info@vana-management.com` کار می‌کنه (دریافت: Cloudflare Email Routing → Gmail؛ خبر فرم: Worker `vana-notify`)
- [ ] دامنه وصل شد و `ALLOWED_ORIGINS` آپدیت شد
- [ ] Google Search Console و Bing Webmaster وصل شدن و `sitemap.xml` ثبت شد
- [ ] Google Business Profile ساخته و تأیید شد (مرحله‌ی ۰ و ۱ در [SEO-PLAN](docs/SEO-PLAN.md))
- [ ] شماره تلفن روی سایت، Impressum و پروفایل گوگل یکسانه

## نکته‌ها
- **⚠️ بعد از هر تغییر CSS یا JS:** عدد `?v=` رو تو لینک‌های همه‌ی صفحه‌ها یکی بالا ببر (مثلاً `?v=20261013` → `?v=20261020`). این‌طوری مرورگرها نسخه‌ی قدیمی رو از کش استفاده نمی‌کنن. یه تست هم چک می‌کنه همه‌ی صفحه‌ها یه نسخه داشته باشن. دستور سریع:
  ```bash
  NEW=$(date +%Y%m%d%H%M); sed -i -E "s/\?v=[0-9a-z]+/?v=$NEW/g" public/*.html
  ```
- **فونت‌ها محلی‌ان**، بدون Google Fonts (حکم LG München درباره‌ی DSGVO).
- **بنر کوکی** (`public/assets/js/consent.js`) طبق TDDDG § 25: «Alle akzeptieren» و «Nur notwendige» هم‌وزن تو صفحه‌ی اول، تنظیمات جدا برای Statistik و Marketing، و لینک «Cookie-Einstellungen» پایین هر صفحه. انتخاب کاربر تو `localStorage` با کلید `vana-consent` ذخیره می‌شه. الان هیچ سرویس آمار یا تبلیغاتی فعال نیست.
- **اضافه کردن سرویس آمار در آینده:** فقط بعد از رضایت لودش کن:
  ```js
  function loadStats() { /* اسکریپت آمار */ }
  if (window.vanaConsent?.has('statistik')) loadStats();
  document.addEventListener('vana:consent', (e) => { if (e.detail.statistik) loadStats(); });
  ```
  بعدش اسم سرویس رو به بند ۳ Datenschutz و دامنه‌ش رو به CSP تو `_headers` اضافه کن.
- **ضد اسپم چندلایه:** فیلد مخفی، حداقل ۳ ثانیه، اعتبارسنجی سمت سرور، حداکثر ۵ درخواست در ساعت برای هر IP (IP فقط به‌صورت hash و حداکثر ۲۴ ساعت نگه داشته می‌شه)، و Turnstile اختیاری.
- **CI:** هر push به گیت‌هاب همه‌ی تست‌ها رو اجرا می‌کنه (`.github/workflows/ci.yml`).
