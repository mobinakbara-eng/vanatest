# Weekly system check (runbook for the scheduled Claude session)

Purpose: once a week, check the system like a support engineer would, then write a short report in Persian for the owner. The check covers:
- Is the system running?
- Was all data moved correctly?
- Did guests get correct answers?
- Was what the manager approved learned?

**Strictly read-only in production.** Never:
- change data, workflows, settings or secrets
- send messages to guests
- call `ic-send-*` functions

This check writes nothing anywhere (not even to the repository).
If something needs fixing, describe it and propose the fix. The owner decides.

Access (injected by the environment's network proxy; never print or ask for keys):
- Supabase SQL: `curl -sS -X POST https://api.supabase.com/v1/projects/bkqtruzcrypiudhgzmhs/database/query -H 'Content-Type: application/json' -d '{"query":"…"}'`
  Use only SELECT statements and `ic.health_check()`.
- n8n API: `curl -sS https://mobinakbara.app.n8n.cloud/api/v1/…` (GET only).
- Repository `mobinakbara-eng/vanatest`, folder `immocare4u-os/`.

Guest data is personal data. Never copy guest names, phone numbers or e-mail addresses into the report or the repository. Use booking numbers.

## 1. Automatic checks
`SELECT * FROM ic.health_check(168);` (last 7 days). Every FAIL/WARN goes into the report with its detail and the likely cause.

## 2. Scheduler and workflows
- `SELECT finished_at, status, summary FROM ic.automation_runs WHERE workflow='ic-tick' AND finished_at > now()-interval '7 days' ORDER BY run_id DESC LIMIT 20;`
  - Expected: about every 5 min, `errors` empty, `ms` well under 60,000.
- Gaps: longest gap between ic-tick runs in the 7 days (window function on `finished_at`). Report any gap over 15 min.
- `SELECT jobname, schedule, active FROM cron.job;`: `ic-tick` must be active, `*/5 * * * *`.
- n8n `GET /api/v1/workflows`:
  - must be active: WF-01, WF-04, WF-14
  - must be inactive: WF-05 (fallback), WF-02, WF-00
  - Report any new or changed workflow (name, `updatedAt`).
- n8n `GET /api/v1/executions?limit=250` (page with `cursor` to cover 7 days):
  - executions per workflow and status
  - extrapolate to a month and compare with the Starter quota (≈ 2,500)
  - list every error with workflow and node

## 3. Scheduled messages (data moved correctly)
For each reservation with a stay in the last 7 days, compare the plan with what happened:
- `SELECT * FROM ic.v_schedule_plan WHERE due_at BETWEEN greatest(now()-interval '7 days', (SELECT value::timestamptz FROM ic.settings WHERE key='LIVE_SINCE')) AND now()`
- against `ic.outbound_messages` (`origin='SCHEDULED'`, `idempotency_key = 'sched:<reservation>:<template>'`):
  - status
  - `sent_at` minus `due_at` (should be under 10 min)
  - `smoobu_response`
- Expected for every stay, in order: WELCOME, ARRIVAL_2D, ACCESS_PIN (12:00 on arrival day), CAFE_TIP (09:00 first morning), CHECKOUT_REMINDER, REVIEW_REQUEST.
- Report: missing, late, duplicate or BLOCKED messages, with reason.
- Never print the PIN. The stored body contains `{{PIN}}`; that is correct.

## 4. Quality of guest replies
For the last 7 days take every guest conversation with activity (`ic.messages` joined with `ic.outbound_messages` / `ic.approvals`). Judge each answer the system sent, or proposed at level 6. Maximum 40, newest first.
1. **Correct?** Compare with the knowledge base of THAT apartment (`ic.property_kb_entries` VERIFIED/UNVERIFIED) and the stay dates and times. Watch for:
   - wrong times
   - "enjoy your stay" on departure day
   - promises (refunds, late check-out, discounts other than the Einstein café partner offer)
2. **Privacy:** no other apartment, no other guest, no codes, no internal ids.
3. **Language and tone:** guest's language, polite, short.
4. **Level:** were urgent topics (lock-out, damage, refund, complaints) at level 1–3, and not auto-sent?
5. **Unanswered:** guest messages that got neither a reply nor a draft, or drafts that stayed PENDING > 3 h (`waiting_for_manager`).

Give each problem: booking number, short quote (no personal data), what was wrong, suggested fix (KB row, prompt rule or code).

## 5. Learning
- Approvals the manager approved:
  `SELECT a.approval_code, a.level, a.revision, a.decided_at FROM ic.approvals a WHERE a.status='APPROVED' AND a.level <> 'AUTO' AND a.decided_at > now()-interval '7 days';`
- Learned facts:
  `SELECT details, at FROM ic.audit_log WHERE action='KB_LEARNED' AND at > now()-interval '7 days';`
- For each approved reply: should it have produced a learned fact? (general rule = yes; one-off exception = no)
  - Report "should have been learned but was not", with a proposed fact text.
- Check every `learned_*` row (`SELECT property_id, key, value_text, source FROM ic.property_kb_entries WHERE key LIKE 'learned\_%'`):
  - general?
  - no personal data?
  - not contradicting other VERIFIED rows?
  - the same on both apartments when it is a team policy?
- List contradictions between rows of the knowledge base, e.g. an UNVERIFIED faq row vs a learned rule. Suggest which row to mark OUTDATED.

## 6. Security and limits
- No code or password in guest-visible knowledge (`kb_no_secrets` check).
- `SELECT name FROM vault.secrets;` should be `ic_proxy_token` only. Report new names; never read values.
- Database size (`database_size` check) against the Free plan (500 MB). Supabase Free has **no backups**, hence step 7.

## 7. Backup check
The knowledge backup is uploaded every Sunday 03:17 Berlin time by n8n **WF-06** to the owner's Google Drive folder "ImmoCare4U Backup".
- Check that WF-06 is active.
- Check that its last execution succeeded within the last 8 days: `GET /api/v1/executions?workflowId=<WF-06 id>&limit=3`.
- `SELECT length(ic.kb_snapshot())` must be > 10,000 characters.
- Report it if any of these is not true.

## 8. Report (Persian, short)
1. 🟢/🟡/🔴 overall status in one sentence.
2. «فوری» (only if any): what must be done today.
3. Short sections:
   - سیستم
   - پیام‌های زمان‌بندی‌شده
   - کیفیت جواب‌ها
   - یادگیری
   - امنیت
   - مصرف n8n
4. Proposed fixes as a numbered list (who does what).
5. Numbers of the week:
   - guest messages
   - replies sent automatically vs. approved
   - scheduled messages sent
   - facts learned

Deliver the report only as your final message (it reaches the owner as a notification). Do not write to the repository.
