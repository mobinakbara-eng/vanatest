# I. Security & Compliance Checklist

> این فهرست مشاوره‌ی حقوقی نیست؛ موارد حقوقی باید توسط وکیل/مشاور متخصص در Mietrecht و Zweckentfremdungsrecht تأیید شوند.

## فنی
- [ ] Secrets فقط در n8n Credentials / env / Secret Manager؛ هیچ کلیدی در Prompt، Sheet، Git یا گزارش (`git grep -i "api[-_]key"` در CI)
- [ ] Smoobu HMAC؛ Webhook token ≥ 32 کاراکتر تصادفی؛ چرخش هر ۹۰ روز (`PATCH /api/users/webhooks/{id}`)
- [ ] HTTPS برای n8n با TLS معتبر؛ UI n8n پشت VPN/IP allowlist یا SSO + 2FA
- [ ] نقش‌های DB: `ic_n8n`، `ic_ai_reader`، `ic_reporting`؛ کاربر superuser فقط برای Migration
- [ ] رمزنگاری at-rest دیتابیس و Backup؛ Backup روزانه + PITR؛ **تست بازیابی ماهانه**
- [ ] `audit_log` فقط Append (REVOKE UPDATE/DELETE انجام شده)
- [ ] Rate-limit و حداکثر اندازه‌ی Body روی Webhook (Reverse proxy)
- [ ] ساعت سرور با NTP (پیش‌نیاز HMAC ±5min)
- [ ] n8n: `N8N_ENCRYPTION_KEY` پشتیبان‌گیری‌شده؛ نسخه به‌روز؛ Community nodes فقط بررسی‌شده
- [ ] لینک‌های ویدیو/راهنما: URL امضاشده یا Guest Guide Smoobu، بدون فهرست عمومی
- [ ] کدهای ورود: هرگز در `messages.body` به‌صورت قابل‌جستجو باقی نمانند → پس از Check-out ماسک شوند (Job روزانه)

## GDPR / DSGVO
- [ ] Verzeichnis von Verarbeitungstätigkeiten (Art. 30) برای: رزرو، ارتباط با مهمان، دسترسی، Leads
- [ ] AVV/DPA با: Smoobu، ارائه‌دهنده‌ی n8n/Hosting، LLM، Telegram (REQ-VERIFY: امکان DPA؛ در صورت نبود، هیچ PII مهمان در Telegram جز نام کوچک)، Google Workspace، Lock provider
- [ ] انتقال خارج از EU: SCC/Adequacy برای هر Vendor
- [ ] Data minimisation: حذف PII از `reservations.raw` (پیاده شده در WF-02)؛ فقط نام کوچک به LLM
- [ ] Retention: پیام‌ها و داده‌ی مهمان `erase_after` (پیشنهاد: ۱۲ ماه پس از خروج، مگر الزامات مالیاتی ۶/۱۰ ساله برای اسناد مالی) — Job حذف ماهانه
- [ ] اطلاع‌رسانی Datenschutzerklärung سایت درباره‌ی پردازش خودکار و AI
- [ ] فرآیند حقوق موضوع داده (دسترسی/حذف) ظرف ۳۰ روز
- [ ] Incident response: گزارش نقض داده ظرف ۷۲ ساعت (Art. 33) — Runbook و مسئول مشخص

## حقوقی/عملیاتی برای هر ملک (Gate فعال‌سازی، `property_compliance_items`)
- [ ] **Berlin:** Zweckentfremdungsverbot-Gesetz — Genehmigung یا استثنا، و **Registriernummer** که باید در آگهی‌ها نمایش داده شود
- [ ] **Köln / Düsseldorf:** Wohnraumschutzsatzung محلی — مجوز/شماره ثبت (REQ-VERIFY مقررات جاری هر شهر)
- [ ] Nutzungsänderung / Baugenehmigung برای واحدهای تجاری (کاربری تجاری ≠ مجوز اقامت)
- [ ] Brandschutz (دتکتور دود، مسیر فرار، الزامات Beherbergungsstätten در صورت ظرفیت بالا)
- [ ] Untervermietungserlaubnis کتبی مالک (Model B/D) و اجازه‌ی WEG در صورت لزوم
- [ ] Meldepflicht / Beherbergungsstatistik و City Tax (Übernachtungsteuer برلین) — فرآیند جمع‌آوری و پرداخت
- [ ] بیمه‌ی مسئولیت و محتوا
- [ ] قرارداد همکاری: حقوق، تعهدات، ساختار هزینه/درآمد ثبت در `property_contracts`

## AI-specific
- [ ] Rule Engine اول، LLM فقط افزایش سطح (تست‌شده)
- [ ] AI بدون دسترسی به اسرار (نقش `ic_ai_reader` + View فیلترشده — تست‌شده)
- [ ] فیلتر خروجی برای کد/رمز/وعده‌ی مالی/URL
- [ ] ممیزی هفتگی نمونه‌ی پاسخ‌ها؛ هر خطای CRITICAL = Incident
- [ ] EU AI Act: سیستم شفاف (مهمان بداند پاسخ ممکن است خودکار باشد — متن در پیام خوشامد/Hausordnung)
