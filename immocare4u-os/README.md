# ImmoCare4U OS — Property & Hospitality Operating System

پایه‌ی فنی سیستم عملیاتی ImmoCare4U: **Growth Engine** (جذب ملک) + **Operations Engine** (مهمان، رزرو، دسترسی، نظافت، نگهداری، مالی) روی یک لایه‌ی داده‌ی مشترک.

> **وضعیت کلی: PLANNED / در حال ساخت Phase 1.** هیچ بخشی هنوز روی n8n یا Smoobu واقعی اجرا نشده است. کد و SQL با تست‌های خودکار محلی تأیید شده‌اند (۳۱ تست Node + ۱۵ تست DB).

## وضعیت اجزا

| جزء | فایل | وضعیت |
|---|---|---|
| اسکیمای دیتابیس + Guard rails | `db/migrations/001_foundation.sql` | تست‌شده محلی · PLANNED برای استقرار |
| داده‌ی ملک آزمایشی (placeholder) | `db/seeds/001_test_property.sql` | PLANNED |
| امضای HMAC اسموبو | `n8n/lib/smoobu-hmac.js` | تست‌شده با الگوریتم مستند · REQ-VERIFY با کلید واقعی |
| Rule Engine طبقه‌بندی پیام | `n8n/lib/classifier.js` | تست‌شده · نیازمند تنظیم با پیام‌های واقعی |
| WF-00 تست اتصال Smoobu | `n8n/workflows/WF-00-…json` | قابل Import · REQ-VERIFY |
| WF-02 دریافت Webhook | `n8n/workflows/WF-02-…json` | قابل Import · شبیه‌سازی تست‌شده · REQ-VERIFY |
| WF-14 خطا → DLQ | `n8n/workflows/WF-14-…json` | قابل Import · PLANNED |
| بقیه‌ی WFها (01, 03–13, 15, 16) | `docs/02-workflow-blueprints.md` | Blueprint |

## اسناد (Deliverables A–K)

| | سند |
|---|---|
| A, K + Gap + KPIs | [docs/01-architecture-gap-roadmap.md](docs/01-architecture-gap-roadmap.md) |
| B | [db/migrations/001_foundation.sql](db/migrations/001_foundation.sql) |
| C | [docs/02-workflow-blueprints.md](docs/02-workflow-blueprints.md) + `n8n/workflows/` |
| D | [docs/03-ai-guest-agent-system-prompt.md](docs/03-ai-guest-agent-system-prompt.md) |
| E | [knowledge-base/property-template.yaml](knowledge-base/property-template.yaml) |
| F | [docs/04-telegram-approval-design.md](docs/04-telegram-approval-design.md) |
| G | [docs/05-dashboard-spec.md](docs/05-dashboard-spec.md) |
| H | [docs/06-testing-plan.md](docs/06-testing-plan.md) |
| I | [docs/07-security-compliance-checklist.md](docs/07-security-compliance-checklist.md) |
| J | [docs/08-cost-scalability.md](docs/08-cost-scalability.md) |
| Phase 1 گام‌به‌گام | [docs/09-phase1-runbook.md](docs/09-phase1-runbook.md) |

## ⚠️ یافته‌ی فوری
طبق مستندات رسمی Smoobu (docs.smoobu.com، خوانده‌شده 2026-11-03)، هدر `Api-Key` **از 2026-10-31 منسوخ است**. هر اتصال موجود با این هدر باید به HMAC-SHA256 (`X-API-Key`, `X-Timestamp`, `X-Nonce`, `X-Signature`) مهاجرت کند — پیاده‌سازی در `n8n/lib/smoobu-hmac.js`.

## اجرای تست‌ها
```bash
./tests/run-all.sh
```
نیازمند Node ≥ 18 و PostgreSQL (initdb/pg_ctl/psql). یک دیتابیس موقت می‌سازد و پس از اجرا حذف می‌کند.

## تولید Workflowها
Code nodeها از کتابخانه‌های تست‌شده تولید می‌شوند — JSONها را دستی ویرایش نکنید:
```bash
node n8n/build-workflows.js
```

## اصول غیرقابل‌مذاکره
Automation first, human control when necessary · هیچ ارسال خارجی حساس بدون Approval · AI بدون دسترسی به اسرار و فقط داده‌ی همان ملک · Rule Engine تعیین‌کننده‌ی حداقل سطح · همه‌چیز Idempotent · ملک بدون Compliance تأییدشده فعال نمی‌شود (در DB اجباری شده).
