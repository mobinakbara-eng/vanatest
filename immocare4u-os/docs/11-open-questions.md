# سؤال‌های باز — دفعه‌ی بعد از مالک بپرس (ثبت: 2026-11-04)

> درخواست مالک: «این سؤال‌ها را نگه دار، دفعه‌ی بعد بپرس.» (Q12 جواب داده شد: ویدیوها با لینک، نه WhatsApp)

| # | ملک | سؤال |
|---|---|---|
| Q1 | Loft (P-BER-001) | آدرس دقیق Loft — همان Geschwister-Scholl-Straße 5؟ |
| ✅ Q2 | همه | جواب داده شد (2026-11-04): هر واحد صندوق جدا دارد. کدها باید در Supabase Secrets با نام `IC_PIN_P_BER_001` و `IC_PIN_P_BER_002` وارد شوند (توسط مالک) |
| Q3 | همه | پین روز ورود چه ساعتی خودکار فرستاده شود؟ |
| ✅ Q4 | Loft | رمز روی برگه‌ای جلوی تلویزیون است؛ به مهمان فقط محل برگه گفته می‌شود |
| ✅ Q5 | City | رمز روی برگه‌ای جلوی تلویزیون است (اسم شبکه هنوز نامعلوم، اختیاری) |
| Q6 | همه | لینک ویدیوهای ورودی — کجا ذخیره هستند؟ |
| Q7 | همه | لینک عکس‌های آپارتمان‌ها |
| Q8 | همه | قوانین: سیگار؟ زباله و تفکیک (سطل‌ها کجا هستند)؟ |
| Q9 | City | حداکثر مهمان و تخت‌ها |
| Q10 | همه | گرمایش / آب گرم: مراحل ساده‌ی رفع مشکل |
| Q11 | همه | شماره‌ی اضطراری تیم برای مهمان |
| — | n8n | Credential `IC Gmail` (immocare4u.kontakt@gmail.com) |
| ✅ | n8n | Credential `IC Anthropic` ساخته شد (2026-11-04، Claude Haiku 5.5) — کلید اول (بدون Workspace) را در Console حذف کنید |
| — | اکسل | بازبینی ردیف‌ها و OK کردن |

## Update 12.11.2026 (from the Airbnb listings / owner)
- Answered: City max guests = 4 (double bed + sofa bed); team phone +49 170 2327351 (in KB, may be given to guests);
  house rules identical for both apartments (no parties/events, quiet hours 22:00, noise sensor dB only, check-in 15–22).
- Still open:
  - ~~Loft max guests~~ → answered 12.11.2026: **6** (rows saying 8 / folding beds marked OUTDATED).
  - ~~Check-in window~~ → answered 12.11.2026: **15:00–22:00 for both** (City Airbnb listing text "any time" should be aligned).
  - Team phone = the number on immocare4u.com (+49 170 2327351, phone + WhatsApp) – confirmed 12.11.2026.
  - Smoobu automatic messages (welcome with Loft "lower box"/"code 2 days before", farewell 14:00) → owner turns them off
    in Smoobu; then re-enable our WELCOME and REVIEW_REQUEST (`UPDATE ic.property_message_schedules SET enabled = true
    WHERE template_code IN ('WELCOME','REVIEW_REQUEST')`).
