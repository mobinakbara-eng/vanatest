# F. Telegram Approval Design

## کانال‌ها
| چت | اعضا | محتوا |
|---|---|---|
| `IC Approvals` (گروه خصوصی) | MANAGER, ADMIN | درخواست‌های REVIEW/CRITICAL، سفارش تعمیر، تماس با Lead |
| `IC Alerts` | MANAGER, ADMIN, OPERATIONS | EMERGENCY، خطاهای سیستم (WF-14)، تأخیر نظافت |
| چت خصوصی پرسنل | CLEANER/TECHNICIAN | فقط تسک‌های خودشان، بدون اطلاعات مهمان جز نام کوچک و زمان |

فقط `chat_id`/`user_id`های ثبت‌شده در `ic.staff` مجاز به کلیک‌اند؛ callback از کاربر ناشناس ← رد + `audit_log`.

## قالب پیام درخواست تأیید
```
🟠 REVIEW · AP-7F3K · expires 14:35
🏠 TEST – Berlin Unit 1 (P-BER-001)
📅 Res 880001 · 10.12 → 12.12 · Airbnb
👤 Max (only first name)

💬 Guest (EN):
"Can we check in at 11 am?"

🇮🇷 خلاصه فارسی:
مهمان درخواست ورود زودهنگام ساعت ۱۱ صبح دارد.

🤖 Suggested reply:
"Hi Max, thanks for your message! Early check-in depends on cleaning. We'll confirm by 9 am on your arrival day. – Your ImmoCare4U Team"

ℹ️ Reason: EARLY_CHECKIN requires decision (rule REV_EARLY_CHECKIN)
```
Inline keyboard: `[✅ Approve] [✏️ Edit] [🛑 Reject / Take over]`
callback_data: `ap:<approval_code>:approve|edit|reject` (حداکثر 64 بایت؛ بدون داده‌ی حساس).

## رفتار دکمه‌ها
| اقدام | منطق |
|---|---|
| **Approve** | `UPDATE approvals SET status='APPROVED', decided_by, decided_at WHERE approval_code=$1 AND status='PENDING' AND expires_at>now() RETURNING *` — اگر ردیفی برنگشت ← «قبلاً تصمیم گرفته شده/منقضی». بعد: conflict check (پاسخ جدید مدیر در Smoobu؟) → ارسال با `origin=AI_APPROVED` → ویرایش پیام Telegram به «✅ Sent by <name> 14:21». |
| **Edit** | Bot با `force_reply` می‌خواهد متن جدید ارسال شود؛ پاسخ مدیر ← پیش‌نمایش + `[Send edited] [Cancel]`؛ با تأیید ← `status='EDITED'`, `final_text` ← ارسال. |
| **Reject / Take over** | `status='TAKEN_OVER'`؛ هیچ ارسال خودکاری برای این گفتگو تا پیام بعدی مهمان؛ مدیر مستقیم در Smoobu پاسخ می‌دهد (و WF-02 آن را ثبت می‌کند). |

## انقضا و Escalation
| سطح | `expires_at` | یادآوری | پس از انقضا |
|---|---|---|---|
| REVIEW | 30 دقیقه (ساعات کاری) / 2 ساعت (شب) | 1× در نیمه‌ی زمان | `EXPIRED`، **بدون ارسال**؛ پیام به مدیر ارشد؛ گزینه‌ی ارسال پیام خنثی «we're checking» فقط اگر صراحتاً برای ملک فعال شده باشد |
| CRITICAL | 15 دقیقه | هر 5 دقیقه | `EXPIRED` + Escalation به ADMIN؛ هیچ ارسال |
| EMERGENCY | 2 دقیقه | فوری + تماس تلفنی (REQ-VERIFY) | Escalation زنجیره‌ای؛ پیام ایمنی ثابت طبق سیاست مصوب |
| REPAIR_ORDER / PURCHASE / LEAD_CONTACT | 24 ساعت | روزانه | `EXPIRED`، بدون اقدام |

## ردیابی
هر تصمیم: `approvals` (وضعیت، زمان، تصمیم‌گیرنده، متن نهایی) + `audit_log(actor=staff_id, action='APPROVAL_<STATUS>')`. گزارش هفتگی: میانگین زمان تصمیم، نرخ ویرایش (شاخص کیفیت AI)، نرخ انقضا.
