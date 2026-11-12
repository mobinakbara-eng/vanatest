# Guest Automation v2: شش سطح ریسک، یادگیری از تأییدها، ارسال خودکار

> درخواست مالک: 2026-11-04 · وضعیت: **PLANNED، منتظر تأیید چند تصمیم (پایین سند)**
> تا تأیید صریح مالک، Smoobu **فقط‌خواندنی** می‌ماند (تصمیم 2026-11-04). همه‌ی ارسال‌ها پیش‌نویس هستند و به ایمیل مدیر می‌روند.

## ۱. شش سطح (جایگزین AUTO/REVIEW/CRITICAL/EMERGENCY)

| سطح | نام | چه کسی پاسخ می‌دهد | نمونه‌ها | نگاشت به سطح قبلی |
|---|---|---|---|---|
| **1** | Emergency | **فقط انسان**: هشدار فوری ایمیل + پیام ایمنی ثابت (۱۱۲/۱۱۰) | آتش، دود، گاز، نشت شدید آب، خطر جانی، پزشکی | EMERGENCY |
| **2** | Critical | **فقط انسان**: AI فقط خلاصه و پیشنهاد می‌دهد | Refund، تخفیف و غرامت، تهدید حقوقی، خسارت جدی، گم‌شدن کلید، کد کار نمی‌کند، اختلاف با همسایه | CRITICAL |
| **3** | Decision | AI پیش‌نویس می‌نویسد ← **ارسال فقط با تأیید ایمیلی** | ورود زودتر، خروج دیرتر، تغییر رزرو، مهمان یا حیوان اضافه، شکایت نظافت | REVIEW |
| **4** | Unknown | AI پیش‌نویس می‌نویسد ← **تأیید** ← قابل ذخیره به‌عنوان پاسخ استاندارد | سؤالی که جوابش در اکسل نیست، رفع ایراد وسایل | REVIEW |
| **5** | Scheduled & access | **خودکار** با قواعد سخت‌گیرانه | ویدیوی ورودی و قوانین ۲ روز قبل، پین قفل در زمان مجاز | (جدید) |
| **6** | FAQ | **خودکار** از اکسل همان آپارتمان | Wi-Fi، پارکینگ، ساعت ورود و خروج، عکس آپارتمان، حمل‌ونقل | AUTO |

قانون ثابت: Rule Engine حداقلِ سطح را تعیین می‌کند و AI فقط می‌تواند پیام را به سطح خطرناک‌تر (عدد کمتر) ببرد.

## ۲. حلقه‌ی یادگیری (اکسل ← تأیید ← اکسل)

```
Guest question ─► level 3/4 ─► email to manager with 3 actions:
      [Send]   [Edit & send]   [Send + save as standard answer]
                                        │
                                        ▼
        Sheet "KB" new row (property_id, question pattern, answer DE/EN,
        level 6, approved_by, date, source = approval AP-xxxx)
                                        │
        next similar question for THIS apartment ─► level 6 ─► automatic
```

محافظت‌ها:
* فقط دکمه‌ی سوم پاسخ را ذخیره می‌کند. تأیید معمولی هیچ چیزی به اکسل اضافه نمی‌کند.
* پاسخ‌هایی که این موارد را دارند **هرگز** ذخیره نمی‌شوند (فیلتر خودکار): وعده‌ی مالی، کد یا پین، نام یا اطلاعات شخصی مهمان، تاریخ‌های خاص یک رزرو.
* هر ردیف فقط برای **همان آپارتمان** معتبر است، مگر اینکه مدیر ستون `scope = ALL` را بزند.
* سطح‌های 1 و 2 هیچ‌وقت ذخیره نمی‌شوند.

## ۳. پیام‌های خودکار سطح ۵

| زمان (قابل تنظیم برای هر آپارتمان) | محتوا | شرط |
|---|---|---|
| بعد از رزرو | خوشامد | رزرو تأییدشده |
| **۲ روز قبل از ورود** | ویدیوی ورودی، قوانین خانه، آدرس | رزرو فعال، تاریخ تغییر نکرده |
| روز ورود، X ساعت قبل از Check-in | **پین قفل** | رزرو فعال + پنجره‌ی زمانی + پین از Secret Store یا API قفل (هرگز ساخته‌ی AI نیست) + هر رزرو فقط یک بار |
| شب قبل از خروج | یادآوری خروج و تحویل کلید | — |
| بعد از خروج | درخواست نظر | — |

لغو یا تغییر رزرو ← پیام‌های آینده خودبه‌خود لغو می‌شوند. اگر پین قبلاً ارسال شده باشد، ایمیل هشدار به مدیر می‌رود.

## ۴. موارد REQ-VERIFY
| موضوع | وضعیت |
|---|---|
| **پذیرش رزرو (Accept)** | در API عمومی Smoobu که خواندیم، endpointی برای پذیرش درخواست رزرو Airbnb یا Booking دیده نشد. پذیرش در خود پلتفرم انجام می‌شود. جایگزین: Instant Booking در کانال‌ها، یا ایمیل فوری به مدیر برای هر درخواست. |
| ارسال عکس و فایل | API فقط متن می‌فرستد (`subject`, `messageBody`) ← به‌جای فایل، **لینک** گالری یا ویدیو فرستاده می‌شود. باید بررسی شود Airbnb و Booking لینک را حذف نکنند. |
| قفل | نوع قفل (پین ثابت یا پین جدا برای هر رزرو با API) هنوز مشخص نیست. |

## ۵. ترتیب فعال‌سازی پیشنهادی
1. **Shadow (۲ هفته):** همه‌ی پیام‌های واقعی خوانده می‌شوند. برای هر پیام، طبقه‌بندی و پیش‌نویس به ایمیل می‌رود و **هیچ چیزی به مهمان ارسال نمی‌شود**. اکسل در این مدت با دکمه‌ی «ذخیره» پر می‌شود.
2. **سطح ۶ خودکار** برای یک آپارتمان، فقط با اجازه‌ی کتبی مالک.
3. **سطح ۳ و ۴ با تأیید ایمیلی** (ارسال واقعی).
4. **سطح ۵** (ویدیو، قوانین و در آخر پین)، بعد از تست قفل.

## Learning loop (EXISTING since 08.11.2026, tested live)

When the manager presses **«تأیید و ارسال»**, the confirm page shows a checkbox, **«🧠 یاد بگیر»** (on by default).
If the checkbox is on, WF-04 does this after sending:

1. **Learn context**: loads the guest message, the approved text and **all** manager instructions of the edit chain (one-time token required).
2. **Claude learn** (Haiku, about 1 small call): extracts at most ONE general, reusable fact in English. It is based only on the approved reply and the manager's instructions. The guest text is untrusted context.
   - No guest names, dates or booking details.
   - `learnable=false` for one-off exceptions, refunds or compensation, pure thanks, and facts that are already known.
3. **Guard** (code): blocks the fact if it contains:
   - 4+ digit numbers (codes; times like 11:00 are allowed)
   - the words code, PIN or password
   - phone numbers, e-mail addresses or links
   - the name or ID of another apartment
   - money concessions
4. **Save**: `ic.property_kb_entries`, key `learned_<topic>`, VERIFIED, PUBLIC_GUEST, source `Freigabe AP-xxx`.
   - Claude also returns a `scope`:
     - `ALL_UNITS` (owner decision 08.11.2026: "the rules are the same for both apartments"): team policies and house rules (check-in/out, late check-out, cleaning, quiet hours, smoking, pets…) are stored for **every** apartment.
     - `THIS_UNIT`: facts about the apartment itself (Wi-Fi, key box, equipment, heating, door) stay with that apartment only. When in doubt, `THIS_UNIT`. A fact that names the apartment is always `THIS_UNIT`.
   - Overwrites only existing `learned_*` rows, never manually maintained facts.
   - Written to the audit log as `KB_LEARNED`.
5. **E-mail «🧠 یاد گرفتم»** to the manager, with the fact in Persian and English.

Effect on drafting:
- The system prompt treats `learned_*` facts as authoritative standing rules.
- If a decision question (floor 3, e.g. LATE_CHECKOUT) is answered from a verified `learned_*` fact, the level becomes **6** with flag `LEARNED_RULE`, so no approval is needed.
- Levels 1–2 (emergency, refund and similar) are never lowered.

First learned fact (from AP-3RP2V; added to P-BER-001 and, by owner decision, also P-BER-002): `learned_late_checkout`, "Check-out is due by 11:00 and a later check-out is not possible because the cleaning team arrives after 11:00…".

Live test with a new synthetic question ("check out at 1 pm?"): level 6, flag LEARNED_RULE, polite refusal with the reason.

To remove or correct a learned fact, delete or update the row in `ic.property_kb_entries`. Claude can do this on request.

## Go-live (11.11.2026, owner: "the trial is over")

Kill switch: `ic.settings.LIVE_SENDING` (`on` / `off`). With `off`, nothing is sent automatically. Replies the manager approves by e-mail are always sent.

| What | When | How |
|---|---|---|
| Scheduled messages (welcome, arrival info + video, key-box PIN 12:00, café tip 09:00 first morning, check-out reminder, review request) | WF-01, every 30 min | Edge function `ic-send-scheduled` |
| Level-6 replies | Next WF-01 run after the e-mail (10–100 min after the draft) | WF-01 "Due auto replies" → `ic-send-approved` |
| Levels 3–4 | Only after «✅ تأیید و ارسال» | `ic-send-approved` |
| Levels 1–2 | Never automatic | Manager replies personally |

Safety in `ic-send-scheduled`:
- The text is taken from the database, never from the request.
- Rows older than 3 h are never sent, so there is no backlog after an outage.
- The booking is checked live in Smoobu before sending: it must exist, not be cancelled or blocked, and have the same apartment and dates.
- The PIN is inserted only inside Supabase, from 12:00 on arrival day until departure, and is redacted from stored responses.
- Missing video or an unfilled placeholder means the message is not sent.
- `dry_run: true` runs every check without sending.

Safety for level 6 (auto replies):
- Only the first version is sent automatically; corrected versions always need approval.
- Only if nothing new happened in the conversation since the draft (no newer guest or host message).
- Only one draft per conversation: for the latest guest message.

Last-minute bookings: arrival info and PIN are sent 10 min after the booking if their normal time has already passed.

Partner offer: KB `offer_einstein_cafe` (both apartments). The money guard allows exactly this offer sentence.

## Fewer n8n executions (11.11.2026)

The scheduler moved from n8n to Supabase. **Supabase Edge Function `ic-tick`** runs every 5 min, which costs no n8n executions. It does:
- the Smoobu sync (read-only; bookings within the next 7 days every tick, the rest every 30 min)
- approval expiry
- level-6 auto replies after the 15-min stop window
- scheduled messages at their time (± 5 min)

It wakes **n8n WF-01** only when there is work: a guest message that needs an AI draft (each message at most every 15 min), or a report e-mail. WF-01 also has a daily 07:50 health check that alerts if `ic-tick` has not run for 30 min.

All SQL and transformation code for `ic-tick` is generated from the same tested sources (`_shared/ic-generated.mjs`, written by `n8n/build-workflows.js`).

Timer: **pg_cron job `ic-tick`, every 5 min** (`db/ops/ic_tick_cron.sql`; token in Supabase Vault `ic_proxy_token`).
- Active since 11.11.2026 20:50 UTC; first run HTTP 200.
- WF-05 (n8n 30-min fallback) is **deactivated**, not deleted. Re-activate it only if pg_cron fails.

WF-20 / WF-21 (acquisition, built separately): on 11.11.2026 17:53 the frequent triggers of WF-20 were disabled by its owner. Each now runs once a day (≈ 30 executions/month each). Left unchanged.

Estimated n8n executions per month:

| | Before | With WF-05 (interim) | With pg_cron |
|---|---|---|---|
| Timer | 1,440 | 1,440 | 0 |
| WF-01 woken for drafts / reports | — | ≈ 300–450 | ≈ 300–450 |
| Daily health check | — | 30 | 30 |
