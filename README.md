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
          │   ✓ Turnstile (اختیاری)   ✓ ایمیل با Resend (اختیاری)     │
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

### ۶. (اختیاری) ایمیل برای هر درخواست جدید
1. تو [Resend](https://resend.com) دامنه‌ی `vana-management.com` رو تأیید کن. رکوردهای DNS‌ش رو تو Cloudflare اضافه کن.
2. ```bash
   supabase secrets set RESEND_API_KEY=re_... NOTIFY_TO=info@vana-management.com MAIL_FROM="VANA Website <website@vana-management.com>"
   ```
   ایمیل `reply_to` مشتری رو داره، پس با Antworten مستقیم به خود مشتری جواب می‌دی.

### ۷. (اختیاری) Cloudflare Turnstile ضد اسپم
1. Cloudflare → **Turnstile → Add widget** → دامنه‌ها رو اضافه کن
2. `supabase secrets set TURNSTILE_SECRET_KEY=...`
3. Site Key رو تو `config.js` → `turnstileSiteKey` بذار
4. ⚠️ یه بند به Datenschutz اضافه کن (Cloudflare Turnstile، Art. 6 Abs. 1 lit. f DSGVO)

| Secret | لازم؟ | توضیح |
|---|---|---|
| `ALLOWED_ORIGINS` | ✅ | دامنه‌هایی که اجازه دارن فرم بفرستن (با کاما) |
| `RATE_LIMIT_SALT` | ✅ | رشته‌ی تصادفی طولانی |
| `RESEND_API_KEY`, `NOTIFY_TO`, `MAIL_FROM` | — | ایمیل خبر دادن |
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

### بعداً (اختیاری): Cloudflare Pages
همون پوشه‌ی `public` بدون هیچ تغییری: **Workers & Pages → Create → Pages → Connect to Git**، Build command خالی و Output directory `public`. `_headers` هم همون‌جا کار می‌کنه.

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
- [ ] ایمیل `info@vana-management.com` کار می‌کنه
- [ ] دامنه وصل شد و `ALLOWED_ORIGINS` آپدیت شد
- [ ] Google Search Console و Bing Webmaster وصل شدن و `sitemap.xml` ثبت شد
- [ ] Google Business Profile ساخته و تأیید شد (مرحله‌ی ۰ و ۱ در [SEO-PLAN](docs/SEO-PLAN.md))
- [ ] شماره تلفن روی سایت، Impressum و پروفایل گوگل یکسانه

## نکته‌ها
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
