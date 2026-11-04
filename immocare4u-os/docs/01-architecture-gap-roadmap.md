# ImmoCare4U OS — معماری، تحلیل شکاف و نقشه اجرا

> نسخه 0.1 · 2026-11-03 · وضعیت سند: **PLANNED**
> برچسب‌ها در کل سند: **EXISTING** = پیاده‌سازی و تأیید شده · **PLANNED** = طراحی شده، اجرا نشده · **REQ-VERIFY** = وابسته به API، مجوز، قرارداد یا دسترسی تأییدنشده

---

## 0. خلاصه مدیریتی

* چیزی که امروز در این مخزن **واقعاً وجود دارد**: وب‌سایت (قالب WordPress/HTML) و این بسته‌ی پایه‌ی OS: اسکیمای دیتابیس، کتابخانه امضای HMAC اسموبو، Rule Engine طبقه‌بندی پیام و سه Workflow قابل Import برای n8n. همه با تست محلی (۳۱ تست موفق). **هیچ‌کدام هنوز روی n8n یا Smoobu واقعی اجرا نشده‌اند.**
* یک یافته‌ی فوری از مستندات رسمی Smoobu (خوانده‌شده در 2026-11-03): هدر قدیمی `Api-Key` **از 2026-10-31 منسوخ شده است**. اگر Workflowهای فعلی شما (مثلاً مانیتور املاک یا هر اتصال Smoobu) هنوز از `Api-Key` استفاده می‌کنند، احتمالاً همین حالا از کار افتاده‌اند یا به‌زودی می‌افتند. احراز هویت جدید HMAC-SHA256 با هدرهای `X-API-Key`، `X-Timestamp`، `X-Nonce` و `X-Signature` است (پیاده‌سازی و تست‌شده در `n8n/lib/smoobu-hmac.js`).
* در مستندات Smoobu هیچ امضایی برای **Webhookهای خروجی** توضیح داده نشده است. بنابراین امنیت Webhook با توکن مخفی ۳۲+ کاراکتری در URL، مقایسه‌ی timing-safe، صندوق ورودی Idempotent و Reconciliation دوره‌ای تأمین می‌شود (REQ-VERIFY: با پشتیبانی Smoobu استعلام شود).

---

## A. معماری کامل سیستم

### A.1 نمای لایه‌ای

```
┌──────────────────────────── Channels ─────────────────────────────┐
│  Airbnb · Booking.com · Direct · (pre-booking inquiries: separate) │
└───────────────┬────────────────────────────────────────────────────┘
                │ (channel APIs, managed by Smoobu)
┌───────────────▼──────────────┐       ┌──────────────────────────────┐
│ Smoobu (Channel Manager)     │◄─────►│ Smart-Lock Provider (adapter)│ REQ-VERIFY
│ reservations · messages ·    │       └──────────────────────────────┘
│ rates · guest guide          │
└───────┬──────────────▲───────┘
 webhooks│ (token URL)  │ REST + HMAC-SHA256
┌───────▼──────────────┴──────────────────────────────────────────────┐
│                         n8n (Orchestration)                         │
│  Ingress: WF-01/02  · Brain: WF-03 · Control: WF-04 · Schedules:    │
│  WF-05/06/07 · Ops: WF-08 · Growth: WF-09/10/11 · Finance/Reports:  │
│  WF-12/13 · Reliability: WF-14 · Lifecycle: WF-15/16                │
└──┬─────────────┬───────────────┬───────────────┬────────────────────┘
   │             │               │               │
┌──▼───────┐ ┌───▼─────────┐ ┌───▼──────────┐ ┌──▼───────────────────┐
│PostgreSQL│ │ LLM API     │ │ Telegram Bot │ │ Google Sheets / Email│
│ (SoT)    │ │ classify +  │ │ approvals,   │ │ management views,    │
│ schema ic│ │ draft only  │ │ alerts       │ │ reports              │
└──┬───────┘ └─────────────┘ └──────────────┘ └──────────────────────┘
   │
┌──▼──────────────────────┐   ┌───────────────────────────────┐
│ Secret Store            │   │ Media storage / Guest guide   │
│ (Vault / n8n creds /    │   │ (signed URLs per property)    │
│ env) — codes, Wi-Fi pw  │   └───────────────────────────────┘
└─────────────────────────┘
```

### A.2 اصول کلیدی

| اصل | پیاده‌سازی |
|---|---|
| یک منبع حقیقت | PostgreSQL (`schema ic`) منبع اصلی است؛ Google Sheets فقط نمای همگام‌شده است. Smoobu منبع حقیقت **رزرو** است و دیتابیس با Reconciliation با آن تطبیق می‌شود. |
| مرز ملک (Tenant Boundary) | همه جداول ملکی `property_id` دارند؛ Trigger `check_outbound_guard` ارسال پیام با `property_id` متفاوت از رزرو را رد می‌کند. AI فقط از `ai_kb_for_reservation()` داده می‌گیرد. |
| اسرار جدا از داده | کد ورود، رمز Wi-Fi و کلیدها در Secret Store؛ دیتابیس فقط `secret_ref` نگه می‌دارد. AI هرگز به اسرار دسترسی ندارد؛ تزریق اسرار بعد از تأیید و در لایه Workflow انجام می‌شود (WF-06). |
| کنترل در لایه Workflow، نه در Prompt | سطح پیام را Rule Engine تعیین می‌کند و LLM فقط می‌تواند آن را **بالا** ببرد. ارسال خودکار فقط با `autoSendAllowed=true` و `test_mode=false`. |
| Idempotency همه‌جا | `webhook_events.idempotency_key`، `messages.smoobu_message_id`، `outbound_messages.idempotency_key`، `access_grants (reservation_id, method)`، `cleaning_tasks (property_id, after_reservation_id)`. |
| فعال‌سازی مشروط | Trigger `check_property_activation`: ملک بدون چک‌لیست حقوقی تأییدشده و قرارداد معتبر با اجازه‌ی اجاره مجدد و کوتاه‌مدت، `ACTIVE` نمی‌شود. |
| پیکربندی جدا از منطق | زمان‌بندی پیام‌ها، ساعت ورود/خروج، منطقه زمانی و قفل، تنظیمات هر ملک هستند (`property_message_schedules`، `properties`). |

### A.3 جریان داده‌ی اصلی: پیام مهمان

```
Smoobu newMessage ──► WF-02: token ✔ ─► inbox (ON CONFLICT DO NOTHING) ─► HTTP 200
                                   └─► GET reservation (HMAC) ─► upsert reservation (property mapping)
                                   └─► GET messages (HMAC) ─► store message ─► Rule Engine level
                                                                              │
WF-03 (Phase 2) ◄──────────────────────────────────────────────────────────────┘
   ├─ conflict check: manager replied after this message? → stop
   ├─ KB lookup: ai_kb_for_reservation(reservation_id, now())
   ├─ LLM: {level, confidence, language, draft}  (no secrets in context)
   ├─ combineClassification(rule, ai, {kbKeys, propertyAutoEnabled})
   ├─ AUTO  → outbound_messages(AI_AUTO) → send (only if IC_TEST_MODE=false)
   ├─ REVIEW/CRITICAL → approvals + Telegram (WF-04)
   └─ EMERGENCY → Telegram alert + call escalation + safe guest template (112/110)
```

### A.4 مسئولیت داده‌ها (Data Ownership)

| داده | مالک/منبع | مقصد | همگام‌سازی |
|---|---|---|---|
| رزرو، کانال، تاریخ‌ها | Smoobu | `ic.reservations` | Webhook + Reconciliation هر ۱۵ دقیقه (WF-01) |
| پیام‌های رزرو | Smoobu | `ic.messages` | Webhook `newMessage` + Reconciliation |
| پیام‌های قبل از رزرو (Inquiry) | کانال‌ها | — | **REQ-VERIFY**: Smoobu الزاماً منتقل نمی‌کند؛ تا اطلاع ثانوی دستی |
| اطلاعات ملک و KB | مدیر عملیات (WF-15) | `ic.property_kb_entries` | ویرایش کنترل‌شده با `source` و `verified_at` |
| کدهای ورود | Lock provider / Secret Store | `ic.access_grants.secret_ref` | WF-06 |
| آگهی‌های ملکی | پورتال‌ها (فقط روش‌های مجاز) | `ic.leads*` | WF-09/10 |
| نمای مدیریتی آگهی‌ها | `ic.leads` | Google Sheet `1Bjag5HO…A9_s` | WF-11 (یک‌طرفه DB→Sheet + ستون‌های یادداشت دستی Sheet→DB) |
| مالی | Smoobu (درآمد رزرو)، فاکتورها، قراردادها | `ic.financial_entries` با `kind=ACTUAL/ESTIMATE` | WF-12 |

---

## شکاف میان وضعیت فعلی و سیستم هدف (Gap Analysis)

| حوزه | وضعیت فعلی (قابل‌مشاهده در مخزن) | هدف | شکاف / اقدام | برچسب |
|---|---|---|---|---|
| n8n | ناشناخته؛ در مخزن نیست | Instance پایدار با Backup، Queue mode در مقیاس | Audit: نسخه، Hosting، Workflowهای فعلی، Credentialها | REQ-VERIFY |
| Smoobu API | ناشناخته | HMAC-SHA256 | بررسی فوری Workflowهایی که `Api-Key` دارند؛ اجرای WF-00 | REQ-VERIFY |
| Smoobu Webhook | ناشناخته | `POST /api/users/webhooks` با URL توکن‌دار | ثبت URL جدید WF-02؛ بررسی Webhookهای ثبت‌شده‌ی قبلی (`GET /api/users/webhooks`) | REQ-VERIFY |
| دیتابیس | فقط اسکیما در مخزن (تست محلی) | PostgreSQL مدیریت‌شده در EU | استقرار، Backup، نقش‌ها | PLANNED |
| Object Monitor + Google Sheet | توصیف در Master Prompt؛ پیاده‌سازی واقعی دیده نشده | WF-09/10/11 با Dedup و تاریخچه | Audit ستون‌ها و رکوردهای موجود، پاک‌سازی، Import بدون حذف | REQ-VERIFY |
| گزارش ایمیلی مانیتور | توصیف شده | ۳ گیرنده‌ی مجاز، گزارش یکسان | در `report_recipients` ثبت شده؛ ارسال در WF-13 | PLANNED |
| AI Guest Agent | وجود ندارد | WF-03 + Prompt + Rule Engine | Rule Engine و Prompt آماده؛ اتصال LLM | PLANNED |
| Telegram Approval | وجود ندارد | WF-04 | ساخت Bot، ثبت chat_idهای مجاز | PLANNED |
| Smart Lock | نوع قفل/ارائه‌دهنده نامشخص | Adapter با API واقعی | انتخاب ارائه‌دهنده و تأیید API | REQ-VERIFY |
| Compliance هر ملک | نامشخص | چک‌لیست قبل از ACTIVE | جمع‌آوری مدارک (Zweckentfremdung، Registriernummer، اجازه‌ی اجاره مجدد) | REQ-VERIFY |
| داشبورد | وجود ندارد | داشبورد واحد | پس از جمع‌شدن داده (Phase 6) | PLANNED |

---

## K. نقشه اجرا (Deployment Roadmap) با معیار پذیرش

ترتیب بر اساس وابستگی‌ها است؛ هر فاز فقط پس از پذیرش فاز قبل شروع می‌شود. **همه‌ی خروجی‌های حساس تا پایان فاز ۷ با `IC_TEST_MODE=true` یا Draft اجرا می‌شوند، مگر برای ملکی که صراحتاً تأیید شده باشد.**

### Phase 1 — Foundation (هفته ۱–۲) ← *اولین مرحله قابل‌تست؛ در این مخزن شروع شده*

| # | کار | خروجی | معیار پذیرش |
|---|---|---|---|
| 1.1 | Audit سیستم موجود | `docs/audit-YYYY-MM-DD.md` (قالب در Runbook) | فهرست کامل Workflowها، Credentialها (بدون مقدار)، Webhookهای Smoobu، ستون‌های Sheet؛ برای هر مورد برچسب EXISTING/REQ-VERIFY |
| 1.2 | استقرار PostgreSQL | `001_foundation.sql` اجرا شده | `tests/db_guardrails_test.sql` روی DB واقعی: ۱۵/۱۵ PASS |
| 1.3 | اتصال Smoobu با HMAC | WF-00 | اجرای WF-00 → `passed=true`، HTTP 200، فهرست آپارتمان‌ها؛ ردیف `SMOOBU_API_HMAC` در `ic.integrations` به `EXISTING` تغییر کند |
| 1.4 | Mapping ملک | ردیف `P-BER-001` با `smoobu_apartment_id` واقعی | هر آپارتمان فعال Smoobu یا Map شده یا در فهرست «Unmapped» ثبت شده |
| 1.5 | Webhook | WF-02 فعال، URL توکن‌دار در Smoobu | (a) درخواست بدون توکن → 401؛ (b) پیام آزمایشی از رزرو تست → ردیف در `messages` با طبقه‌بندی؛ (c) ارسال دوباره همان Payload → فقط یک ردیف؛ (d) خطای عمدی → ردیف در `dead_letter_events` |
| 1.6 | KB ملک آزمایشی | ورود داده‌ی واقعی با `knowledge-base/property-template.yaml` | همه فیلدهای ضروری با `validity=VERIFIED`؛ اسرار فقط با `secret_ref` |

### Phase 2 — Guest Messaging MVP (هفته ۳–۴)
وابسته به: 1.3، 1.5، 1.6
* WF-03 (LLM + KB + combineClassification)، WF-04 (Telegram)، WF-14 با اعلان Telegram.
* **پذیرش:** روی ۵۰ پیام آزمایشی برچسب‌خورده (از سناریوهای `06-testing-plan.md`): ۰ مورد نشت داده بین ملک‌ها، ۰ مورد ارسال خودکار پیام CRITICAL/EMERGENCY، ≥ ۹۵٪ دقت سطح برای پیام‌های EMERGENCY/CRITICAL (Recall)، تأیید/ویرایش/رد در Telegram ثبت‌شده در `approvals` و `audit_log`؛ ۲ هفته Shadow Mode (پیش‌نویس بدون ارسال) قبل از روشن‌کردن `ai_auto_reply_enabled` برای ملک آزمایشی.

### Phase 3 — Check-in Automation (هفته ۵–۶)
وابسته به: Phase 2، انتخاب Lock provider
* WF-05، WF-06، لغو/تغییر رزرو → بازبینی دسترسی.
* **پذیرش:** ۱۰ رزرو تست: هر پیام زمان‌بندی‌شده دقیقاً یک بار (Idempotency)، اطلاعات دسترسی هرگز قبل از `release_offset`؛ لغو رزرو ← ابطال کد در ≤ ۵ دقیقه (اگر Provider پشتیبانی کند)؛ گزارش تحویل برای هر ارسال.

### Phase 4 — Operations (هفته ۷–۸)
* WF-07، WF-08، تخصیص پرسنل، اعلان‌ها.
* **پذیرش:** هر Check-out ← یک Cleaning Task (بدون تکرار)؛ هشدار تأخیر قبل از Deadline؛ وضعیت Ready فقط با `verified_ready`؛ Ticket با هزینه بدون Approval به `IN_PROGRESS` نمی‌رود (Trigger تست‌شده).

### Phase 5 — Acquisition & Reporting (هفته ۹–۱۰، قابل اجرا موازی با فاز ۳–۴)
* WF-09، WF-10، WF-11، WF-13 (گزارش مانیتور به ۳ گیرنده‌ی مجاز).
* **پذیرش:** اجرای **روزی یک بار** (تصمیم مدیر 2026-11-04) بدون اجرای هم‌زمان (Lock)؛ آگهی تکراری از دو پورتال به یک `lead_code` نگاشت شود؛ تغییر قیمت در `lead_observations`؛ Sheet بدون حذف رکوردهای قبلی؛ ایمیل فقط به ۳ گیرنده‌ی جدول `report_recipients`.

### Phase 6 — Advanced Management (هفته ۱۱–۱۴)
داشبورد (`05-dashboard-spec.md`)، Analytics هر ملک، QC خودکار، آماده‌سازی چندشهری.

### Phase 7 — Production Hardening (موازی، اتمام قبل از مقیاس > ۱۰ واحد)
`07-security-compliance-checklist.md` ۱۰۰٪، تست بازیابی Backup، تست خرابی، بازبینی دسترسی‌ها.

---

## شاخص‌های موفقیت (Success Metrics)

Baseline در هفته اول بهره‌برداری (Shadow Mode) اندازه‌گیری می‌شود؛ تا آن زمان «ناموجود» است — عدد ساختگی ثبت نمی‌کنیم. تعریف‌ها در جدول `ic.kpi_definitions` ثبت می‌شوند.

| KPI | تعریف / روش محاسبه | منبع | دوره | هدف اولیه |
|---|---|---|---|---|
| Auto-resolution rate | پیام‌های AUTO ارسال‌شده بدون پیام بعدی مدیر در ۲۴h ÷ کل پیام‌های ورودی مهمان | messages, outbound_messages | هفتگی | ≥ 40٪ پس از Phase 2، ≥ 60٪ پس از Phase 3 |
| Answer accuracy | پاسخ‌های صحیح ÷ نمونه‌ی ممیزی‌شده (حداقل ۳۰ پیام/هفته) | audit sample | هفتگی | ≥ 98٪ |
| Critical recall | پیام‌های CRITICAL/EMERGENCY درست‌تشخیص‌داده‌شده ÷ کل این پیام‌ها در نمونه | audit sample | ماهانه | 100٪ (هر خطا = Incident) |
| Median first response time | میانه‌ی (اولین پاسخ − زمان پیام مهمان) | messages | روزانه | < 5 دقیقه برای AUTO؛ < 30 دقیقه برای REVIEW در ساعات کاری |
| Access delivery success | ارسال موفق اطلاعات ورود قبل از Check-in ÷ رزروهای Check-in | access_grants | هفتگی | 100٪ |
| Security incidents | افشای کد یا داده‌ی ملک دیگر | audit_log/incidents | ماهانه | 0 |
| Ready before check-in | ورودهایی با `verified_ready` قبل از Check-in ÷ کل ورودها | cleaning_tasks | هفتگی | ≥ 98٪ |
| Manager minutes / reservation | زمان ثبت‌شده‌ی دخالت مدیر ÷ رزروها | approvals (decided_at − requested_at) + لاگ دستی | ماهانه | کاهش ۵۰٪ نسبت به Baseline |
| Cost per stay | هزینه عملیاتی (ACTUAL) ÷ اقامت‌ها | financial_entries | ماهانه | روند نزولی |
| Occupancy & profit / unit | شب‌های رزرو ÷ شب‌های قابل‌فروش؛ سود ACTUAL | reservations, financial_entries | ماهانه | طبق Business Case هر ملک |
| Lead time-to-evaluation | زمان First Seen تا ثبت `lead_evaluations` | leads | هفتگی | < 24h برای Grade A |
| Failed/duplicate workflows | ردیف‌های DLQ + تکراری‌های مسدودشده | dead_letter_events, automation_runs | روزانه | DLQ حل‌نشده > 24h = 0 |
