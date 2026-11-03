# Phase 1 Runbook — Foundation (اولین مرحله‌ی قابل‌تست)

هر گام یک معیار پذیرش دارد. تا همه‌ی گام‌ها PASS نشوند، Phase 2 شروع نمی‌شود. نتایج در `docs/audit-YYYY-MM-DD.md` ثبت شوند.

## گام 1.1 — Audit (بدون تغییر در سیستم)
1. n8n: نسخه (`Settings → About`)، Hosting، فهرست Workflowها (نام، فعال/غیرفعال، Trigger، آخرین اجرای موفق)، Credentialها (فقط نام و نوع).
2. هر Workflowی که Smoobu را صدا می‌زند: آیا هدر `Api-Key` دارد؟ ← **فوری**: از 2026-10-31 منسوخ است؛ در فهرست «نیازمند مهاجرت به HMAC» ثبت شود.
3. Smoobu: `Settings → API` — وجود API Key و API Secret (HMAC)؛ Webhookهای ثبت‌شده (پس از گام 1.3 با WF-00 یا `GET /api/users/webhooks`).
4. Google Sheet `1Bjag5HOvOBt1A5OlaxK3RQfgkhSgPW89cRnhWe8A9_s`: نام برگه‌ها، ستون‌ها، تعداد ردیف، وجود ستون شناسه (IC-xxx)، تکراری‌ها، Workflow نویسنده.
5. مانیتور املاک فعلی: منابع، روش دسترسی (API/ایمیل Alert/Scraping) و انطباق با ToS.

**پذیرش:** سند Audit با برچسب EXISTING / REQ-VERIFY برای هر مورد.

## گام 1.2 — PostgreSQL
```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_foundation.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seeds/001_test_property.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/db_guardrails_test.sql   # فقط روی DB staging! داده‌ی تست می‌سازد
```
سپس کاربر ورود برای n8n:
```sql
CREATE ROLE n8n_app LOGIN PASSWORD '<from secret manager>' IN ROLE ic_n8n;
```
**پذیرش:** 15/15 PASS روی staging؛ Backup خودکار فعال و یک بازیابی آزمایشی انجام شده.

## گام 1.3 — n8n آماده‌سازی و WF-00
متغیرهای محیطی Instance:
```
NODE_FUNCTION_ALLOW_BUILTIN=crypto
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
SMOOBU_API_KEY=…            # از Smoobu → Settings → API
SMOOBU_API_SECRET=…         # HMAC secret
SMOOBU_WEBHOOK_TOKEN=…      # openssl rand -hex 32
IC_TEST_MODE=true
GENERIC_TIMEZONE=Europe/Berlin
```
> اگر سیاست شما خواندن env در Code node را نمی‌پذیرد، جایگزین: n8n External Secrets (نسخه‌ی Enterprise) یا یک Sub-workflow امضا. در هر حال کلیدها هرگز داخل JSON Workflow ذخیره نمی‌شوند.

### مسیر n8n Cloud (Trial یا پلن پولی)
* در Trial رایگان، **n8n API در دسترس نیست**؛ Import دستی: Workflows → ⋯ → **Import from File** (یا Ctrl+V محتوای JSON روی Canvas).
* Environment Variable در Cloud قابل تنظیم نیست؛ Workflowها کلیدها را از **Settings → Variables** می‌خوانند (`$vars`): `SMOOBU_API_KEY`, `SMOOBU_API_SECRET`, `SMOOBU_WEBHOOK_TOKEN`. اگر منوی Variables در پلن شما نیست، به Claude اطلاع دهید تا روش جایگزین ساخته شود.
* `require('crypto')` در Code node کلاود مجاز است (REQ-VERIFY با اجرای WF-00).
* PostgreSQL باید خارجی باشد (مثلاً Supabase در ریجن EU)؛ اتصال با Credential «ImmoCare4U Postgres».

1. Credential Postgres با نام دقیق **ImmoCare4U Postgres** بسازید (کاربر `n8n_app`).
2. Import: `n8n/workflows/WF-14-error-monitor-minimal.json`، سپس `WF-00`، سپس `WF-02`. در هر Postgres node Credential را دوباره انتخاب کنید (شناسه‌ی `REPLACE_WITH_CREDENTIAL_ID` placeholder است).
3. در WF-02 → Settings → Error workflow = WF-14.
4. WF-00 را دستی اجرا کنید.

**پذیرش:** خروجی `passed: true`، `statusCode: 200`، فهرست آپارتمان‌ها؛ `SELECT status FROM ic.integrations WHERE integration_code='SMOOBU_API_HMAC'` = `EXISTING`. اگر 401: کلید/Secret، فعال بودن HMAC، ساعت سرور (±5 دقیقه).

## گام 1.4 — Mapping ملک
```sql
UPDATE ic.properties SET smoobu_apartment_id = <id از WF-00>, internal_name = '<نام>' WHERE property_id = 'P-BER-001';
```
**پذیرش:** هر آپارتمان Smoobu یا Map شده یا در Audit به‌عنوان «خارج از دامنه» ثبت شده.

## گام 1.5 — Webhook
1. WF-02 را Activate کنید. Production URL: `https://<n8n-host>/webhook/smoobu/inbound?token=<SMOOBU_WEBHOOK_TOKEN>`.
2. قبل از ثبت، Webhookهای فعلی Smoobu را بررسی کنید (ممکن است Workflow دیگری به آن وابسته باشد — **حذف نکنید** بدون بررسی). ثبت: `POST /api/users/webhooks` با `{"webhookUrl": "<URL>"}` (یا از UI Smoobu).
3. تست‌ها:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://<host>/webhook/smoobu/inbound" -H 'Content-Type: application/json' -d '{"action":"newMessage","data":{"id":1}}'   # انتظار 401
   ```
   * در Smoobu یک رزرو تست (Direct/Blocked روی ملک آزمایشی) بسازید و از طرف مهمان پیام «What time is check-out?» بفرستید (یا از Smoobu guest portal).
   * `SELECT * FROM ic.webhook_events ORDER BY event_id DESC LIMIT 5;` و `SELECT m.body, c.level, c.intent FROM ic.messages m JOIN ic.message_classifications c USING (message_pk);`
   * اجرای مجدد همان Execution در n8n («Retry») ← تعداد ردیف‌ها تغییر نکند.
   * خطای عمدی (مثلاً Secret اشتباه موقت) ← ردیف در `ic.dead_letter_events`.

**پذیرش:** هر ۴ تست PASS. **REQ-VERIFY باقی‌مانده:** نام دقیق فیلدهای پیام در پاسخ `GET /messages` (`message`/`htmlMessage`/`type`) و مقدار `sender` — با اولین Payload واقعی بررسی و در صورت نیاز `n8n/build-workflows.js` اصلاح شود.

## گام 1.6 — KB ملک آزمایشی
`knowledge-base/property-template.yaml` را برای P-BER-001 کامل کنید؛ اسرار در Secret Store؛ سپس ورود به `ic.property_kb_entries` (در Phase 1 با SQL دستی، از Phase 4 با WF-15).

**پذیرش:** همه کلیدهای `guest_info` و `entrance` ضروری با `validity=VERIFIED`؛ `SELECT * FROM ic.ai_kb_for_reservation(<test reservation>)` هیچ ردیف RESTRICTED برنمی‌گرداند.

## Fallback دستی (همیشه معتبر)
اگر n8n یا AI قطع شود: پیام‌ها مستقیماً در Smoobu Inbox پاسخ داده می‌شوند؛ کدهای ورود از Secret Store توسط مدیر؛ پس از بازگشت سیستم، Reconciliation (WF-01) اجرا و رویدادهای `FAILED` از DLQ بازپخش می‌شوند. WF-03 به‌دلیل Conflict check به پیام‌هایی که مدیر پاسخ داده، پاسخ نمی‌دهد.
