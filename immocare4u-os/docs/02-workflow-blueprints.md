# C. n8n Workflow Blueprints

قرارداد کلی همه‌ی Workflowها:
* **Error Workflow:** همه به WF-14 وصل‌اند (`settings.errorWorkflow`).
* **Idempotency:** هر نوشتن خارجی (ارسال پیام، ساخت کد، تسک) یک `idempotency_key` یکتا دارد و قبل از عمل در DB ثبت می‌شود (*write-ahead*).
* **HTTP به Smoobu:** همیشه از Code node امضا (`smoobu-hmac.js`) + HTTP Request با `retryOnFail (3×, 2s)`؛ برای 429 مقدار `X-RateLimit-Retry-After` رعایت می‌شود. سقف 700 req/min.
* **Test mode:** متغیر `IC_TEST_MODE=true` یعنی هیچ پیام واقعی به مهمان/طرف خارجی ارسال نمی‌شود؛ فقط `outbound_messages.status=DRAFT`.
* **Run log:** هر Workflow زمان‌بندی‌شده یک ردیف در `automation_runs` می‌نویسد.
* **نسخه‌بندی:** JSONها در `n8n/workflows/` با `build-workflows.js` تولید و در Git نگهداری می‌شوند؛ تغییرات در n8n UI باید Export و Commit شوند.

| WF | وضعیت در مخزن |
|---|---|
| WF-00 Connectivity test | **JSON قابل Import** (REQ-VERIFY روی Instance واقعی) |
| WF-02 Webhook receiver | **JSON قابل Import** + شبیه‌سازی تست‌شده |
| WF-14 Error monitor (حداقلی) | **JSON قابل Import** |
| بقیه | Blueprint (این سند) — JSON در فاز مربوطه ساخته می‌شود |

---

### WF-01 — Smoobu Reservation Sync
* **Trigger:** (a) رویدادهای رزرو از WF-02 (`newReservation/updateReservation/cancelReservation/deleteReservation`) — در WF-02 پیاده شده؛ (b) Schedule هر ۱۵ دقیقه برای Reconciliation.
* **Nodes (b):** Schedule → Code(sign `GET /api/reservations?from=today-1&to=today+180&page=n`) → HTTP → Code(normalize, صفحه‌بندی تا `page_count`) → Postgres upsert (همان SQL «Upsert reservation» در WF-02) → Code(diff: رزروهای DB که در پاسخ نیستند) → IF → Telegram «رزرو ناپدید شد».
* **Side effects:** تغییر تاریخ/لغو ← رویداد برای WF-05 (بازبرنامه‌ریزی)، WF-06 (ابطال/اصلاح دسترسی)، WF-07 (جابجایی نظافت).
* **Errors:** 429 → Wait تا Retry-After؛ اختلاف > ۳ رزرو در یک اجرا ← هشدار.

### WF-02 — Guest Message Receiver ✅ JSON
`Webhook POST /smoobu/inbound?token=…` → Authenticate & Key (timing-safe) → IF valid → Inbox (ON CONFLICT DO NOTHING) → **Respond 200** → IF new → Sign/GET reservation → Normalize (حذف PII از raw) → Upsert → IF newMessage → Sign/GET messages → Pick & classify (Rule Engine) → Store message + classification → Mark DONE.
* پیام‌های `sender=host` (پاسخ مدیر از داخل Smoobu) به‌صورت OUTBOUND ذخیره می‌شوند ← پایه‌ی Conflict Prevention در WF-03.
* ملک Map‌نشده ← حداقل REVIEW + پرچم `UNMAPPED_PROPERTY`.
* **پیام بعدی:** فراخوانی WF-03 با `message_pk` (Execute Workflow node، در Phase 2 اضافه می‌شود).

### WF-03 — Guest AI Response Engine
* **Trigger:** Execute Workflow از WF-02 با `{message_pk}`.
* **Nodes:**
  1. Postgres: بارگذاری پیام، رزرو، ملک، ۱۰ پیام آخر گفتگو، طبقه‌بندی Rule.
  2. IF: `reservation.status ∈ {CANCELLED, DELETED}` یا `property_id IS NULL` → مسیر REVIEW.
  3. **Conflict check:** آیا پیام OUTBOUND (HOST/MANAGER) بعد از این پیام وجود دارد؟ یا approval باز برای همین گفتگو؟ → توقف.
  4. Postgres: `SELECT * FROM ic.ai_kb_for_reservation($1, now())` با نقش `ic_ai_reader`.
  5. LLM (HTTP Request به API مدل؛ خروجی JSON با schema): `{level, intent, confidence, language, reply, needs_kb_keys[], manager_summary_fa}`. Prompt: `03-ai-guest-agent-system-prompt.md`.
  6. Code: اعتبارسنجی JSON؛ `combineClassification(rule, ai, {availableKbKeys, propertyAutoEnabled})`؛ فیلتر خروجی (رد پاسخ اگر شامل الگوهای کد/رمز، URLهای خارج از allowlist ملک، یا وعده‌ی مالی باشد).
  7. Switch level:
     * **AUTO** → insert `outbound_messages(origin=AI_AUTO, idempotency_key='reply:'||message_pk)` → IF `IC_TEST_MODE` → DRAFT؛ وگرنه Sign `POST /api/reservations/{id}/messages/send-message-to-guest` body `{"subject": "...", "messageBody": "..."}` → ذخیره پاسخ → SENT/FAILED.
     * **REVIEW/CRITICAL** → WF-04.
     * **EMERGENCY** → WF-14 (alert) + WF-04 (priority) + پیام ایمنی ثابت از Template تأییدشده (۱۱۲/۱۱۰) که حتی در Test mode برای مدیر نمایش داده می‌شود؛ ارسال آن به مهمان طبق تصمیم Phase 2 (پیش‌فرض: پس از تأیید سریع مدیر، با timeout ۲ دقیقه هشدار تلفنی).
* **REQ-VERIFY:** محدودیت‌های کانال برای لینک/فایل در پیام (Airbnb/Booking) — قبل از ارسال لینک ویدیو بررسی شود.

### WF-04 — Human Approval Workflow
جزئیات در `04-approval-channel-design.md`. Nodes: Execute Workflow Trigger → Postgres insert approvals (`expires_at` بر اساس سطح) → Telegram sendMessage (inline keyboard) → ذخیره `telegram_message_id`. Workflow جداگانه‌ی `WF-04b Telegram Callback` (Telegram Trigger) → اعتبارسنجی chat_id در `staff` → قفل ردیف (`UPDATE … WHERE status='PENDING' RETURNING`) → ارسال/ویرایش/رد. Schedule هر ۵ دقیقه: approvals منقضی ← `EXPIRED` + یادآوری/Escalation؛ **هرگز ارسال پیش‌فرض.**

### WF-05 — Scheduled Guest Communication
* **Trigger:** Schedule هر ۵ دقیقه.
* **SQL محوری:** رزروهای CONFIRMED/MODIFIED × `property_message_schedules (enabled)` که `anchor_time + offset` در بازه‌ی `[now-15min, now]` است و `outbound_messages` با کلید `sched:<reservation>:<template>` ندارند.
* Template با متغیرها از KB همان ملک؛ زبان از رزرو/مهمان؛ `requires_access_authorization` ← مسیر WF-06.
* لغو رزرو ← پیام‌های آینده خودبه‌خود حذف می‌شوند چون SQL فقط رزروهای فعال را می‌گیرد.

### WF-06 — Smart Access Control
* **Trigger:** WF-05 (template ACCESS_INFO) + رویداد تغییر/لغو از WF-01.
* **Pre-checks (همه الزامی):** رزرو فعال؛ property_id = ملک قفل؛ زمان ≥ `check_in_at + release_offset`؛ شرایط پرداخت (اگر داده موجود باشد، وگرنه REVIEW)؛ `access_grants` قبلاً DELIVERED نشده.
* **SMART_LOCK:** Adapter (Sub-workflow `ADP-LOCK-<provider>`) با API واقعی: create code(valid_from=check_in−buffer, valid_to=check_out+buffer) → ذخیره `provider_grant_ref` → ارسال.
* **KEY_BOX_FIXED:** کد از Secret Store (نه از AI) → ارسال فقط در پنجره‌ی مجاز.
* **پیام حاوی کد:** `origin=SCHEDULED`, `contains_restricted=true` (Trigger مانع AI_AUTO است).
* **لغو/تغییر:** revoke/update در Provider؛ اگر پشتیبانی نشود ← Ticket SECURITY + Telegram (تعویض کد صندوق).
* **REQ-VERIFY:** انتخاب Provider، قابلیت‌های API (ابطال، زمان‌دار بودن کد، وضعیت باتری).

### WF-07 — Cleaning Task Automation
* **Trigger:** Schedule هر ۱۵ دقیقه + رویداد رزرو.
* SQL: برای هر رزرو با Check-out در ۷ روز آینده، تسک با `UNIQUE(property_id, after_reservation_id)`؛ `deadline` = Check-in بعدی − buffer (یا پایان روز اگر ورودی نیست).
* تخصیص: پرسنل CLEANER ملک (جدول تخصیص در فاز ۴) → Telegram به نظافتچی با دکمه‌های Start/Done/Problem + آپلود عکس.
* هشدار: `now > scheduled_start + 30min` و شروع‌نشده؛ `deadline − 60min` و DONE نشده ← مدیر.
* `verified_ready=true` فقط با تأیید (عکس + چک‌لیست) یا QC مدیر.

### WF-08 — Maintenance Ticket System
* منابع: WF-03 (پیام خرابی حل‌نشده)، Telegram (`/ticket`)، WF-07 (مشکل کشف‌شده).
* `maintenance_tickets` با چرخه‌ی تحمیل‌شده توسط Trigger؛ هزینه > `staff.approval_limit_eur` ← WF-04 (subject `REPAIR_ORDER`).
* Deadline بر اساس priority (URGENT 4h، HIGH 24h، MEDIUM 72h، LOW 7d)؛ یادآوری خودکار.

### WF-09 — Property Acquisition Monitor
* **Trigger:** Schedule **روزی یک بار، 06:47 Europe/Berlin** (تصمیم مدیر 2026-11-04؛ قبلاً هر ۵ ساعت) — گزارش ایمیلی مانیتور (WF-13) بلافاصله پس از آن + **قفل اجرا**: `pg_try_advisory_lock(9009)`؛ اگر false ← خروج.
* **منابع فقط از مسیرهای مجاز (REQ-VERIFY برای هر منبع):** API رسمی/Partner، ایمیل‌های Search Alert پورتال‌ها (Gmail Trigger → Parser)، فیدهای دارای مجوز، وب‌سایت رسمی مدیران املاک با رعایت robots/ToS. **Scraping مخالف ToS طراحی نمی‌شود.**
* خروجی: آیتم‌های خام → WF-10.

### WF-10 — Lead Deduplication & Qualification
1. Normalize: آدرس (حروف کوچک، `str.`→`straße`، حذف فاصله‌ها)، متراژ، اجاره.
2. Match: (a) `(source, listing_id)` یا `url` دقیق → KNOWN/UPDATED؛ (b) Fuzzy: همان `address_norm` + متراژ ±5٪ + اجاره ±10٪ ← ادغام به همان lead (`lead_listings` جدید)؛ (c) در غیر این صورت NEW با `IC-xxx`.
3. تغییرات قیمت/وضعیت → `lead_observations`.
4. ارزیابی اقتصادی (سناریوهای اشغال 50/65/80٪، فرض‌های تاریخ‌دار در `assumptions`) ← `lead_evaluations` (همیشه `is_estimate`).
5. Grade A/B/C؛ `legal_use_status` پیش‌فرض `UNKNOWN` — هیچ‌وقت «مجاز» بدون مدرک.
6. پیش‌نویس ایمیل آلمانی به مالک/مدیر ← `pipeline_stage=AWAITING_APPROVAL` (WF-04، subject `LEAD_CONTACT`). **ارسال خودکار خارجی ممنوع.**

### WF-11 — Google Sheets Synchronization
* Sheet: *ImmoCare4U – Live Objektliste (automatisch)* `1Bjag5HOvOBt1A5OlaxK3RQfgkhSgPW89cRnhWe8A9_s`.
* **مرحله‌ی صفر (یک‌بار):** Export کامل Sheet فعلی → `ic.sheet_import_staging` → تطبیق با leads → گزارش اختلاف برای تأیید → Import. هیچ ردیفی حذف یا بازنویسی بدون تأیید نمی‌شود.
* اجرای عادی: Upsert بر اساس ستون `IC-ID` (Google Sheets node: *Append or Update*، کلید = IC-ID)؛ ستون‌های یادداشت دستی (مثلاً `Notiz`, `Verantwortlich`) فقط Sheet→DB؛ ستون `Last Sync`.

### WF-12 — Financial Data Aggregation
درآمد رزرو از Smoobu (`price`)، کمیسیون پلتفرم (اگر Smoobu بدهد، وگرنه ESTIMATE با نرخ قرارداد کانال)، هزینه‌ها از ورودی دستی/فاکتورها، اجاره از `property_contracts`. هر ردیف `kind=ACTUAL|ESTIMATE` و `source`.

### WF-13 — Reporting Automation
* روزانه 07:10، هفتگی دوشنبه 07:40، ماهانه روز اول 08:10 (Europe/Berlin).
* گیرندگان **فقط** از `report_recipients` با `report_scope` همان گزارش. گزارش مانیتور املاک (`OBJECT_MONITOR`): To aminhassanakbarabadi@gmail.com، CC danilomuller247@gmail.com و mobinakbara@gmail.com، محتوای یکسان. گزارش‌های دیگر تا تعریف و تأیید گیرنده‌ها ارسال نمی‌شوند.
* گزارش‌ها PII مهمان ندارند (نقش `ic_reporting`).

### WF-14 — Error Monitoring & Emergency Alerts ✅ JSON (حداقلی)
Error Trigger → DLQ. فاز ۲: + Telegram به کانال Ops؛ Schedule ساعتی: DLQ باز > ۱h، `webhook_events` در وضعیت RECEIVED > ۱۰ دقیقه، heartbeat هر Workflow زمان‌بندی‌شده (`automation_runs`)، Smoobu health (WF-00 هر ساعت). EMERGENCY: Telegram با priority + تماس تلفنی (سرویس تلفن REQ-VERIFY).

### WF-15 — Property Onboarding
Form (n8n Form Trigger) یا Sheet قالب → ایجاد `properties` (PROSPECT) → قرارداد + آیتم‌های Compliance پیش‌فرض بر اساس شهر → چک‌لیست KB (`property-template.yaml`) → آپلود مدارک → بازبینی → `READY_FOR_TEST` → تست پیام‌ها → `ACTIVE` (Trigger DB شرایط را اجباری می‌کند).

### WF-16 — Review & Guest Feedback Management
درخواست Feedback (از WF-05)؛ دریافت نظرات **فقط از طریق API/کانال مجاز** (REQ-VERIFY: Smoobu/Channel review access)؛ پیش‌نویس پاسخ ← همیشه WF-04 (نظر عمومی = خروجی عمومی).
