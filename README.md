# VANA Management – Website

Website der **VANA Management UG (haftungsbeschränkt)**: Sanierung & Trockenbau in Berlin.
Statische Seite (HTML/CSS/JS, ohne Build-Schritt). Das Kontaktformular speichert Anfragen in **Supabase**, gehostet wird auf **Netlify**.

| | |
|---|---|
| Firma | VANA Management UG (haftungsbeschränkt) |
| Adresse | Wöhlertstr. 4, 10115 Berlin |
| Geschäftsführer | M. Sc. Vahid Naseri |
| Register | Amtsgericht Charlottenburg (Berlin), HRB 281066 B |
| USt-IdNr. | DE462217121 |
| E-Mail | info@vana-management.de |

---

## ساختار پروژه

```
index.html                 صفحه‌ی اصلی (هدر/منو، موشن لوگو، معرفی، خدمات، مراحل، فرم تماس)
impressum.html             Impressum (§ 5 DDG)
datenschutz.html           Datenschutzerklärung (DSGVO)
404.html                   صفحه‌ی خطا
assets/css/style.css       همه‌ی استایل‌ها + رنگ‌ها (حالت روشن و تاریک)
assets/js/main.js          منوی بالا + انیمیشن سقف لوگو موقع اسکرول
assets/js/contact.js       فرم تماس → Supabase
assets/js/config.js        ⚠️ آدرس و کلید Supabase اینجا وارد می‌شه
assets/fonts/              فونت‌ها روی سرور خودمون (طبق DSGVO، بدون Google Fonts)
assets/img/                لوگو (SVG) و favicon
supabase/migrations/       SQL ساخت جدول anfragen
netlify.toml               تنظیمات Netlify و هدرهای امنیتی
```

### دیدن سایت روی کامپیوتر
```bash
python3 -m http.server 8080
# بعد: http://localhost:8080
```

---

## Supabase (فرم تماس)

فرم تماس مستقیم با REST API در جدول `anfragen` ذخیره می‌کنه. هیچ کتابخونه‌ای لازم نیست.
**امنیت:** کلید `anon` عمومیه و فقط اجازه‌ی **اضافه کردن** درخواست داره. خوندن، تغییر و حذف فقط از داخل پنل Supabase ممکنه.

### ۱. ساخت پروژه
1. وارد اکانت Supabase مخصوص VANA شو → **New project**
2. اسم: `vana-management`
3. Region: **Central EU (Frankfurt) – eu-central-1** (برای DSGVO مهمه)
4. یه رمز قوی برای دیتابیس بذار و یه جای امن نگهش دار

### ۲. ساخت جدول
**SQL Editor → New query** → محتوای فایل
[`supabase/migrations/20261012000000_anfragen.sql`](supabase/migrations/20261012000000_anfragen.sql)
رو کامل کپی کن و **Run** بزن.

یا با Supabase CLI:
```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

جدول `anfragen`:

| ستون | نوع | توضیح |
|---|---|---|
| `id` | uuid | خودکار |
| `erstellt_am` | timestamptz | زمان ارسال، خودکار |
| `name` | text | اجباری، ۲ تا ۱۲۰ کاراکتر |
| `email` | text | اجباری، فرمت ایمیل چک می‌شه |
| `telefon` | text | اختیاری |
| `ort` | text | اختیاری (شهر/کد پستی ملک) |
| `projektart` | text | `Sanierung` / `Trockenbau` / `Sanierung und Trockenbau` / `Sonstiges` |
| `nachricht` | text | اجباری، ۱۰ تا ۴۰۰۰ کاراکتر |
| `datenschutz_akzeptiert` | boolean | باید `true` باشه |
| `status` | text | `neu` / `in_bearbeitung` / `erledigt` (فقط داخلی) |
| `notiz` | text | یادداشت داخلی |

### ۳. وصل کردن سایت
**Project Settings → API Keys** (یا Data API):
- **Project URL** مثلاً `https://abcdefghijklmnop.supabase.co`
- **anon / publishable key**

این دو تا رو تو [`assets/js/config.js`](assets/js/config.js) بذار:
```js
window.VANA_CONFIG = {
  supabaseUrl: "https://abcdefghijklmnop.supabase.co",
  supabaseAnonKey: "eyJhbGciOi...",
  contactEmail: "info@vana-management.de"
};
```
> ⛔ هیچ‌وقت کلید `service_role` / `secret` رو تو سایت نذار.

تا وقتی این دو تا خالی‌ان، فرم به بازدیدکننده می‌گه با ایمیل تماس بگیره.

### ۴. تست
```bash
curl -i -X POST "https://<PROJECT_REF>.supabase.co/rest/v1/anfragen" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"name":"Test","email":"test@example.com","projektart":"Sanierung","nachricht":"Testanfrage von der Website","datenschutz_akzeptiert":true}'
# انتظار: HTTP 201
```
تست امنیت (باید خطا بده یا لیست خالی برگردونه، **نه** داده):
```bash
curl "https://<PROJECT_REF>.supabase.co/rest/v1/anfragen?select=*" -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
```

### ۵. دیدن درخواست‌ها
**Table Editor → anfragen**. ستون `status` رو برای هر درخواست عوض کن (`neu` → `in_bearbeitung` → `erledigt`) و یادداشت رو تو `notiz` بنویس.

### ۶. (اختیاری) ایمیل خبر دادن برای هر درخواست جدید
راه پیشنهادی: Edge Function + [Resend](https://resend.com) و یک Database Webhook.
1. تو Resend دامنه‌ی `vana-management.de` رو تأیید کن و یک API Key بساز.
2. `supabase secrets set RESEND_API_KEY=... NOTIFY_TO=info@vana-management.de`
3. فایل `supabase/functions/neue-anfrage/index.ts`:
   ```ts
   Deno.serve(async (req) => {
     const { record: a } = await req.json();
     await fetch("https://api.resend.com/emails", {
       method: "POST",
       headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
       body: JSON.stringify({
         from: "Website <website@vana-management.de>",
         to: Deno.env.get("NOTIFY_TO"),
         reply_to: a.email,
         subject: `Neue Anfrage: ${a.projektart} – ${a.name}`,
         text: `${a.name} (${a.email}, ${a.telefon ?? "-"})\nOrt: ${a.ort ?? "-"}\n\n${a.nachricht}`,
       }),
     });
     return new Response("ok");
   });
   ```
4. `supabase functions deploy neue-anfrage`
5. **Database → Webhooks → Create**: Table `anfragen`, Event `INSERT`, Type: Supabase Edge Function → `neue-anfrage`.

### ۷. دسترسی برای Claude
برای اینکه Claude خودش جدول رو بسازه و وصل کنه، یکی از این دو کار رو بکن:
- تو claude.ai → **Settings → Connectors → Supabase** با **اکانت Supabase مخصوص VANA** وارد شو (اکانت فعلی مال پروژه‌های aora هست و نباید داده‌ی VANA اونجا بره)، یا
- فقط **Project URL** و **anon key** رو بفرست (این دو تا عمومی‌ان). کلید `service_role` رو نفرست.

---

## Netlify (انتشار)
1. Netlify → **Add new project → Import from Git** → ریپو `mobinakbara-eng/vanatest`
2. Branch: `main` (بعد از merge) · Build command: خالی · Publish directory: `.`
3. **Domain management** → `vana-management.de` و `www.vana-management.de` رو اضافه کن و DNS رو طبق راهنمای Netlify تنظیم کن. HTTPS خودکار فعال می‌شه.
4. اگه دامنه‌ی Supabase عوض شد، `connect-src` تو `netlify.toml` همچنان `*.supabase.co` رو قبول می‌کنه.

---

## قبل از آنلاین شدن ✅
- [ ] جدول Supabase ساخته شد و `config.js` پر شد
- [ ] یک درخواست تستی فرستاده شد و تو Table Editor دیده شد
- [ ] **AVV (Auftragsverarbeitungsvertrag)** با Netlify و Supabase بسته شد (هر دو آنلاین تو تنظیمات اکانت ارائه می‌کنن)
- [ ] Impressum و Datenschutz توسط یک وکیل یا سرویس حقوقی چک شد
- [ ] ایمیل `info@vana-management.de` واقعاً کار می‌کنه
- [ ] دامنه به Netlify وصل شد

## نکته‌ها
- **فونت‌ها** محلی‌ان (`assets/fonts`)، چون لود Google Fonts از سرور گوگل تو آلمان مشکل DSGVO داره.
- سایت **کوکی و ابزار آمار نداره**، پس بنر کوکی لازم نیست. اگه بعداً آمار اضافه شد، بنر و متن Datenschutz باید آپدیت بشن.
- **ضد اسپم:** فیلد مخفی (honeypot) + حداقل ۳ ثانیه روی صفحه + محدودیت‌های دیتابیس. اگه اسپم زیاد شد، Cloudflare Turnstile اضافه کنید.
- **رنگ‌ها و فونت‌ها** همه بالای `assets/css/style.css` تو `:root` تعریف شدن.
