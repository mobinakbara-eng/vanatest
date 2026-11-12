# G. Management Dashboard Specification

**فناوری پیشنهادی (PLANNED):** Metabase یا Grafana (self-hosted، EU) متصل به PostgreSQL با نقش فقط‌خواندنی `ic_reporting` — بدون کدنویسی Frontend در فاز ۶. ورود با SSO/۲FA؛ نقش‌ها: ADMIN (همه)، MANAGER (بدون جزئیات قرارداد مالکان)، ACQUISITION (فقط Leads).

**فیلترهای سراسری:** شهر، ملک، مدل همکاری، بازه‌ی زمانی، کانال. همه‌ی زمان‌ها Europe/Berlin.

| بخش | KPI | تعریف | منبع | دوره |
|---|---|---|---|---|
| Overview | Active properties | `op_status='ACTIVE'` | properties | لحظه‌ای |
| | Available tonight | ACTIVE بدون رزرو شامل امشب | properties, reservations | لحظه‌ای |
| | Current guests | رزرو CONFIRMED/MODIFIED که `check_in_at ≤ now < check_out_at` | reservations | لحظه‌ای |
| | Today's check-ins / outs | `arrival = today` / `departure = today` | reservations | امروز |
| | Pending approvals | `approvals.status='PENDING'` به تفکیک سطح | approvals | لحظه‌ای |
| | Open incidents | tickets ≠ CLOSED | maintenance_tickets | لحظه‌ای |
| | Cleaning tasks | امروز به تفکیک وضعیت؛ Ready فقط `v_unit_readiness.is_ready` | cleaning_tasks | امروز |
| Financial | Gross booking revenue | Σ `BOOKING_REVENUE` ACTUAL | financial_entries | ماه/سال |
| | Net operating revenue | Gross − platform fees − revenue share | financial_entries | ماه |
| | Operating profit | Σ همه دسته‌ها (ACTUAL)؛ **ESTIMATE در ستون جدا** | financial_entries | ماه |
| | Revenue by property / city | group by | financial_entries ⨝ properties | ماه |
| Operations | Delayed cleaning | `status='DELAYED'` یا `now > deadline` بدون DONE | cleaning_tasks | لحظه‌ای |
| | Access delivery status | grants برای ورودهای ۴۸h آینده به تفکیک وضعیت | access_grants | لحظه‌ای |
| | Unanswered guest messages | آخرین پیام گفتگو INBOUND و > 15 دقیقه | messages | لحظه‌ای |
| | Failed automations | DLQ باز + runs FAILED | dead_letter_events, automation_runs | ۲۴h |
| Acquisition | New / Qualified leads | `status='NEW'` / `grade='A'` | leads | هفته |
| | Pipeline | count by `pipeline_stage` | leads | لحظه‌ای |
| | Under legal review | `pipeline_stage='LEGAL_REVIEW'` | leads | لحظه‌ای |
| AI Performance | Total guest messages | INBOUND GUEST | messages | روز/هفته |
| | Auto-resolved | تعریف در KPI «Auto-resolution rate» | outbound_messages | هفته |
| | Requiring approval | approvals GUEST_REPLY | approvals | هفته |
| | Emergency escalations | classifications EMERGENCY | message_classifications | ماه |
| | Avg/median response time | پاسخ اول − پیام مهمان | messages | روز |
| | AI accuracy (audited) | از جدول نمونه‌ی ممیزی (Phase 2: `ic.ai_audit_samples`) | audit | هفته |
| | Delivery failure rate | outbound FAILED ÷ (SENT+FAILED) | outbound_messages | هفته |

**قواعد نمایش:** هر کارت KPI منبع و زمان آخرین به‌روزرسانی را نشان می‌دهد؛ داده‌ی ESTIMATE با برچسب «تخمینی»؛ شهر بدون واحد ACTIVE «بازار هدف» نمایش داده می‌شود نه «فعال».
