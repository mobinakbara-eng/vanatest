# Brand Constellation — موتور سوشال مدیا

یک پیج اصلی و چند **پیج ماهواره‌ای رسمی** برای هر بیزینس. هر پست اصلی، بعد از چند ساعت تا یک روز، با نسخه‌های متفاوت روی پیج‌های ماهواره‌ای هم منتشر می‌شود و پیج اصلی تگ یا collab می‌شود. ایده‌ها از ترندها پیدا می‌شوند، محتوا با AI ساخته می‌شود، و آنالیز نتایج روی انتخاب ایده‌ها و ساعت انتشار بعدی اثر می‌گذارد.

```
۷ صبح   scout ← ideate ← plan        (ترند ← ایده‌ی امتیازدار ← پست اصلی + نسخه‌های ماهواره‌ای)
هر ساعت publish                        (پست‌های تأییدشده ← Postiz ← API رسمی اینستاگرام و تیک‌تاک)
هر ۶ ساعت collect ← report             (ویو، سیو، شیر ← چه قلاب، فرمت، موضوع و ساعتی جواب داده)
```

## چرا این مدل امن است (خلاصه‌ی قوانین)

| قانون پلتفرم | سیستم چطور رعایتش می‌کند |
|---|---|
| Meta و TikTok با **شبکه‌ی اکانت‌هایی که هویتشان را پنهان می‌کنند** و **انگیجمنت مصنوعی** برخورد می‌کنند. داشتن چند اکانت به‌خودی‌خود ممنوع نیست. | هر پیج ماهواره‌ای باید در بیو بگوید متعلق به برند است. بدون این، `config.py` اصلاً اجرا نمی‌شود. |
| TikTok اتوماسیون انبوه اکانت و پست تجاری پرحجم را ممنوع کرده است. | سقف روزانه برای هر پیج، فاصله‌ی حداقل ۹۰ دقیقه بین پیج‌ها، ساعات سکوت، و فقط ۱ تا ۳ ماهواره برای هر پست. |
| هر دو پلتفرم محتوای تکراری و کپی را پایین‌تر رتبه‌بندی می‌کنند. | AI برای هر پیج قلاب، زاویه، کپشن و دستور تدوین جداگانه می‌سازد، نه کپی پست اصلی. |
| لایک، کامنت یا فالو بین اکانت‌های خودی انگیجمنت فیک حساب می‌شود. | کد هیچ لایک، کامنت یا فالویی انجام نمی‌دهد. فقط محتوای خود هر پیج را منتشر می‌کند. |
| انتشار فقط از API رسمی مجاز است. | Instagram Graph API (حداکثر ۵۰ پست API در ۲۴ ساعت برای هر اکانت، پارامتر `collaborators` برای Reels) و TikTok Content Posting API (تا audit نشود فقط پست private ممکن است). هر دو از طریق Postiz. |

## راه‌اندازی

```bash
pip install -r requirements.txt
cp config/brands.example.yaml config/brands.yaml   # بیزینس‌ها و پیج‌ها را پر کنید
export ANTHROPIC_API_KEY=...        # تولید ایده و محتوا
export POSTIZ_API_KEY=...           # وقتی provider: postiz است
export IG_ACCESS_TOKEN=...          # آنالیز اینستاگرام

python -m engine.cli scout
python -m engine.cli ideate
python -m engine.cli plan           # پیش‌نویس می‌سازد. بعد از بررسی، --approve
python -m engine.cli publish        # در حالت dryrun خروجی در data/outbox
python -m engine.cli collect        # اینستاگرام. برای تیک‌تاک: --csv export.csv
python -m engine.cli report
```

**n8n:** فایل `n8n/brand-constellation.workflow.json` را import کنید. مسیر `/opt/social-engine` را با محل نصب خودتان عوض کنید.

## قبل از روشن کردن انتشار واقعی

1. **Postiz** را نصب کنید (self-hosted رایگان است) و همه‌ی پیج‌ها را به آن وصل کنید. شناسه‌ی هر integration را در `brands.yaml` بگذارید.
2. اسم فیلدهای `engine/publisher.py` را با مستندات Public API نسخه‌ی Postiz خودتان تطبیق دهید. (`docs.postiz.com` از این محیط در دسترس نبود.)
3. برای انتشار عمومی در تیک‌تاک، اپ Postiz یا اپ خودتان باید audit تیک‌تاک را پاس کرده باشد.
4. پیج‌های جدید را اول دستی و آرام گرم کنید: چند هفته محتوای مخصوص خود آن پیج، قبل از اینکه وارد چرخه شوند.
5. ویدیوها را خودتان فیلم بگیرید یا با ابزار AI بسازید. موتور اسکریپت و دستور تدوین را می‌دهد. فایل مدیا در `payload.media` قرار می‌گیرد.

## منابع

- [Meta — Inauthentic Behavior](https://transparency.meta.com/policies/community-standards/inauthentic-behavior)
- [TikTok — Integrity and Authenticity](https://www.tiktok.com/community-guidelines/en/integrity-authenticity/)
- [Instagram Content Publishing API](https://developers.facebook.com/docs/instagram-platform/content-publishing/)
- [IG content_publishing_limit](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit)
- [TikTok Content Posting API — Direct Post](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- [n8n: TikTok/Instagram trend videos](https://n8n.io/workflows/15203-automate-tiktok-and-instagram-trend-videos-with-claude-seedance-20-and-blotato/)
- [n8n: Reddit/Google trends → social content](https://n8n.io/workflows/3560)
- نمونه‌ی برندهای چندپیجی (Netflix، Duolingo): [SocialPilot](https://www.socialpilot.co/blog/why-brands-need-multiple-social-media-account)، [Single Grain](https://www.singlegrain.com/blog/ms/instagram-marketing-strategy/)
