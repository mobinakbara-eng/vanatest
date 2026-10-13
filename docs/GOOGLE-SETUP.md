# Google: Search Console و Business Profile

## ۱. Google Search Console (حدود ۵ دقیقه)

1. برو به https://search.google.com/search-console و با Gmail شرکت وارد شو.
2. **Add property** ← نوع **Domain** ← بنویس `vana-management.com` ← Continue.
3. گوگل یه رکورد TXT نشون می‌ده. شکلش این‌طوریه: `google-site-verification=…`
   - یا: کل این خط رو کپی کن و تو چت بفرست. این کد مخفی نیست و من تو Cloudflare اضافه‌ش می‌کنم.
   - یا: اگه گوگل دکمهٔ **«Verify with Cloudflare»** نشون داد، بزنش و با حساب Cloudflare وارد شو.
4. بعد از تأیید: منوی **Sitemaps** ← بنویس `sitemap.xml` ← Submit.
5. منوی **URL Inspection** ← `https://vana-management.com/` ← **Request indexing**.

> Bing: تو https://www.bing.com/webmasters گزینهٔ «Import from Google Search Console» رو بزن تا همه‌چیز خودکار منتقل بشه.
> IndexNow (که Bing و چند موتور جستجوی دیگه ازش استفاده می‌کنن) قبلاً از طرف سایت فرستاده شده.

## ۲. Google Business Profile

**قبل از شروع، یه تصمیم مهم:**
- اگه **Wöhlertstr. 4** دفتر واقعیه که مشتری می‌تونه بیاد، آدرس رو نشون بده.
- اگه فقط آدرس ثبت شرکته و مشتری اونجا نمیاد، **«I deliver goods and services to my customers»** رو انتخاب کن و آدرس رو **مخفی** کن (Service-area business). در غیر این صورت گوگل ممکنه پروفایل رو تعلیق کنه.

1. برو به https://business.google.com/create
2. هر چیزی که در ادامه آماده کردم رو کپی کن.
3. احراز هویت: گوگل معمولاً یه **ویدیوی کوتاه** می‌خواد (تابلوی شرکت، ابزار کار، مدرک ثبت شرکت). گاهی هم کارت پستی می‌فرسته.

### متن‌های آماده (کپی کن)

**Unternehmensname** (فقط اسم، بدون کلمهٔ اضافه، وگرنه گوگل تعلیقش می‌کنه):
```
VANA Management
```

**Kategorie:** تو فیلد بنویس `Trockenbau` و گزینه‌ای که گوگل پیشنهاد می‌ده رو به‌عنوان دستهٔ اصلی انتخاب کن. دسته‌های اضافه: هر چیزی که با `Renovierung`، `Sanierung` یا `Innenausbau` پیدا شد.

**Einzugsgebiet:**
```
Berlin
```
(اگه کار تو اطراف برلین هم انجام می‌دید: Potsdam و بقیهٔ شهرهای نزدیک رو هم اضافه کن)

**Website:**
```
https://vana-management.com/
```

**Unternehmensbeschreibung** (حداکثر ۷۵۰ کاراکتر):
```
VANA Management saniert und baut Wohnungen, Altbauten und Gewerbeflächen in Berlin aus. Wir übernehmen Komplett- und Teilsanierungen, Innenausbau sowie Trockenbau: neue Raumaufteilungen mit Ständerwänden, abgehängte Decken, Vorsatzschalen, Dachgeschossausbau, Spachtel- und Malerarbeiten sowie Böden. Sie haben einen festen Ansprechpartner – von der Besichtigung vor Ort über das schriftliche Angebot mit Leistungsbeschreibung und Bauzeit bis zur gemeinsamen Abnahme. Wir arbeiten sauber und rücksichtsvoll, auch in bewohnten Wohnungen. Anfragen gerne über das Kontaktformular auf unserer Website oder per E-Mail an info@vana-management.com.
```

**Leistungen** (jeweils als eigene Leistung eintragen):
```
Komplettsanierung von Wohnungen
Altbausanierung
Bad- und Küchensanierung
Innenausbau
Trockenbauwände und Raumteiler
Abgehängte Decken
Vorsatzschalen und Installationswände
Dachgeschossausbau
Spachtelarbeiten (Q1–Q4)
Malerarbeiten
Bodenbeläge
Schall- und Brandschutz im Trockenbau
```

**Öffnungszeiten:** ساعت کاری واقعی (مثلاً Mo–Fr 8:00–17:00). ساعت نادرست ننویس.

**Telefon:** اگه شماره هست حتماً بذار. همین شماره باید روی سایت هم باشه (بفرست تا اضافه‌ش کنم).

**Fotos:** لوگو (`public/assets/img/apple-touch-icon.png`) و چند عکس واقعی از پروژه‌ها. حداقل ۵ عکس، عکس استوک نذار.

### بعد از تأیید
- بعد از هر پروژه از مشتری بخواید نظر بده (لینک نظر رو از داخل پروفایل کپی کنید).
- به همهٔ نظرها جواب بدید، چه مثبت چه منفی.
- هر ماه یه پست (Update) با عکس یه پروژه بذارید.
