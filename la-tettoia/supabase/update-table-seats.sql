-- One-off update for an already deployed database (2026-10):
-- tables 1–4 now seat 6 guests, tables 5–8 seat 4 guests.
-- Run once in the Supabase SQL editor. Existing reservations are not touched.
drop policy if exists guest_books on public.reservations;
create policy guest_books on public.reservations for insert to anon
  with check (
    status = 'pending'
    and date between (now() at time zone 'Europe/Berlin')::date
                 and (now() at time zone 'Europe/Berlin')::date + 90
    and date + time >= (now() at time zone 'Europe/Berlin') + interval '1 hour'
    and extract(isodow from date) <> 1
    and time between time '16:00' and time '22:00'
    and extract(minute from time) in (0, 30)
    and extract(second from time) = 0
    and table_id in ('1','2','3','4','5','6','7','8')
    and guests between 1 and case when table_id in ('5','6','7','8') then 4 else 6 end
    and length(trim(name)) between 1 and 120
    and length(trim(phone)) between 3 and 40
    and length(trim(email)) between 3 and 160
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and length(coalesce(notes, '')) <= 1000
  );
